from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import get_database, close_database
from app.core.logging import setup_logging, logger
from app.routers import auth, documents, chat, admin

# Setup logging immediately on startup
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database connection and indexes...")
    if settings.secret_key == "your-super-secret-key-change-this-in-production":
        logger.warning(
            "SECURITY WARNING: Using the default insecure SECRET_KEY. "
            "Please configure a secure SECRET_KEY environment variable in your production environment!"
        )
    db = get_database()
    # Create MongoDB unique indexes and compound indexes on startup
    await db.users.create_index("email", unique=True)
    await db.documents.create_index([("user_id", 1), ("filename", 1)])
    await db.chat_history.create_index([("user_id", 1), ("document_id", 1)])
    logger.info("Database and indexes initialized successfully.")
    yield
    # Shutdown
    logger.info("Closing database connection...")
    await close_database()
    logger.info("Database connection closed.")


app = FastAPI(
    title="SmartDocs AI",
    description="RAG-based multi-tenant document assistant",
    version="1.0.0",
    lifespan=lifespan,
)

# Parse allowed CORS origins from settings
origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(documents.router, prefix="/documents", tags=["Documents"])
app.include_router(chat.router, prefix="/chat", tags=["Chat"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/debug/env")
async def debug_env():
    # Resolve the actual model that will be used for chat
    chat_model = settings.openai_model
    base_url = settings.openai_base_url or ""
    if "generativelanguage.googleapis.com" in base_url:
        if chat_model in ("gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo", "gpt-4"):
            chat_model = "gemini-2.0-flash"

    # Test the API key against Gemini's models list endpoint to check quota
    key = settings.openai_api_key or ""
    key_preview = f"{key[:8]}...{key[-4:]}" if len(key) > 12 else "too_short_or_missing"

    import httpx
    models_status = "untested"
    try:
        r = httpx.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            headers={"x-goog-api-key": key},
            timeout=10.0,
        )
        if r.status_code == 200:
            model_names = [m["name"] for m in r.json().get("models", [])][:5]
            models_status = f"OK — sample models: {model_names}"
        else:
            models_status = f"HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e:
        models_status = f"Request failed: {e}"

    return {
        "embedding_strategy": settings.embedding_strategy,
        "openai_base_url": settings.openai_base_url,
        "embedding_model": settings.embedding_model,
        "is_gemini": ("generativelanguage.googleapis.com" in base_url) or (settings.embedding_model and "text-embedding" in settings.embedding_model),
        "openai_model_raw": settings.openai_model,
        "resolved_chat_model": chat_model,
        "api_key_preview": key_preview,
        "api_key_models_test": models_status,
    }


@app.get("/debug/chat-test")
async def debug_chat_test():
    """Live test of the LLM call — returns full error details if it fails."""
    import asyncio
    from app.services.rag import ask_llm
    try:
        answer = await asyncio.to_thread(
            ask_llm,
            question="Say hello in one sentence.",
            context="This is a test context."
        )
        return {"status": "ok", "answer": answer}
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }


@app.get("/debug/chunks")
async def debug_chunks():
    """
    Check 1: Are chunks saved in MongoDB Atlas?
    Check 2: Does vector search return results (RAG connected)?

    Open in browser: https://your-render-url.onrender.com/debug/chunks
    No auth required — for debugging only.
    """
    import asyncio
    import traceback
    import pymongo
    from app.core.config import settings

    result = {
        "step1_env": {},
        "step2_mongo_connection": {},
        "step3_chunks_stored": {},
        "step4_embedding_api": {},
        "step5_vector_search": {},
        "verdict": "",
    }

    # Step 1: Env check
    key = settings.openai_api_key or ""
    result["step1_env"] = {
        "embedding_strategy": settings.embedding_strategy,
        "embedding_model": settings.embedding_model,
        "api_key_present": bool(key and key != "sk-..."),
        "api_key_preview": f"{key[:8]}..." if len(key) > 8 else "MISSING",
        "mongodb_url_set": bool(settings.mongodb_url),
        "status": "ok" if (settings.embedding_strategy == "openai" and key and key != "sk-...") else "FAIL — check EMBEDDING_STRATEGY and OPENAI_API_KEY env vars",
    }

    # Step 2: MongoDB connection + chunk count
    try:
        client = pymongo.MongoClient(settings.mongodb_url, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        db = client[settings.database_name]
        total_chunks = db["chunks"].count_documents({})
        total_docs   = db["documents"].count_documents({})
        indexed_docs = db["documents"].count_documents({"is_indexed": True})
        failed_docs  = db["documents"].count_documents({"status": {"$in": ["failed_error", "failed_unreadable"]}})

        result["step2_mongo_connection"] = {"status": "ok", "connected": True}
        result["step3_chunks_stored"] = {
            "total_chunks_in_atlas": total_chunks,
            "total_documents_uploaded": total_docs,
            "documents_indexed_successfully": indexed_docs,
            "documents_failed": failed_docs,
            "status": "ok" if total_chunks > 0 else "FAIL — 0 chunks. Upload a document first, or check Render logs for indexing errors",
        }

        # Show per-document breakdown
        if total_chunks > 0:
            sample = db["chunks"].find_one({}, {"text": 1, "filename": 1, "chunk_index": 1, "embedding": 1})
            embed_dims = len(sample.get("embedding", [])) if sample else 0
            doc_ids = db["chunks"].distinct("document_id")
            breakdown = []
            for did in doc_ids[:5]:
                c = db["chunks"].count_documents({"document_id": did})
                fname = db["chunks"].find_one({"document_id": did}, {"filename": 1})
                breakdown.append({"document_id": did, "filename": fname.get("filename", "?"), "chunks": c})
            result["step3_chunks_stored"]["embedding_dimensions"] = embed_dims
            result["step3_chunks_stored"]["indexed_documents_breakdown"] = breakdown
            result["step3_chunks_stored"]["sample_text_preview"] = (sample.get("text", "")[:150] + "...") if sample else ""

        # Show failed doc errors
        if failed_docs > 0:
            failures = list(db["documents"].find(
                {"status": {"$in": ["failed_error", "failed_unreadable"]}},
                {"original_filename": 1, "status": 1, "error_message": 1}
            ).limit(5))
            result["step3_chunks_stored"]["failed_documents"] = [
                {"filename": f.get("original_filename"), "status": f.get("status"), "error": f.get("error_message")}
                for f in failures
            ]

    except Exception as e:
        result["step2_mongo_connection"] = {"status": "FAIL", "error": str(e)}
        result["step3_chunks_stored"] = {"status": "skipped — no DB connection"}
        result["verdict"] = "BROKEN — MongoDB connection failed. Check MONGODB_URL env var on Render."
        return result

    # Step 4: Embedding API test
    try:
        import httpx
        model = settings.embedding_model or "gemini-embedding-001"
        if model in ("text-embedding-004", "text-embedding-3-small", "text-embedding-ada-002"):
            model = "gemini-embedding-001"
        model = model.replace("models/", "")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"
        payload = {"requests": [{"model": f"models/{model}", "content": {"parts": [{"text": "test"}]}}]}
        resp = httpx.post(url, headers={"x-goog-api-key": settings.openai_api_key, "Content-Type": "application/json"}, json=payload, timeout=15.0)
        if resp.status_code == 200:
            dims = len(resp.json()["embeddings"][0]["values"])
            result["step4_embedding_api"] = {"status": "ok", "model": model, "dimensions": dims}
        else:
            result["step4_embedding_api"] = {"status": f"FAIL — HTTP {resp.status_code}", "detail": resp.text[:300]}
    except Exception as e:
        result["step4_embedding_api"] = {"status": "FAIL", "error": str(e)}

    # Step 5: Vector search test (only if chunks exist)
    if total_chunks == 0:
        result["step5_vector_search"] = {"status": "skipped — no chunks to search"}
    else:
        try:
            import httpx
            model = settings.embedding_model or "gemini-embedding-001"
            if model in ("text-embedding-004", "text-embedding-3-small", "text-embedding-ada-002"):
                model = "gemini-embedding-001"
            model = model.replace("models/", "")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"
            payload = {"requests": [{"model": f"models/{model}", "content": {"parts": [{"text": "summarize the document"}]}}]}
            resp = httpx.post(url, headers={"x-goog-api-key": settings.openai_api_key, "Content-Type": "application/json"}, json=payload, timeout=15.0)
            resp.raise_for_status()
            query_vec = resp.json()["embeddings"][0]["values"]

            sample_uid = db["chunks"].find_one({}, {"user_id": 1})["user_id"]
            pipeline = [
                {"$vectorSearch": {"index": "vector_index", "path": "embedding", "queryVector": query_vec, "numCandidates": 50, "limit": 3, "filter": {"user_id": {"$eq": sample_uid}}}},
                {"$project": {"_id": 0, "text": 1, "filename": 1, "chunk_index": 1, "score": {"$meta": "vectorSearchScore"}}},
            ]
            hits = list(db["chunks"].aggregate(pipeline))
            if hits:
                result["step5_vector_search"] = {
                    "status": "ok — RAG pipeline is connected",
                    "results_returned": len(hits),
                    "top_result": {"filename": hits[0]["filename"], "chunk_index": hits[0]["chunk_index"], "score": round(hits[0]["score"], 3), "preview": hits[0]["text"][:120] + "..."},
                }
            else:
                result["step5_vector_search"] = {
                    "status": "FAIL — search returned 0 results",
                    "likely_cause": "Atlas vector index 'vector_index' not created or still building. Go to Atlas UI > Search Indexes and check.",
                }
        except Exception as e:
            result["step5_vector_search"] = {"status": "FAIL", "error": str(e), "traceback": traceback.format_exc()}

    # Final verdict
    s3 = result["step3_chunks_stored"].get("status", "")
    s4 = result["step4_embedding_api"].get("status", "")
    s5 = result["step5_vector_search"].get("status", "")
    if "ok" in s3 and "ok" in s4 and "ok" in s5:
        result["verdict"] = "ALL GOOD — chunks saved, embeddings work, RAG search connected. PDF summarization should work."
    elif total_chunks == 0:
        result["verdict"] = "BROKEN — No chunks in Atlas. Set EMBEDDING_STRATEGY=openai on Render, then re-upload your PDF."
    elif "FAIL" in s4:
        result["verdict"] = "BROKEN — Embedding API failed. Check OPENAI_API_KEY on Render."
    elif "FAIL" in s5:
        result["verdict"] = "BROKEN — Chunks exist but vector search fails. Create 'vector_index' in Atlas UI."
    else:
        result["verdict"] = "Partial — check individual steps above."

    return result


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check logs."},
    )
