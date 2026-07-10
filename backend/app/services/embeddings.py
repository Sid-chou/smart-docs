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
        return _gemini_embeddings(texts)
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


def _gemini_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Calls the native Gemini batchEmbedContents REST API directly via httpx.

    Why native API instead of OpenAI compat layer:
    - Google's /openai/ compat path does NOT support embeddings — only chat.
    - The OpenAI Python SDK mangles the URL/model name in incompatible ways.
    - text-embedding-004 is deprecated; gemini-embedding-001 is the replacement.

    Native endpoint:
      POST /v1beta/models/{model}:batchEmbedContents
      Authorization: Bearer <API_KEY>
    """
    import httpx

    api_key = settings.openai_api_key  # Gemini API key stored in OPENAI_API_KEY env var

    # Use gemini-embedding-001 — text-embedding-004 is deprecated and returns 404.
    # Allow override via EMBEDDING_MODEL env var, but strip any 'models/' prefix.
    model = settings.embedding_model or "gemini-embedding-001"
    if model in ("text-embedding-004", "text-embedding-3-small", "text-embedding-ada-002"):
        # These are all either deprecated Gemini or OpenAI models — use the current one
        model = "gemini-embedding-001"
    model = model.replace("models/", "")  # strip prefix if present

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"

    all_embeddings: List[List[float]] = []
    batch_size = 100  # batchEmbedContents supports up to 100 items per request

    with httpx.Client(timeout=60.0) as client:
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]

            # batchEmbedContents expects a list of {model, content} request objects
            payload = {
                "requests": [
                    {
                        "model": f"models/{model}",
                        "content": {"parts": [{"text": text}]},
                    }
                    for text in batch
                ]
            }

            response = client.post(
                url,
                headers={
                    "x-goog-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            # Response shape: {"embeddings": [{"values": [...]}, ...]}
            all_embeddings.extend(
                [emb["values"] for emb in data["embeddings"]]
            )
            del response, data
            gc.collect()

    return all_embeddings
