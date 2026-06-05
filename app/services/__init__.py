# Backend service layers: extraction, chunking, embeddings, retrieval, vectorstore, and RAG
from app.services.extraction import extract_text, get_file_type, ScannedPDFError
from app.services.chunking import chunk_text
from app.services.embeddings import get_embeddings, get_query_embedding
from app.services.vectorstore import index_document_chunks, delete_document_chunks
from app.services.retrieval import retrieve_chunks
from app.services.rag import run_rag_pipeline
