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

from typing import List, Optional, Dict, Any

from app.core.database import get_database
from app.services.embeddings import get_embeddings


# ── Collection name ──────────────────────────────────────────────────────────

CHUNKS_COLLECTION = "chunks"
VECTOR_INDEX_NAME = "vector_index"


# ── Internal helpers ─────────────────────────────────────────────────────────

def _get_collection():
    """Return the Motor collection for chunks (sync-safe accessor)."""
    return get_database()[CHUNKS_COLLECTION]


# ── Public API (kept identical to old ChromaDB surface) ──────────────────────

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
    """
    if not chunks:
        return

    embeddings = get_embeddings(chunks)

    import pymongo
    col = pymongo.MongoClient(
        _get_mongo_url()
    )[_get_db_name()][CHUNKS_COLLECTION]

    docs = [
        {
            "document_id": document_id,
            "user_id": user_id,
            "filename": filename,
            "chunk_index": i,
            "text": chunk,
            "embedding": embedding,
        }
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]

    if docs:
        col.insert_many(docs)


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
    """
    from app.services.embeddings import get_query_embedding
    import pymongo

    query_embedding = get_query_embedding(query)

    # Build the pre-filter — user_id is always required
    pre_filter: Dict[str, Any] = {"user_id": {"$eq": user_id}}
    if document_id:
        pre_filter["document_id"] = {"$eq": document_id}

    pipeline = [
        {
            "$vectorSearch": {
                "index": VECTOR_INDEX_NAME,
                "path": "embedding",
                "queryVector": query_embedding,
                "numCandidates": top_k * 10,   # oversample for better recall
                "limit": top_k,
                "filter": pre_filter,
            }
        },
        {
            "$project": {
                "_id": 0,
                "text": 1,
                "document_id": 1,
                "user_id": 1,
                "filename": 1,
                "chunk_index": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]

    col = pymongo.MongoClient(
        _get_mongo_url()
    )[_get_db_name()][CHUNKS_COLLECTION]

    results = list(col.aggregate(pipeline))

    chunks = [
        {
            "text": r["text"],
            "metadata": {
                "document_id": r["document_id"],
                "user_id": r["user_id"],
                "filename": r["filename"],
                "chunk_index": r["chunk_index"],
            },
            "relevance_score": r["score"],
        }
        for r in results
        if r.get("score", 0) > 0.3
    ]

    return sorted(chunks, key=lambda x: x["relevance_score"], reverse=True)


def delete_document_chunks(document_id: str, user_id: str) -> None:
    """
    Remove all chunks for a document. Filters on user_id for safety.
    """
    import pymongo

    col = pymongo.MongoClient(
        _get_mongo_url()
    )[_get_db_name()][CHUNKS_COLLECTION]

    col.delete_many({"document_id": document_id, "user_id": user_id})


# ── Config helpers ───────────────────────────────────────────────────────────

def _get_mongo_url() -> str:
    from app.core.config import settings
    return settings.mongodb_url


def _get_db_name() -> str:
    from app.core.config import settings
    return settings.database_name
