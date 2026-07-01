import gc
from typing import List
from app.core.config import settings


def get_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Returns embedding vectors for a list of texts.
    Only "openai" strategy is supported on Render (512 MB).
    Local strategy requires PyTorch (~800 MB) which exceeds the memory limit.
    """
    if settings.embedding_strategy == "openai":
        return _openai_embeddings(texts)
    else:
        # Hard fail — local strategy is intentionally disabled for Render.
        # sentence-transformers pulls PyTorch which alone exceeds 512 MB RAM.
        # Set EMBEDDING_STRATEGY=openai in your Render environment variables.
        raise RuntimeError(
            "Local embedding strategy is disabled. "
            "sentence-transformers is not installed (PyTorch ~800MB exceeds Render's 512MB limit). "
            "Set EMBEDDING_STRATEGY=openai in your environment variables."
        )


def get_query_embedding(query: str) -> List[float]:
    """Single text embedding for query at search time."""
    return get_embeddings([query])[0]


def _openai_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Calls OpenAI Embeddings API in batches.
    Uses context manager for the client to ensure HTTP connections are closed.
    Explicit gc.collect() after each batch releases response objects promptly —
    important on memory-constrained hosts like Render (512 MB).
    """
    from openai import OpenAI
    all_embeddings = []

    with OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url) as client:
        batch_size = 100
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = client.embeddings.create(
                model=settings.embedding_model,
                input=batch,
            )
            # Extract only the float vectors — do NOT hold the full response object
            all_embeddings.extend([item.embedding for item in response.data])
            # Release the response object immediately; don't wait for GC sweep
            del response
            gc.collect()

    return all_embeddings
