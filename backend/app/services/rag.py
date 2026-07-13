import logging
from typing import List, Optional, Dict, Any

from app.services.retrieval import retrieve_relevant_chunks
from app.services.vectorstore import fetch_all_chunks_for_document
from app.core.config import settings

# ── Logger ───────────────────────────────────────────────────────────────────

logger = logging.getLogger("smartdocs.rag")

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a document assistant. Your job is to answer questions 
using ONLY the context provided below. 

Rules:
- If the answer is in the context, answer clearly and cite the source document.
- If the answer is NOT in the context, say exactly: "I don't have enough information in the uploaded documents to answer this."
- Never make up information. Never use knowledge outside the provided context.
- Keep answers concise and factual.
- Always mention which document(s) your answer comes from."""

CONTEXT_TEMPLATE = """
Document: {filename} (chunk {chunk_index})
---
{text}
"""

# ── Keywords that signal a "global" / summarization task ────────────────────
# For these queries, $vectorSearch is unreliable because the query string
# ("summarize this pdf") has no textual overlap with scientific/technical
# document content and will score below the threshold.
GLOBAL_QUERY_KEYWORDS = {
    "summarize", "summary", "overview", "outline", "list all",
    "what is this document about", "what does this document cover",
    "give me an overview", "briefly explain", "tldr",
}


def _is_global_query(question: str) -> bool:
    """
    Return True if the question is a global/summary task that should
    bypass $vectorSearch and fetch all chunks directly.
    """
    q = question.lower().strip()
    return any(kw in q for kw in GLOBAL_QUERY_KEYWORDS)


def build_context(chunks: List[Dict[str, Any]]) -> str:
    if not chunks:
        return "No relevant context found."
    parts = []
    for chunk in chunks:
        meta = chunk["metadata"]
        parts.append(CONTEXT_TEMPLATE.format(
            filename=meta.get("filename", "unknown"),
            chunk_index=meta.get("chunk_index", 0),
            text=chunk["text"],
        ))
    return "\n\n".join(parts)


def ask_llm(question: str, context: str) -> str:
    from openai import OpenAI

    model = settings.openai_model
    base_url = settings.openai_base_url or ""

    # When using Gemini via the OpenAI compat layer, remap deprecated model names.
    DEPRECATED_MODELS = {
        "gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo", "gpt-4",
        "gemini-1.5-flash", "gemini-1.5-flash-latest",
        "gemini-1.5-pro",  "gemini-1.5-pro-latest",
        "gemini-1.0-pro",  "gemini-pro",
    }
    if "generativelanguage.googleapis.com" in base_url:
        if model in DEPRECATED_MODELS or not model.startswith("gemini-"):
            model = "gemini-2.5-flash-lite"

    logger.info("[LLM] Calling model=%r base_url=%r context_chars=%d",
                model, base_url, len(context))

    with OpenAI(api_key=settings.openai_api_key, base_url=base_url) as client:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {question}"
            },
        ]

        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.1,
            max_tokens=1000,
        )
        answer = response.choices[0].message.content
        logger.info("[LLM] Response received: %d chars", len(answer))
        return answer


def run_rag_pipeline(
    question: str,
    user_id: str,
    document_id: Optional[str] = None,
    top_k: int = 5,
) -> Dict[str, Any]:
    """
    Full RAG pipeline:
      Question → [route] → Retrieve → Build Context → LLM → Answer + Sources

    Routing:
      - Global queries (summarize, overview, etc.) bypass $vectorSearch and
        fetch ALL chunks ordered by chunk_index via a plain .find() query.
      - Specific questions use $vectorSearch semantic similarity.
    """
    logger.info(
        "[RAG] Pipeline START — question=%r user_id=%r document_id=%r",
        question, user_id, document_id,
    )

    # ── Step 1: Route the query ───────────────────────────────────────────────
    is_global = _is_global_query(question)

    if is_global:
        logger.info(
            "[RAG] GLOBAL QUERY DETECTED — bypassing $vectorSearch. "
            "Using fetch_all_chunks_for_document() via .find({document_id})."
        )
        if not document_id:
            logger.warning(
                "[RAG] Global query but no document_id provided. "
                "Cannot fetch all chunks without a specific document target. "
                "Falling back to $vectorSearch across all user documents."
            )
            is_global = False
    else:
        logger.info("[RAG] Specific query — using $vectorSearch semantic retrieval.")

    # ── Step 2: Retrieve chunks ───────────────────────────────────────────────
    if is_global and document_id:
        chunks = fetch_all_chunks_for_document(
            document_id=document_id,
            user_id=user_id,
        )
        strategy_used = "fetch_all (summarize bypass)"
    else:
        chunks = retrieve_relevant_chunks(
            query=question,
            user_id=user_id,
            document_id=document_id,
            top_k=top_k,
        )
        strategy_used = "vectorSearch"

    logger.info(
        "[RAG] Retrieval complete — strategy=%r chunks_returned=%d",
        strategy_used, len(chunks),
    )

    # ── Step 3: Guard — no chunks ────────────────────────────────────────────
    if not chunks:
        logger.warning(
            "[RAG] 0 chunks available after retrieval. "
            "Returning fallback answer. "
            "Check Render logs above for [RETRIEVE] or [FETCH_ALL] details.",
        )
        return {
            "answer": "I don't have enough information in the uploaded documents to answer this.",
            "sources": [],
            "chunks_used": 0,
            "strategy": strategy_used,
        }

    # ── Step 4: Log chunk preview before sending to LLM ─────────────────────
    logger.info(
        "[RAG] Sending %d chunk(s) to LLM as context. "
        "First chunk preview: %r",
        len(chunks),
        chunks[0]["text"][:120],
    )

    # ── Step 5: Build context ────────────────────────────────────────────────
    context = build_context(chunks)
    logger.info("[RAG] Context built: %d chars total.", len(context))

    # ── Step 6: Call LLM ─────────────────────────────────────────────────────
    answer = ask_llm(question=question, context=context)

    # ── Step 7: Format sources ───────────────────────────────────────────────
    sources = []
    seen = set()
    for chunk in chunks:
        meta = chunk["metadata"]
        key = (meta.get("document_id"), meta.get("chunk_index"))
        if key not in seen:
            seen.add(key)
            sources.append({
                "document_id":     meta.get("document_id"),
                "filename":        meta.get("filename"),
                "chunk_index":     meta.get("chunk_index"),
                "excerpt":         chunk["text"][:150] + "...",
                "relevance_score": round(chunk["relevance_score"], 3),
            })

    logger.info(
        "[RAG] Pipeline END — chunks_used=%d unique_sources=%d",
        len(chunks), len(sources),
    )

    return {
        "answer":      answer,
        "sources":     sources,
        "chunks_used": len(chunks),
        "strategy":    strategy_used,
    }
