from typing import List, Optional, Dict, Any
from app.services.retrieval import retrieve_chunks
from app.core.config import settings


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

    # When using Gemini via the OpenAI compat layer, ensure we use a
    # currently supported model. Both OpenAI model names AND old Gemini
    # model names (1.5-flash, 1.0-pro etc.) must be remapped.
    DEPRECATED_MODELS = {
        # OpenAI names (not valid on Gemini at all)
        "gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo", "gpt-4",
        # Deprecated / retired Gemini models
        "gemini-1.5-flash", "gemini-1.5-flash-latest",
        "gemini-1.5-pro",  "gemini-1.5-pro-latest",
        "gemini-1.0-pro",  "gemini-pro",
    }
    if "generativelanguage.googleapis.com" in base_url:
        if model in DEPRECATED_MODELS or not model.startswith("gemini-"):
            model = "gemini-2.0-flash"   # Current fast Gemini model

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
            temperature=0.1,        # Low temperature = factual, less creative
            max_tokens=1000,
        )
        return response.choices[0].message.content



def run_rag_pipeline(
    question: str,
    user_id: str,
    document_id: Optional[str] = None,
    top_k: int = 5,
) -> Dict[str, Any]:
    """
    Full RAG pipeline:
    Question → Embed → Retrieve → Build Context → LLM → Answer + Sources
    """
    # Step 1: Retrieve relevant chunks
    chunks = retrieve_chunks(
        query=question,
        user_id=user_id,
        document_id=document_id,
        top_k=top_k,
    )

    if not chunks:
        return {
            "answer": "I don't have enough information in the uploaded documents to answer this.",
            "sources": [],
            "chunks_used": 0,
        }

    # Step 2: Build context string
    context = build_context(chunks)

    # Step 3: Call LLM
    answer = ask_llm(question=question, context=context)

    # Step 4: Format source citations
    sources = []
    seen = set()
    for chunk in chunks:
        meta = chunk["metadata"]
        key = (meta.get("document_id"), meta.get("chunk_index"))
        if key not in seen:
            seen.add(key)
            sources.append({
                "document_id": meta.get("document_id"),
                "filename": meta.get("filename"),
                "chunk_index": meta.get("chunk_index"),
                "excerpt": chunk["text"][:150] + "...",
                "relevance_score": round(chunk["relevance_score"], 3),
            })

    return {
        "answer": answer,
        "sources": sources,
        "chunks_used": len(chunks),
    }
