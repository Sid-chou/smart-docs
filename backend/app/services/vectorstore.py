from typing import List
import chromadb
from app.core.config import settings
from app.services.embeddings import get_embeddings

_chroma_client = None


def get_chroma_client() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is None:
        # Initialized only on demand. Cosine metric config is declared here.
        import chromadb.config
        settings_chroma = chromadb.config.Settings(anonymized_telemetry=False)
        _chroma_client = chromadb.PersistentClient(path=settings.chroma_persist_dir, settings=settings_chroma)
    return _chroma_client


def get_or_create_collection():
    client = get_chroma_client()
    
    # We must pass a dummy embedding function to ChromaDB.
    # If we don't, ChromaDB will automatically try to download and load
    # the default sentence-transformers model (all-MiniLM-L6-v2),
    # which requires >1GB RAM and will instantly crash Render Free Tier (OOM).
    # Since we explicitly pass embeddings in collection.add(), this dummy is never actually called.
    from chromadb import EmbeddingFunction, Documents, Embeddings
    class DummyEmbeddingFunction(EmbeddingFunction):
        def __call__(self, input: Documents) -> Embeddings:
            return []

    return client.get_or_create_collection(
        name="smartdocs_chunks",
        metadata={"hnsw:space": "cosine"},
        embedding_function=DummyEmbeddingFunction(),
    )


async def index_document_chunks(
    chunks: List[str],
    document_id: str,
    user_id: str,
    filename: str,
) -> None:
    """
    Generate embeddings and write vectors + metadata scopes to ChromaDB.

    Multi-tenant safety requirement:
    ALL inserts must tag the user_id metadata scope. Retrieval must filter on it.
    If you don't scope user_id, user B can query B and get context chunks from
    A's documents, leaking private data.
    """
    if not chunks:
        return

    collection = get_or_create_collection()
    embeddings = get_embeddings(chunks)

    ids = [f"{document_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "user_id": user_id,
            "document_id": document_id,
            "filename": filename,
            "chunk_index": i,
        }
        for i in range(len(chunks))
    ]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        metadatas=metadatas,
        documents=chunks,
    )


async def delete_document_chunks(document_id: str, user_id: str) -> None:
    """
    Remove vectors from ChromaDB matching document_id.
    Filters on user_id for multi-tenant deletion safety.
    """
    collection = get_or_create_collection()
    collection.delete(
        where={
            "$and": [
                {"document_id": {"$eq": document_id}},
                {"user_id": {"$eq": user_id}},
            ]
        }
    )
