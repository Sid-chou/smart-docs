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
    Calls the Gemini embedding endpoint directly via httpx to avoid OpenAI SDK
    URL/model-name mangling that causes 'v1main' 404 errors.

    The OpenAI Python SDK (v2.41.0) internally reformats the model name and
    request path in ways incompatible with the Gemini OpenAI-compatibility layer,
    even when base_url is correctly set. Bypassing the SDK with a raw HTTP POST
    is the only reliable fix.
    """
    import httpx

    api_key = settings.openai_api_key
    model = settings.embedding_model
    base_url = settings.openai_base_url or ""

    # --- Gemini base_url normalisation ---
    # Ensure we always hit the correct v1beta OpenAI-compatibility endpoint.
    if "generativelanguage.googleapis.com" in base_url:
        base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
    elif not base_url.endswith("/"):
        base_url += "/"

    # Strip 'models/' prefix — Gemini compat layer wants bare model name
    if model.startswith("models/"):
        model = model[len("models/"):]

    url = base_url + "embeddings"

    all_embeddings: List[List[float]] = []
    batch_size = 100

    with httpx.Client(timeout=60.0) as client:
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": model, "input": batch},
            )
            response.raise_for_status()
            data = response.json()
            all_embeddings.extend([item["embedding"] for item in data["data"]])
            del response, data
            gc.collect()

    return all_embeddings
