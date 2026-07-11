"""
retrieval.py — Semantic chunk retrieval for the RAG pipeline.

Delegates directly to vectorstore.retrieve_chunks which uses MongoDB Atlas
Vector Search. ChromaDB has been removed — Atlas is free on M0 and persistent.
"""

from typing import List, Optional, Dict, Any
from app.services.vectorstore import retrieve_chunks


def retrieve_relevant_chunks(
    query: str,
    user_id: str,
    document_id: Optional[str] = None,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Semantic search with mandatory user_id filter.

    If document_id is provided, search only that document.
    Otherwise, search all documents belonging to user_id.

    Security: user_id scope is enforced inside vectorstore.retrieve_chunks
    at the $vectorSearch pre-filter level — Atlas rejects results from other
    users before they even leave the database.
    """
    return retrieve_chunks(
        query=query,
        user_id=user_id,
        document_id=document_id,
        top_k=top_k,
    )
