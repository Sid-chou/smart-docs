import logging
from typing import List, Optional, Dict, Any

from app.services.retrieval import retrieve_relevant_chunks
from app.services.vectorstore import fetch_all_chunks_for_document
from app.core.config import settings

# ── Logger ───────────────────────────────────────────────────────────────────

logger = logging.getLogger("smartdocs.rag")

# ── System Prompts ────────────────────────────────────────────────────────────
#
# TWO separate prompts — one for specific Q&A, one for summary/global tasks.
#
# Why split?
#   The strict Q&A prompt says "if the answer is NOT in the context, say the
#   fallback phrase". Gemini interprets "summarize this pdf" as a meta-task
#   with no explicit keyword answer → fires the fallback even when 18 chunks
#   of full context are present. The summary prompt removes that trap entirely.

QA_SYSTEM_PROMPT = """\
You are a helpful document assistant. The user has uploaded one or more documents.
Your job is to answer their question using ONLY the document context provided below.

Rules:
- Read the context carefully and answer the question directly.
- Always cite which document and chunk your answer comes from.
- Never fabricate facts. Never use knowledge outside the provided context.
- Keep answers concise and factual.
- Only say "I don't have enough information in the uploaded documents to answer this." \
if the context block is completely empty or contains the literal text \
"No relevant context found." — not simply because the answer requires synthesis.\
"""

SUMMARY_SYSTEM_PROMPT = """\
You are a helpful document assistant. The user has uploaded a document and wants \
a summary or overview of its content.

Your job is to read ALL of the provided document context — which contains the full \
text of the document split into numbered chunks — and produce a clear, well-structured \
summary.

Rules:
- Synthesize the entire context into a coherent summary. Do NOT skip chunks.
- Structure your response with a brief introduction, key points (as bullet points \
or short paragraphs), and a one-sentence conclusion.
- If the context block is completely empty or contains only "No relevant context found.", \
say: "I don't have enough information in the uploaded documents to answer this."
- Otherwise, ALWAYS produce a summary — even if the document is technical or dense.\
"""

CONTEXT_TEMPLATE = """\

Document: {filename} (chunk {chunk_index})
---
{text}
"""

# ── Global query detection ────────────────────────────────────────────────────
# For these queries $vectorSearch is unreliable: the query string has no
# textual overlap with the document body so all chunks score below threshold.
GLOBAL_QUERY_KEYWORDS = {
    "summarize", "summary", "summarise",
    "overview", "outline", "list all",
    "what is this document about", "what does this document cover",
    "give me an overview", "briefly explain", "tldr",
    "what topics", "main points", "key points",
}


def _is_global_query(question: str) -> bool:
    """Return True if the question is a summary/global task."""
    q = question.lower().strip()
    return any(kw in q for kw in GLOBAL_QUERY_KEYWORDS)


# ── Context builder ───────────────────────────────────────────────────────────

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


# ── LLM call ─────────────────────────────────────────────────────────────────

def ask_llm(question: str, context: str, is_summary: bool = False) -> str:
    """
    Call the configured LLM with the question + document context.

    is_summary=True → use the SUMMARY_SYSTEM_PROMPT (synthesize all chunks).
    is_summary=False → use the QA_SYSTEM_PROMPT (find specific answer).

    Full payload is logged (truncated to 500 chars for context body) so you
    can confirm in Render logs that the chunks are actually embedded in the
    message before the network call goes out.
    """
    from openai import OpenAI

    model = settings.openai_model
    base_url = settings.openai_base_url or ""

    # Remap deprecated / non-Gemini model names when using the Gemini endpoint
    DEPRECATED_MODELS = {
        "gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo", "gpt-4",
        "gemini-1.5-flash", "gemini-1.5-flash-latest",
        "gemini-1.5-pro",  "gemini-1.5-pro-latest",
        "gemini-1.0-pro",  "gemini-pro",
    }
    if "generativelanguage.googleapis.com" in base_url:
        if model in DEPRECATED_MODELS or not model.startswith("gemini-"):
            model = "gemini-2.5-flash-lite"

    # ── Select prompt based on task type ─────────────────────────────────────
    system_prompt = SUMMARY_SYSTEM_PROMPT if is_summary else QA_SYSTEM_PROMPT

    logger.info(
        "[LLM] model=%r  base_url=%r  mode=%s  context_chars=%d",
        model, base_url,
        "SUMMARY" if is_summary else "QA",
        len(context),
    )

    # ── Build the exact messages payload ─────────────────────────────────────
    user_message_content = f"Document context:\n{context}\n\nQuestion: {question}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_message_content},
    ]

    # ── LOG THE FULL DISPATCH PAYLOAD (truncated to avoid log flood) ──────────
    # This tells you definitively whether the chunks reached the LLM call.
    logger.info(
        "[LLM] DISPATCH PAYLOAD AUDIT:\n"
        "  system_prompt_chars : %d\n"
        "  context_chars       : %d\n"
        "  context_is_empty    : %s\n"
        "  context_preview     : %r\n"
        "  question            : %r",
        len(system_prompt),
        len(context),
        context.strip() in ("", "No relevant context found."),
        context[:500],          # first 500 chars — enough to confirm chunks are present
        question,
    )

    if context.strip() in ("", "No relevant context found."):
        logger.error(
            "[LLM] CONTEXT IS EMPTY — aborting LLM call. "
            "Chunks were not embedded in the payload. "
            "Check build_context() and the retrieval return value."
        )
        return "I don't have enough information in the uploaded documents to answer this."

    # ── Make the network call ─────────────────────────────────────────────────
    with OpenAI(api_key=settings.openai_api_key, base_url=base_url) as client:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.2,    # slightly higher than 0.1 — allows fluent synthesis
            max_tokens=2000,    # summaries need more room than point answers
        )
        answer = response.choices[0].message.content
        logger.info(
            "[LLM] Response received: %d chars  finish_reason=%r",
            len(answer),
            response.choices[0].finish_reason,
        )
        return answer


# ── RAG pipeline ──────────────────────────────────────────────────────────────

def run_rag_pipeline(
    question: str,
    user_id: str,
    document_id: Optional[str] = None,
    top_k: int = 5,
) -> Dict[str, Any]:
    """
    Full RAG pipeline:
      Question → Route → Retrieve → Build Context → LLM → Answer + Sources

    Routing:
      Global queries (summarize, overview …) → fetch_all_chunks_for_document()
      Specific questions                      → $vectorSearch
    """
    logger.info(
        "[RAG] Pipeline START  question=%r  user_id=%r  document_id=%r",
        question, user_id, document_id,
    )

    # ── Step 1: Route ─────────────────────────────────────────────────────────
    is_global = _is_global_query(question)

    if is_global:
        logger.info(
            "[RAG] GLOBAL QUERY DETECTED — bypassing $vectorSearch. "
            "Will call fetch_all_chunks_for_document()."
        )
        if not document_id:
            logger.warning(
                "[RAG] Global query but no document_id supplied. "
                "Falling back to $vectorSearch across all user documents."
            )
            is_global = False
    else:
        logger.info("[RAG] Specific query — routing to $vectorSearch.")

    # ── Step 2: Retrieve ──────────────────────────────────────────────────────
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
        "[RAG] Retrieval complete  strategy=%r  chunks_returned=%d",
        strategy_used, len(chunks),
    )

    # ── Step 3: Guard — no chunks ─────────────────────────────────────────────
    if not chunks:
        logger.warning(
            "[RAG] 0 chunks after retrieval — returning fallback answer. "
            "See [RETRIEVE] / [FETCH_ALL] logs above for the root cause."
        )
        return {
            "answer":      "I don't have enough information in the uploaded documents to answer this.",
            "sources":     [],
            "chunks_used": 0,
            "strategy":    strategy_used,
        }

    # ── Step 4: Log chunk preview ─────────────────────────────────────────────
    logger.info(
        "[RAG] %d chunk(s) ready for context. "
        "First chunk preview: %r",
        len(chunks),
        chunks[0]["text"][:150],
    )

    # ── Step 5: Build context string ──────────────────────────────────────────
    context = build_context(chunks)
    logger.info(
        "[RAG] Context built  total_chars=%d  chunks=%d",
        len(context), len(chunks),
    )

    # ── Step 6: LLM call ──────────────────────────────────────────────────────
    answer = ask_llm(
        question=question,
        context=context,
        is_summary=is_global,   # pass the routing decision so the right prompt is used
    )

    # ── Step 7: Format source citations ───────────────────────────────────────
    sources = []
    seen: set = set()
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
        "[RAG] Pipeline END  chunks_used=%d  unique_sources=%d",
        len(chunks), len(sources),
    )

    return {
        "answer":      answer,
        "sources":     sources,
        "chunks_used": len(chunks),
        "strategy":    strategy_used,
    }
