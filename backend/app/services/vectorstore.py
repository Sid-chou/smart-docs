"""
vectorstore.py — MongoDB Atlas Vector Search backend.

Why we migrated from ChromaDB:
  ChromaDB used PersistentClient(path="./chroma_db") — a local folder on the
  Render container disk. Render's disk is ephemeral: every deploy, crash, or
  restart wipes it. All indexed chunks were silently lost on redeploy, causing
  every RAG query to return "I don't have enough information."

  MongoDB Atlas Vector Search is:
  - Free on the M0 tier (already in use)
  - Fully persistent — data lives in Atlas, not on the Render container
  - No extra dependencies — motor/pymongo already in requirements.txt

Atlas setup required (one-time, free):
  1. In Atlas UI → your cluster → Search Indexes → Create Search Index
  2. Choose "Atlas Vector Search" (NOT "Atlas Search")
  3. Database: smartdocs   Collection: chunks
  4. Paste this JSON definition:
     {
       "fields": [
         {
           "type": "vector",
           "path": "embedding",
           "numDimensions": 3072,
           "similarity": "cosine"
         },
         { "type": "filter", "path": "user_id" },
         { "type": "filter", "path": "document_id" }
       ]
     }
  5. Index name: vector_index
  6. Save — takes ~1 minute to build.

  numDimensions must match your embedding model output:
    gemini-embedding-001  → 3072
    text-embedding-3-small → 1536
"""

from __future__ import annotations

import logging
from typing import List, Optional, Dict, Any

from app.core.database import get_database
from app.services.embeddings import get_embeddings

# ── Logger ───────────────────────────────────────────────────────────────────

logger = logging.getLogger("smartdocs.vectorstore")

# ── Collection name ──────────────────────────────────────────────────────────

CHUNKS_COLLECTION = "chunks"
VECTOR_INDEX_NAME = "vector_index"

# Minimum cosine similarity to accept a chunk as relevant.
# Lowered from 0.3 → 0.2 so borderline matches are not silently dropped.
# If you raise this and get fewer results, lower it first before debugging
# the index.
SCORE_THRESHOLD = 0.2


# ── Internal helpers ─────────────────────────────────────────────────────────

def _get_collection():
    """Return the Motor collection for chunks (sync-safe accessor)."""
    return get_database()[CHUNKS_COLLECTION]


def _get_mongo_client():
    import pymongo
    return pymongo.MongoClient(_get_mongo_url())


def _get_mongo_url() -> str:
    from app.core.config import settings
    return settings.mongodb_url


def _get_db_name() -> str:
    from app.core.config import settings
    return settings.database_name


def _col():
    """Return a synchronous pymongo Collection for the chunks collection."""
    return _get_mongo_client()[_get_db_name()][CHUNKS_COLLECTION]


# ── Public API ───────────────────────────────────────────────────────────────

def index_document_chunks(
    chunks: List[str],
    document_id: str,
    user_id: str,
    filename: str,
) -> None:
    """
    Generate embeddings and write chunk documents to MongoDB Atlas.

    Multi-tenant safety:
      ALL inserts tag user_id. Retrieval MUST filter on user_id so that
      user B cannot see chunks from user A's documents.

    document_id is stored as a plain STRING (not ObjectId) so that the
    $vectorSearch pre-filter comparison ("$eq": string) matches exactly.
    Do not cast to ObjectId here — keep it consistent with retrieval.
    """
    if not chunks:
        logger.warning("[INDEX] No chunks to index for document_id=%s", document_id)
        return

    logger.info(
        "[INDEX] Starting embedding for document_id=%s user_id=%s chunk_count=%d",
        document_id, user_id, len(chunks),
    )

    embeddings = get_embeddings(chunks)

    # ── Embedding dimension audit ────────────────────────────────────────────
    if embeddings:
        dim = len(embeddings[0])
        logger.info(
            "[INDEX] Embedding dimensions=%d (expected 3072 for gemini-embedding-001, "
            "1536 for text-embedding-3-small). If this is wrong your vector index "
            "numDimensions will not match and $vectorSearch will always return 0 results.",
            dim,
        )
    else:
        logger.error("[INDEX] Embedding service returned EMPTY list — no vectors to store.")
        return

    # document_id stored as STRING — must match retrieval filter type exactly
    docs = [
        {
            "document_id": document_id,   # str, NOT ObjectId
            "user_id":     user_id,        # str, NOT ObjectId
            "filename":    filename,
            "chunk_index": i,
            "text":        chunk,
            "embedding":   embedding,
        }
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]

    col = _col()
    if docs:
        result = col.insert_many(docs)
        logger.info(
            "[INDEX] Inserted %d chunks into collection='%s' for document_id=%s",
            len(result.inserted_ids), CHUNKS_COLLECTION, document_id,
        )


def retrieve_chunks(
    query: str,
    user_id: str,
    document_id: Optional[str] = None,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Semantic search via Atlas $vectorSearch aggregation.

    Returns chunks sorted by relevance (cosine similarity), filtered to
    the requesting user's documents only.

    DEBUG LOGGING — visible in Render log stream:
      [RETRIEVE] logs show each step so you can pinpoint exactly where
      results drop to zero without needing shell access.
    """
    from app.services.embeddings import get_query_embedding

    # ── Step 1: Embed the query ──────────────────────────────────────────────
    logger.info("[RETRIEVE] Raw query: %r", query)

    query_embedding = get_query_embedding(query)

    logger.info(
        "[RETRIEVE] Query embedding produced: vector_length=%d "
        "(must equal numDimensions in your Atlas vector index)",
        len(query_embedding),
    )

    if not query_embedding:
        logger.error("[RETRIEVE] Query embedding is EMPTY — aborting retrieval.")
        return []

    # ── Step 2: Build the pre-filter ────────────────────────────────────────
    #
    # CRITICAL: document_id MUST be compared as the same type it was stored.
    # During indexing we store document_id as a plain str (MongoDB ObjectId
    # string representation, e.g. "6a52ae1044...").
    # The $vectorSearch pre-filter must also receive a str — NOT an ObjectId.
    # If types differ, Atlas returns 0 results silently.
    #
    pre_filter: Dict[str, Any] = {"user_id": {"$eq": user_id}}
    if document_id:
        # Explicitly keep as str — do NOT cast to ObjectId
        pre_filter["document_id"] = {"$eq": str(document_id)}
        logger.info(
            "[RETRIEVE] document_id filter: value=%r type=%s "
            "(stored type during index: str — must match)",
            document_id, type(document_id).__name__,
        )
    else:
        logger.info("[RETRIEVE] No document_id filter — searching ALL user documents.")

    # ── Step 3: Build and log the pipeline ──────────────────────────────────
    pipeline = [
        {
            "$vectorSearch": {
                "index": VECTOR_INDEX_NAME,
                "path":  "embedding",          # field name in Atlas chunks docs
                "queryVector":    query_embedding,
                "numCandidates":  top_k * 10,  # oversample → better recall
                "limit":          top_k,
                "filter":         pre_filter,
            }
        },
        {
            "$project": {
                "_id":         0,
                "text":        1,
                "document_id": 1,
                "user_id":     1,
                "filename":    1,
                "chunk_index": 1,
                "score":       {"$meta": "vectorSearchScore"},
            }
        },
    ]

    logger.info(
        "[RETRIEVE] $vectorSearch payload → index=%r path='embedding' "
        "numCandidates=%d limit=%d filter=%r",
        VECTOR_INDEX_NAME,
        top_k * 10,
        top_k,
        pre_filter,
    )

    # ── Step 4: Run the aggregation ──────────────────────────────────────────
    col = _col()
    try:
        raw_results = list(col.aggregate(pipeline))
    except Exception as exc:
        logger.error(
            "[RETRIEVE] Atlas aggregation FAILED: %r — "
            "Check that index '%s' exists on collection '%s' in the Atlas UI.",
            exc, VECTOR_INDEX_NAME, CHUNKS_COLLECTION,
        )
        return []

    # ── Step 5: Log the raw DB response ─────────────────────────────────────
    logger.info(
        "[RETRIEVE] Raw Atlas response: %d document(s) returned before score filter.",
        len(raw_results),
    )

    if raw_results:
        for idx, r in enumerate(raw_results[:3]):   # log first 3 to avoid log flood
            logger.info(
                "[RETRIEVE] Raw result[%d]: document_id=%r chunk_index=%r "
                "score=%.4f text_preview=%r",
                idx,
                r.get("document_id"),
                r.get("chunk_index"),
                r.get("score", 0.0),
                r.get("text", "")[:80],
            )
    else:
        logger.warning(
            "[RETRIEVE] Atlas returned 0 results. Possible causes:\n"
            "  1. Index '%s' does not exist on collection '%s' — check Atlas UI.\n"
            "  2. No chunks were stored for user_id=%r document_id=%r.\n"
            "  3. Index numDimensions does not match query_embedding length (%d).\n"
            "  4. Pre-filter type mismatch (document_id stored as str but filter "
            "sent as ObjectId, or vice-versa).",
            VECTOR_INDEX_NAME, CHUNKS_COLLECTION, user_id, document_id,
            len(query_embedding),
        )
        return []

    # ── Step 6: Apply score threshold ────────────────────────────────────────
    chunks_above_threshold = [r for r in raw_results if r.get("score", 0) > SCORE_THRESHOLD]

    logger.info(
        "[RETRIEVE] After score threshold (>%.2f): %d/%d chunk(s) passed.",
        SCORE_THRESHOLD, len(chunks_above_threshold), len(raw_results),
    )

    if not chunks_above_threshold and raw_results:
        scores = [r.get("score", 0) for r in raw_results]
        logger.warning(
            "[RETRIEVE] ALL chunks were filtered out by score threshold. "
            "Scores seen: %s. "
            "Consider lowering SCORE_THRESHOLD (currently %.2f) or checking "
            "that ingestion and query use the SAME embedding model.",
            [round(s, 4) for s in scores],
            SCORE_THRESHOLD,
        )

    # ── Step 7: Format and return ────────────────────────────────────────────
    chunks = [
        {
            "text": r["text"],
            "metadata": {
                "document_id": r["document_id"],
                "user_id":     r["user_id"],
                "filename":    r["filename"],
                "chunk_index": r["chunk_index"],
            },
            "relevance_score": r["score"],
        }
        for r in chunks_above_threshold
    ]

    return sorted(chunks, key=lambda x: x["relevance_score"], reverse=True)


def fetch_all_chunks_for_document(
    document_id: str,
    user_id: str,
) -> List[Dict[str, Any]]:
    """
    Bypass $vectorSearch entirely — fetch ALL chunks for a document via a
    standard .find() query ordered by chunk_index.

    Used for global tasks (summarize, list, overview) where semantic similarity
    search fails because the query string ("summarize this pdf") has no textual
    overlap with the document content.

    document_id is compared as str — same type used during indexing.
    """
    logger.info(
        "[FETCH_ALL] Bypassing $vectorSearch for document_id=%r user_id=%r — "
        "fetching all chunks in order.",
        document_id, user_id,
    )

    col = _col()
    cursor = col.find(
        {"document_id": str(document_id), "user_id": str(user_id)},
        {"_id": 0, "text": 1, "document_id": 1, "user_id": 1,
         "filename": 1, "chunk_index": 1},
    ).sort("chunk_index", 1)

    raw = list(cursor)

    logger.info(
        "[FETCH_ALL] Retrieved %d chunk(s) for document_id=%r via .find().",
        len(raw), document_id,
    )

    if not raw:
        logger.warning(
            "[FETCH_ALL] 0 chunks found for document_id=%r user_id=%r. "
            "Check that indexing completed (status='indexed') in the documents collection.",
            document_id, user_id,
        )
        return []

    return [
        {
            "text": r["text"],
            "metadata": {
                "document_id": r["document_id"],
                "user_id":     r["user_id"],
                "filename":    r["filename"],
                "chunk_index": r["chunk_index"],
            },
            "relevance_score": 1.0,   # not a similarity score — treat all as equally relevant
        }
        for r in raw
    ]


def delete_document_chunks(document_id: str, user_id: str) -> None:
    """
    Remove all chunks for a document. Filters on user_id for safety.
    """
    col = _col()
    result = col.delete_many({"document_id": document_id, "user_id": user_id})
    logger.info(
        "[DELETE] Removed %d chunk(s) for document_id=%s user_id=%s",
        result.deleted_count, document_id, user_id,
    )
