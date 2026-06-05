from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.database import get_database, close_database
from app.core.logging import setup_logging, logger
from app.routers import auth, documents, chat, admin

# Setup logging immediately on startup
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database connection and indexes...")
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check logs."},
    )
