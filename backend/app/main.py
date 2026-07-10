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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check logs."},
    )
