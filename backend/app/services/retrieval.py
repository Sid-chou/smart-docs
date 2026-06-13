from typing import List, Optional, Dict, Any
from app.services.vectorstore import get_or_create_collection
from app.services.embeddings import get_query_embedding


def retrieve_chunks(
    query: str,
    user_id: str,
    document_id: Optional[str] = None,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Semantic search with mandatory user_id filter.

    If document_id is provided, search only that document.
    Otherwise, search all documents belonging to user_id.

    This is where security is enforced at the retrieval layer.
    """
    collection = get_or_create_collection()
    query_embedding = get_query_embedding(query)

    # Build filter — user_id is always required
    if document_id:
        where_filter = {
            "$and": [
                {"user_id": {"$eq": user_id}},
                {"document_id": {"$eq": document_id}},
            ]
        }
    else:
        where_filter = {"user_id": {"$eq": user_id}}

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )

    # Format results
    chunks = []
    if results["documents"] and results["documents"][0]:
        for i, doc in enumerate(results["documents"][0]):
            chunks.append({
                "text": doc,
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i],
                "relevance_score": 1 - results["distances"][0][i],  # cosine: lower distance = higher relevance
            })

    # Filter out low-relevance results
    chunks = [c for c in chunks if c["relevance_score"] > 0.3]
    return sorted(chunks, key=lambda x: x["relevance_score"], reverse=True)
