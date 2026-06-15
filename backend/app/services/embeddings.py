from typing import List
from app.core.config import settings


def get_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Returns embedding vectors for a list of texts.
    Dispatches to OpenAI or local model based on config.
    """
    if settings.embedding_strategy == "openai":
        return _openai_embeddings(texts)
    else:
        return _local_embeddings(texts)


def get_query_embedding(query: str) -> List[float]:
    """Single text embedding for query at search time."""
    return get_embeddings([query])[0]


def _openai_embeddings(texts: List[str]) -> List[List[float]]:
    from openai import OpenAI
    all_embeddings = []
    
    with OpenAI(api_key=settings.openai_api_key) as client:
        # OpenAI has a max batch size — chunk if needed
        batch_size = 100
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = client.embeddings.create(
                model=settings.embedding_model,
                input=batch,
            )
            all_embeddings.extend([item.embedding for item in response.data])
            
    return all_embeddings


def _local_embeddings(texts: List[str]) -> List[List[float]]:
    # Model is cached after first load — not reloaded every call
    model = _get_local_model()
    embeddings = model.encode(texts, show_progress_bar=False)
    return embeddings.tolist()


_local_model = None


def _get_local_model():
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer
        _local_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return _local_model
