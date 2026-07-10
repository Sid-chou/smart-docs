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
    # Only expose safe configuration variables to diagnose the Render issue
    return {
        "embedding_strategy": settings.embedding_strategy,
        "openai_base_url": settings.openai_base_url,
        "embedding_model": settings.embedding_model,
        "is_gemini": (settings.openai_base_url and "generativelanguage.googleapis.com" in settings.openai_base_url) or (settings.embedding_model and (settings.embedding_model.startswith("models/") or "text-embedding" in settings.embedding_model))
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check logs."},
    )
