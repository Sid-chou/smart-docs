# SmartDocs AI — Backend Development Guide

> **This is an execution document, not a reading document.**
> Every section tells you exactly what to build, in what order, and why.
> Don't skip sections. Don't reorder them. Dependencies are real.

---

## Table of Contents

1. [Dependency Graph — Read This First](#1-dependency-graph)
2. [Environment Setup](#2-environment-setup)
3. [Project Structure](#3-project-structure)
4. [Core Config & Database](#4-core-config--database)
5. [MongoDB Models](#5-mongodb-models)
6. [Authentication System](#6-authentication-system)
7. [Document Upload & Text Extraction](#7-document-upload--text-extraction)
8. [Chunking & Embeddings](#8-chunking--embeddings)
9. [ChromaDB — Vector Storage](#9-chromadb--vector-storage)
10. [Retrieval & Semantic Search](#10-retrieval--semantic-search)
11. [RAG Pipeline](#11-rag-pipeline)
12. [Chat History](#12-chat-history)
13. [Admin Routes](#13-admin-routes)
14. [Error Handling & Logging](#14-error-handling--logging)
15. [Requirements & Docker](#15-requirements--docker)
16. [Testing Checklist](#16-testing-checklist)

---

## 1. Dependency Graph

Build in this order. No exceptions.

```
[1] Config & Database Connection
        ↓
[2] MongoDB Models (User, Document, ChatHistory)
        ↓
[3] Auth System (register, login, JWT, bcrypt)
        ↓
[4] Document Upload + Text Extraction
        ↓
[5] Chunking + Embedding Generation
        ↓
[6] ChromaDB — Store Embeddings with user_id metadata
        ↓
[7] Retrieval — Similarity Search with user_id filter
        ↓
[8] RAG Pipeline — Inject context into LLM prompt
        ↓
[9] Chat History — Persist Q&A per user per document
```

**Why this order matters:**
- Step 6 without `user_id` = security breach. User A can read User B's documents.
- Step 7 without ChromaDB persistence set = all embeddings vanish on restart.
- Step 8 without understanding Step 7 = garbage retrieval = garbage answers.

---

## 2. Environment Setup

### Python Version

Use Python 3.11+. Python 3.10 has async edge cases with `motor`.

```bash
python --version   # Must be 3.11+
```

### Create Virtual Environment

```bash
python -m venv venv
source venv/bin/activate        # Linux/Mac
venv\Scripts\activate           # Windows
```

### `.env` File — Create This First

```env
# MongoDB
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=smartdocs

# JWT
SECRET_KEY=your-super-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
# Why 15 minutes for access tokens: short-lived so a stolen token expires fast.
# Refresh tokens handle session continuity — users never get a 401 mid-session.
# Do NOT solve the UX problem by making access tokens long-lived. That trades
# session continuity for a permanent security hole (stolen token = 8hr window).
REFRESH_TOKEN_EXPIRE_DAYS=7
REFRESH_SECRET_KEY=a-different-secret-key-for-refresh-tokens

# OpenAI (use this OR set USE_LOCAL_EMBEDDINGS=true)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# Why gpt-4o-mini and not gpt-3.5-turbo:
# - Cheaper per token than gpt-3.5-turbo
# - Larger context window (128k vs 16k) — critical for RAG with multiple chunks
# - Significantly lower hallucination rate on factual tasks
# - gpt-3.5-turbo is a dead-end model; gpt-4o-mini is the current budget tier

# Embedding strategy: "openai" or "local"
EMBEDDING_STRATEGY=local

# ChromaDB
CHROMA_PERSIST_DIR=./chroma_db

# File Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
```

> **Never commit `.env` to GitHub.** Add it to `.gitignore` immediately.

---

## 3. Project Structure

Create this structure before writing a single line of logic:

```
smartdocs-ai/
├── app/
│   ├── __init__.py
│   ├── main.py                    ← FastAPI app, router registration
│   ├── dependencies.py            ← Shared Depends() functions (current_user, db)
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py              ← Pydantic Settings, all env vars
│   │   ├── security.py            ← JWT creation/verification, bcrypt
│   │   └── database.py            ← MongoDB async client
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py                ← UserInDB, UserCreate, UserResponse
│   │   ├── document.py            ← DocumentInDB, DocumentCreate, DocumentResponse
│   │   └── chat.py                ← ChatMessage, ChatHistory
│   │
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py                ← /register, /login, /me
│   │   ├── documents.py           ← /upload, /list, /delete
│   │   ├── chat.py                ← /ask, /history
│   │   └── admin.py               ← /admin/users, /admin/documents
│   │
│   └── services/
│       ├── __init__.py
│       ├── extraction.py          ← PDF/DOCX/TXT text extraction
│       ├── chunking.py            ← Text splitting logic
│       ├── embeddings.py          ← Embedding generation (OpenAI or local)
│       ├── vectorstore.py         ← ChromaDB operations
│       ├── retrieval.py           ← Semantic search with filters
│       └── rag.py                 ← Full RAG pipeline
│
├── uploads/                       ← Uploaded files (gitignored)
├── chroma_db/                     ← ChromaDB persistence (gitignored)
├── .env
├── .gitignore
├── requirements.txt
├── docker-compose.yml
└── Dockerfile
```

**Create all `__init__.py` files immediately.** Missing init files cause import errors that look unrelated to the actual problem.

---

## 4. Core Config & Database

### `app/core/config.py`

```python
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # MongoDB
    mongodb_url: str = "mongodb://localhost:27017"
    database_name: str = "smartdocs"

    # JWT
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15      # short-lived — refresh tokens handle continuity
    refresh_secret_key: str = ""               # separate secret so access + refresh can be revoked independently
    refresh_token_expire_days: int = 7

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"       # cheaper + smarter than gpt-3.5-turbo
    embedding_model: str = "text-embedding-3-small"

    # Embedding strategy
    embedding_strategy: str = "local"  # "openai" or "local"

    # ChromaDB
    chroma_persist_dir: str = "./chroma_db"

    # File upload
    upload_dir: str = "./uploads"
    max_file_size_mb: int = 10

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
```

> **Why `lru_cache`?** Settings reads the `.env` file on instantiation. Without cache, every import re-reads the file. Cache it once.

### `app/core/database.py`

```python
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core.config import settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongodb_url)
    return _client


def get_database() -> AsyncIOMotorDatabase:
    return get_client()[settings.database_name]


async def close_database():
    global _client
    if _client:
        _client.close()
        _client = None
```

> **Use `motor`, not `pymongo`.** FastAPI is async. `pymongo` is blocking. Under load, a single sync DB call blocks ALL other requests on that thread. This is not a performance concern — it's a correctness concern.

### `app/main.py`

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import get_database, close_database
from app.routers import auth, documents, chat, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    db = get_database()
    # Create indexes on startup
    await db.users.create_index("email", unique=True)
    await db.documents.create_index([("user_id", 1), ("filename", 1)])
    await db.chat_history.create_index([("user_id", 1), ("document_id", 1)])
    yield
    # Shutdown
    await close_database()


app = FastAPI(
    title="SmartDocs AI",
    description="RAG-based document assistant",
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
```

---

## 5. MongoDB Models

### `app/models/user.py`

```python
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId


class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")


# What gets stored in MongoDB
class UserInDB(BaseModel):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    email: EmailStr
    hashed_password: str
    full_name: str
    is_active: bool = True
    is_admin: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}


# What user sends at registration
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2)


# What API returns (never expose password hash)
class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    is_active: bool
    is_admin: bool
    created_at: datetime

    @classmethod
    def from_db(cls, user: dict) -> "UserResponse":
        return cls(
            id=str(user["_id"]),
            email=user["email"],
            full_name=user["full_name"],
            is_active=user["is_active"],
            is_admin=user["is_admin"],
            created_at=user["created_at"],
        )
```

### `app/models/document.py`

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId
from app.models.user import PyObjectId
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    user_id: str                    # str form of user ObjectId
    filename: str
    original_filename: str
    file_path: str                  # path on disk
    file_type: str                  # "pdf", "txt", "docx"
    file_size_bytes: int
    status: str = "pending"         # pending | indexed | failed_unreadable | failed_error
    is_indexed: bool = False        # True only when status="indexed"
    chunk_count: int = 0
    error_message: Optional[str] = None   # populated on failure statuses only
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}


class DocumentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    file_type: str
    file_size_bytes: int
    status: str                     # frontend uses this to drive UI state
    is_indexed: bool
    chunk_count: int
    error_message: Optional[str] = None
    uploaded_at: datetime

    @classmethod
    def from_db(cls, doc: dict) -> "DocumentResponse":
        return cls(
            id=str(doc["_id"]),
            filename=doc["filename"],
            original_filename=doc["original_filename"],
            file_type=doc["file_type"],
            file_size_bytes=doc["file_size_bytes"],
            status=doc.get("status", "pending"),
            is_indexed=doc["is_indexed"],
            chunk_count=doc["chunk_count"],
            error_message=doc.get("error_message"),
            uploaded_at=doc["uploaded_at"],
        )
```

### `app/models/chat.py`

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from app.models.user import PyObjectId


class ChatMessage(BaseModel):
    question: str
    answer: str
    sources: List[dict] = []        # list of {filename, chunk_index, excerpt}
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatHistoryInDB(BaseModel):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    user_id: str
    document_id: Optional[str] = None   # None = query across all docs
    messages: List[ChatMessage] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}


# Request model for /chat/ask
class AskRequest(BaseModel):
    question: str = Field(min_length=3)
    document_id: Optional[str] = None  # None = search across all user docs
```

---

## 6. Authentication System

### `app/core/security.py`

```python
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: str) -> str:
    """Short-lived. Expires in ACCESS_TOKEN_EXPIRE_MINUTES (default: 15)."""
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "type": "access", "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def create_refresh_token(user_id: str) -> str:
    """
    Long-lived. Expires in REFRESH_TOKEN_EXPIRE_DAYS (default: 7).
    Uses a SEPARATE secret key from the access token.

    Why a separate secret?
    If you need to invalidate ALL refresh tokens (e.g., after a breach),
    you rotate REFRESH_SECRET_KEY without touching SECRET_KEY.
    Access tokens still work; only refresh is revoked. Gives you surgical
    revocation instead of logging out every user simultaneously.
    """
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    return jwt.encode(
        {"sub": user_id, "type": "refresh", "exp": expire},
        settings.refresh_secret_key or settings.secret_key,  # fallback if not set
        algorithm=settings.algorithm,
    )


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def decode_refresh_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(
            token,
            settings.refresh_secret_key or settings.secret_key,
            algorithms=[settings.algorithm],
        )
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None
```

### `app/dependencies.py`

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_db() -> AsyncIOMotorDatabase:
    return get_database()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise credentials_exception
    if not user.get("is_active", True):
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
```

### `app/routers/auth.py`

```python
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from pydantic import BaseModel

from app.models.user import UserCreate, UserResponse
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_refresh_token,
)
from app.dependencies import get_db, get_current_user

router = APIRouter()


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(user_data: UserCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "email": user_data.email,
        "hashed_password": hash_password(user_data.password),
        "full_name": user_data.full_name,
        "is_active": True,
        "is_admin": False,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    return UserResponse.from_db(user_doc)


@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    user = await db.users.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = str(user["_id"])
    return {
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id),
        "token_type": "bearer",
    }


@router.post("/refresh")
async def refresh_token(
    body: RefreshRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Exchange a valid refresh token for a new access token + new refresh token.

    Rotation strategy: every /refresh call invalidates the old refresh token
    by issuing a new one. This limits the damage window if a refresh token
    is stolen — it becomes stale as soon as the legitimate user next refreshes.

    The frontend should call this endpoint whenever it receives a 401, using
    the stored refresh token. If /refresh also returns 401, redirect to login.
    That's the full auth flow: silent re-auth on 401 → login only if refresh expired.
    """
    payload = decode_refresh_token(body.refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token. Please log in again.",
        )

    user_id = payload.get("sub")
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user or not user.get("is_active"):
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Issue new token pair — old refresh token is effectively rotated out
    return {
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id),
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse.from_db(current_user)


@router.put("/me")
async def update_profile(
    full_name: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    from bson import ObjectId
    await db.users.update_one(
        {"_id": ObjectId(str(current_user["_id"]))},
        {"$set": {"full_name": full_name, "updated_at": datetime.utcnow()}},
    )
    return {"message": "Profile updated"}
```

---

## 7. Document Upload & Text Extraction

### `app/services/extraction.py`

```python
import os
from pathlib import Path


class ScannedPDFError(Exception):
    """
    Raised when a PDF has no extractable text layer anywhere in the document.

    Why this is a named exception and not a silent empty-string return:
    The caller — the background worker — needs to distinguish between
    "extraction failed due to a bug" and "this is a scanned image."
    They require different DB status values and different user-facing messages.
    A generic empty string conflates both cases and makes debugging impossible.

    Architecture note — why detection happens in the background worker, not
    the upload route:

    Option A (pre-flight in upload route): parse the file synchronously before
    returning 201. Problems: (1) even wrapped in asyncio.to_thread, you still
    parse the full document twice — once to check, once to extract in the
    background worker, doubling I/O on every upload. (2) A single-page heuristic
    to avoid the double-parse creates false rejections on PDFs with cover images.

    Option B (defer to background worker): extract once, raise ScannedPDFError
    if no text found anywhere, set status="failed_unreadable" in MongoDB.
    The frontend polls /documents/{id}/status and shows the error when it lands.
    Single I/O pass. No false rejections. User gets a 201 immediately, then a
    clear error message within seconds. This is the correct trade-off.
    """
    pass


def extract_text(file_path: str, file_type: str) -> str:
    """
    Extract raw text from PDF, DOCX, or TXT.
    Raises ScannedPDFError for image-only PDFs.
    Raises ValueError for unsupported types.
    Does NOT silently return empty string — callers must handle errors explicitly.
    """
    if file_type == "pdf":
        return _extract_pdf(file_path)
    elif file_type == "docx":
        return _extract_docx(file_path)
    elif file_type == "txt":
        return _extract_txt(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


def _extract_pdf(file_path: str) -> str:
    import fitz
    text = []
    with fitz.open(file_path) as doc:
        for page in doc:
            page_text = page.get_text()
            if page_text.strip():
                text.append(page_text)

    result = "\n".join(text)
    if not result.strip():
        raise ScannedPDFError(
            "This PDF appears to be a scanned image with no extractable text. "
            "SmartDocs AI requires PDFs with a text layer. "
            "Try exporting from Word/Google Docs, or use an OCR tool first to create a searchable PDF."
        )
    return result


def _extract_docx(file_path: str) -> str:
    from docx import Document
    doc = Document(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                if cell.text.strip():
                    paragraphs.append(cell.text)
    return "\n".join(paragraphs)


def _extract_txt(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="latin-1") as f:
            return f.read()


def get_file_type(filename: str) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    allowed = {"pdf", "txt", "docx"}
    if ext not in allowed:
        raise ValueError(f"File type '{ext}' not supported. Allowed: {allowed}")
    return ext
```

> **Design decision — no OCR in v1, no pre-flight check.** Detection is deferred to the background worker: extract once, raise `ScannedPDFError` if no text layer is found across the entire document, set `status: failed_unreadable` in MongoDB. The frontend polls `/documents/{id}/status` and shows the error message when it arrives. This eliminates double I/O, eliminates false rejections from single-page heuristics, and keeps the event loop free during the upload request. Tesseract OCR is a v2 feature — it requires system packages, inflates the Docker image, and adds 3–5 seconds per page. The correct v1 trade-off is: detect accurately, fail fast in the background, tell the user exactly what's wrong and how to fix it.

### `app/routers/documents.py`

```python
import os
import uuid
import asyncio
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from bson import ObjectId

from app.models.document import DocumentResponse
from app.dependencies import get_db, get_current_user
from app.core.config import settings
from app.services.extraction import extract_text, get_file_type
from app.services.chunking import chunk_text
from app.services.vectorstore import index_document_chunks

router = APIRouter()

# Ensure upload directory exists
os.makedirs(settings.upload_dir, exist_ok=True)


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # Validate file type
    try:
        file_type = get_file_type(file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Stream file directly to disk — do NOT load into memory first.
    # await file.read() on a 50MB PDF spikes RAM. With concurrent uploads
    # this crashes the container. shutil.copyfileobj streams in 1MB chunks.
    unique_filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(settings.upload_dir, unique_filename)
    file_size = 0
    max_bytes = settings.max_file_size_mb * 1024 * 1024

    try:
        with open(file_path, "wb") as out_file:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                file_size += len(chunk)
                if file_size > max_bytes:
                    out_file.close()
                    os.remove(file_path)
                    raise HTTPException(
                        status_code=400,
                        detail=f"File too large. Max {settings.max_file_size_mb}MB"
                    )
                out_file.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"File write failed: {e}")

    # Write to MongoDB immediately after the file is on disk.
    # No pre-flight text detection here — see architecture note in ScannedPDFError.
    # The background worker does the single extraction pass and sets status accordingly.
    doc = {
        "user_id": str(current_user["_id"]),
        "filename": unique_filename,
        "original_filename": file.filename,
        "file_path": file_path,
        "file_type": file_type,
        "file_size_bytes": file_size,
        "status": "pending",        # pending → indexed | failed_unreadable | failed_error
        "is_indexed": False,
        "chunk_count": 0,
        "uploaded_at": datetime.utcnow(),
    }
    result = await db.documents.insert_one(doc)
    doc["_id"] = result.inserted_id

    # Index in background — don't make user wait for embedding generation
    background_tasks.add_task(
        index_document_in_background,
        file_path=file_path,
        file_type=file_type,
        document_id=str(result.inserted_id),
        user_id=str(current_user["_id"]),
        db=db,
    )

    return DocumentResponse.from_db(doc)


async def index_document_in_background(
    file_path: str,
    file_type: str,
    document_id: str,
    user_id: str,
    db: AsyncIOMotorDatabase,
):
    """
    Single extraction pass. No pre-flight. No double I/O.

    Status transitions:
      pending → indexed            (success)
      pending → failed_unreadable  (scanned PDF, no text layer)
      pending → failed_error       (unexpected exception)

    The frontend polls GET /documents/{id}/status to read these transitions
    and shows the appropriate message to the user. The contract is:
      - "pending"           → show a spinner
      - "indexed"           → show chunk_count, enable the Ask button
      - "failed_unreadable" → show the scanned PDF message with remediation steps
      - "failed_error"      → show a generic retry message, log the error

    Why three distinct failure states and not just is_indexed=False?
    Because "scanned PDF" and "unexpected crash" require different UI messages
    and different user actions. Conflating them into a single boolean means
    the frontend can only say "failed" — which is useless to the user.
    """
    import asyncio
    from app.services.extraction import ScannedPDFError

    try:
        # Single extraction pass — CPU-bound, offload to thread
        text = await asyncio.to_thread(extract_text, file_path, file_type)
        # ScannedPDFError is raised inside extract_text if no text layer found.
        # It surfaces here and is caught in the specific except block below.

        chunks = await asyncio.to_thread(chunk_text, text)

        await asyncio.to_thread(
            _sync_index_chunks,
            chunks, document_id, user_id, os.path.basename(file_path)
        )

        await db.documents.update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {
                "status": "indexed",
                "is_indexed": True,
                "chunk_count": len(chunks),
            }}
        )

    except ScannedPDFError as e:
        # Known, recoverable condition — scanned image PDF.
        # Store the full message so the frontend can display it verbatim.
        await db.documents.update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {
                "status": "failed_unreadable",
                "is_indexed": False,
                "error_message": str(e),
            }}
        )

    except Exception as e:
        # Unknown failure — log it, set a generic failure state.
        # Don't expose raw exception messages to the frontend (security).
        print(f"[INDEXING ERROR] doc={document_id} error={e!r}")
        await db.documents.update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {
                "status": "failed_error",
                "is_indexed": False,
                "error_message": "Indexing failed. Please try uploading the document again.",
            }}
        )


def _sync_index_chunks(chunks, document_id, user_id, filename):
    """
    Synchronous wrapper for ChromaDB indexing.
    Called via asyncio.to_thread() — runs in a worker thread, not the event loop.
    """
    import asyncio
    asyncio.run(index_document_chunks(
        chunks=chunks,
        document_id=document_id,
        user_id=user_id,
        filename=filename,
    ))


@router.get("/{document_id}/status")
async def get_document_status(
    document_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Polling endpoint for the frontend to check indexing status.

    The frontend calls this every 3–5 seconds after upload until
    status is no longer "pending". This is simpler than WebSockets
    for a v1 project and sufficient for documents that index in under 30s.

    Response shape:
    {
        "status": "pending" | "indexed" | "failed_unreadable" | "failed_error",
        "chunk_count": 42,           # only meaningful when status="indexed"
        "error_message": "..."       # only present on failure statuses
    }
    """
    doc = await db.documents.find_one({
        "_id": ObjectId(document_id),
        "user_id": str(current_user["_id"]),
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    response = {"status": doc.get("status", "pending")}
    if doc.get("status") == "indexed":
        response["chunk_count"] = doc.get("chunk_count", 0)
    if doc.get("status", "").startswith("failed"):
        response["error_message"] = doc.get(
            "error_message",
            "An error occurred during indexing."
        )
    return response


@router.get("/")
async def list_documents(
    page: int = 1,
    page_size: int = 20,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Paginated document list. page is 1-indexed.
    Returns a response envelope with total count so the UI can render pagination controls.

    Why an envelope instead of a bare list?
    A bare list gives the UI no way to know if there are more pages.
    Without total_count, the frontend can't build "Page 2 of 5" — it just
    doesn't know if page 2 exists until it fetches it and gets an empty list.
    That's a bad UX pattern. Always include total with paginated responses.
    """
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 100:
        page_size = 20

    skip = (page - 1) * page_size
    query = {"user_id": str(current_user["_id"])}

    total = await db.documents.count_documents(query)
    cursor = db.documents.find(query).skip(skip).limit(page_size)
    docs = await cursor.to_list(length=page_size)

    return {
        "items": [DocumentResponse.from_db(d) for d in docs],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Deletion across three systems: ChromaDB, disk, MongoDB.
    There is no distributed transaction. Partial failures are real.

    Strategy — ordered deletion with status flag:

    1. Mark document as "deleting" in MongoDB FIRST.
       If anything crashes after this point, the record is visibly broken
       (not a ghost). On restart, a cleanup job can find and finish these.

    2. Delete from ChromaDB. If this fails, the record stays "deleting"
       in MongoDB. The user can retry. No ghost embeddings referencing
       a healthy DB record.

    3. Delete file from disk. If this fails (permissions, file moved),
       log it and continue — a stale file on disk is recoverable. Don't
       roll back the ChromaDB deletion; partial cleanup is better than
       ghost vectors that answer queries with deleted content.

    4. Delete from MongoDB LAST. This is the source of truth.
       Only remove it once the other systems are clean.

    Why not rollback? Because "undo ChromaDB delete" requires re-embedding
    the document — you no longer have the text. True saga pattern would
    require storing the extracted text permanently, which is a different
    architectural decision. For v1, ordered deletion with a status flag
    is the correct trade-off.
    """
    doc = await db.documents.find_one({
        "_id": ObjectId(document_id),
        "user_id": str(current_user["_id"])
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Step 1: Mark as deleting — makes partial failure visible, not a ghost
    await db.documents.update_one(
        {"_id": ObjectId(document_id)},
        {"$set": {"status": "deleting"}}
    )

    # Step 2: Remove vectors from ChromaDB
    try:
        from app.services.vectorstore import delete_document_chunks
        await delete_document_chunks(
            document_id=document_id,
            user_id=str(current_user["_id"])
        )
    except Exception as e:
        # ChromaDB failed — leave status="deleting" so it's recoverable
        # Don't proceed to MongoDB deletion — user can retry
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove document vectors. Record marked for cleanup. Error: {e}"
        )

    # Step 3: Delete file from disk — log failure but don't abort
    # A stale file on disk doesn't affect query correctness (vectors are gone)
    if os.path.exists(doc["file_path"]):
        try:
            os.remove(doc["file_path"])
        except OSError as e:
            # Log it. Don't raise. The file is unreachable but harmless.
            print(f"[WARN] Could not delete file {doc['file_path']}: {e}. Continuing.")

    # Step 4: Delete MongoDB record — only after ChromaDB is clean
    await db.documents.delete_one({"_id": ObjectId(document_id)})

    return {"message": "Document deleted"}
```

---

## 8. Chunking & Embeddings

### `app/services/chunking.py`

```python
from typing import List
from langchain_text_splitters import RecursiveCharacterTextSplitter


# Why RecursiveCharacterTextSplitter and not a word-counter:
#
# Naive word splitting (text.split()) cuts blindly mid-sentence.
# Example: "The revenue was $4.2M. Operating costs rose 12%." split at
# word 8 becomes ["The revenue was $4.2M. Operating"] and ["costs rose 12%."]
# The first chunk now misleads the vector search — it looks like a revenue
# fact but has no complete context. The second chunk looks like an orphan.
#
# RecursiveCharacterTextSplitter tries to split at paragraph → sentence →
# word boundaries in that priority order. It preserves semantic units.
# Your embeddings become coherent representations of real ideas, not
# arbitrary word windows.

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,          # characters (not tokens — use tiktoken splitter if you need exact token counts)
    chunk_overlap=50,        # overlap preserves context at boundaries
    separators=[
        "\n\n",              # paragraph break — highest priority split point
        "\n",                # line break
        ". ",                # sentence boundary
        "? ",
        "! ",
        "; ",
        ", ",
        " ",                 # word boundary — last resort
        "",                  # character — absolute last resort
    ],
    length_function=len,
    is_separator_regex=False,
)


def chunk_text(text: str) -> List[str]:
    """
    Split text into semantically coherent overlapping chunks.
    Returns empty list for empty input.
    """
    if not text or not text.strip():
        return []
    chunks = _splitter.split_text(text)
    # Filter out chunks that are too short to be meaningful
    return [c for c in chunks if len(c.strip()) > 50]
```

> **Add to requirements.txt:** `langchain-text-splitters==0.2.2`
> This is the splitter module extracted from LangChain — no need to install the full `langchain` package.

### `app/services/embeddings.py`

```python
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
    client = OpenAI(api_key=settings.openai_api_key)

    # OpenAI has a max batch size — chunk if needed
    all_embeddings = []
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
    from sentence_transformers import SentenceTransformer
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
```

---

## 9. ChromaDB — Vector Storage

### `app/services/vectorstore.py`

```python
import chromadb
from typing import List, Optional
from app.core.config import settings
from app.services.embeddings import get_embeddings, get_query_embedding

# Persistent client — CRITICAL: without this, embeddings vanish on restart
_chroma_client = None


def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
    return _chroma_client


def get_collection():
    return get_chroma_client().get_or_create_collection(
        name="smartdocs",
        metadata={"hnsw:space": "cosine"},  # cosine similarity
    )


async def index_document_chunks(
    chunks: List[str],
    document_id: str,
    user_id: str,
    filename: str,
) -> None:
    """
    Embed all chunks and store in ChromaDB with metadata.
    CRITICAL: user_id in metadata is the security boundary.
    """
    if not chunks:
        return

    collection = get_collection()
    embeddings = get_embeddings(chunks)

    ids = [f"{document_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "user_id": user_id,           # SECURITY: filter by this at query time
            "document_id": document_id,
            "filename": filename,
            "chunk_index": i,
            "chunk_text": chunk[:200],    # Store excerpt for citations
        }
        for i, chunk in enumerate(chunks)
    ]

    collection.add(
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids,
    )


async def delete_document_chunks(document_id: str, user_id: str) -> None:
    """Remove all chunks for a document from ChromaDB."""
    collection = get_collection()
    collection.delete(
        where={
            "$and": [
                {"document_id": {"$eq": document_id}},
                {"user_id": {"$eq": user_id}},
            ]
        }
    )
```

---

## 10. Retrieval & Semantic Search

### `app/services/retrieval.py`

```python
from typing import List, Optional, Dict, Any
from app.services.vectorstore import get_collection
from app.services.embeddings import get_query_embedding


def retrieve_chunks(
    query: str,
    user_id: str,
    document_id: Optional[str] = None,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Semantic search with mandatory user_id filter.

    If document_id is provided, search only that document.
    Otherwise, search all documents belonging to user_id.

    This is where security is enforced at the retrieval layer.
    """
    collection = get_collection()
    query_embedding = get_query_embedding(query)

    # Build filter — user_id is always required
    if document_id:
        where_filter = {
            "$and": [
                {"user_id": {"$eq": user_id}},
                {"document_id": {"$eq": document_id}},
            ]
        }
    else:
        where_filter = {"user_id": {"$eq": user_id}}

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )

    # Format results
    chunks = []
    if results["documents"] and results["documents"][0]:
        for i, doc in enumerate(results["documents"][0]):
            chunks.append({
                "text": doc,
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i],
                "relevance_score": 1 - results["distances"][0][i],  # cosine: lower distance = higher relevance
            })

    # Filter out low-relevance results
    chunks = [c for c in chunks if c["relevance_score"] > 0.3]
    return sorted(chunks, key=lambda x: x["relevance_score"], reverse=True)
```

---

## 11. RAG Pipeline

### `app/services/rag.py`

```python
from typing import List, Optional, Dict, Any
from app.services.retrieval import retrieve_chunks
from app.core.config import settings


SYSTEM_PROMPT = """You are a document assistant. Your job is to answer questions 
using ONLY the context provided below. 

Rules:
- If the answer is in the context, answer clearly and cite the source document.
- If the answer is NOT in the context, say exactly: "I don't have enough information 
  in the uploaded documents to answer this."
- Never make up information. Never use knowledge outside the provided context.
- Keep answers concise and factual.
- Always mention which document(s) your answer comes from."""

CONTEXT_TEMPLATE = """
Document: {filename} (chunk {chunk_index})
---
{text}
"""


def build_context(chunks: List[Dict[str, Any]]) -> str:
    if not chunks:
        return "No relevant context found."
    parts = []
    for chunk in chunks:
        meta = chunk["metadata"]
        parts.append(CONTEXT_TEMPLATE.format(
            filename=meta.get("filename", "unknown"),
            chunk_index=meta.get("chunk_index", 0),
            text=chunk["text"],
        ))
    return "\n\n".join(parts)


def ask_llm(question: str, context: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {question}"
        },
    ]

    response = client.chat.completions.create(
        model=settings.openai_model,   # gpt-4o-mini: cheaper + smarter than gpt-3.5-turbo
        messages=messages,
        temperature=0.1,        # Low temperature = factual, less creative
        max_tokens=1000,
    )
    return response.choices[0].message.content


def run_rag_pipeline(
    question: str,
    user_id: str,
    document_id: Optional[str] = None,
    top_k: int = 5,
) -> Dict[str, Any]:
    """
    Full RAG pipeline:
    Question → Embed → Retrieve → Build Context → LLM → Answer + Sources
    """
    # Step 1: Retrieve relevant chunks
    chunks = retrieve_chunks(
        query=question,
        user_id=user_id,
        document_id=document_id,
        top_k=top_k,
    )

    if not chunks:
        return {
            "answer": "I don't have enough information in the uploaded documents to answer this.",
            "sources": [],
            "chunks_used": 0,
        }

    # Step 2: Build context string
    context = build_context(chunks)

    # Step 3: Call LLM
    answer = ask_llm(question=question, context=context)

    # Step 4: Format source citations
    sources = []
    seen = set()
    for chunk in chunks:
        meta = chunk["metadata"]
        key = (meta.get("document_id"), meta.get("chunk_index"))
        if key not in seen:
            seen.add(key)
            sources.append({
                "document_id": meta.get("document_id"),
                "filename": meta.get("filename"),
                "chunk_index": meta.get("chunk_index"),
                "excerpt": chunk["text"][:150] + "...",
                "relevance_score": round(chunk["relevance_score"], 3),
            })

    return {
        "answer": answer,
        "sources": sources,
        "chunks_used": len(chunks),
    }
```

### `app/routers/chat.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from bson import ObjectId

from app.models.chat import AskRequest, ChatMessage
from app.dependencies import get_db, get_current_user
from app.services.rag import run_rag_pipeline

router = APIRouter()


@router.post("/ask")
async def ask_question(
    request: AskRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])

    # Validate document_id belongs to this user if provided
    if request.document_id:
        doc = await db.documents.find_one({
            "_id": ObjectId(request.document_id),
            "user_id": user_id,
        })
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        if not doc.get("is_indexed"):
            raise HTTPException(
                status_code=400,
                detail="Document is still being indexed. Try again in a moment."
            )

    # Run RAG pipeline
    try:
        result = run_rag_pipeline(
            question=request.question,
            user_id=user_id,
            document_id=request.document_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI pipeline error: {str(e)}")

    # Persist to chat history
    message = ChatMessage(
        question=request.question,
        answer=result["answer"],
        sources=result["sources"],
    )

    await db.chat_history.update_one(
        {"user_id": user_id, "document_id": request.document_id},
        {
            "$push": {"messages": message.dict()},
            "$setOnInsert": {
                "user_id": user_id,
                "document_id": request.document_id,
                "created_at": datetime.utcnow(),
            },
        },
        upsert=True,
    )

    return {
        "question": request.question,
        "answer": result["answer"],
        "sources": result["sources"],
        "chunks_used": result["chunks_used"],
    }


@router.get("/history")
async def get_chat_history(
    document_id: str = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = {"user_id": str(current_user["_id"])}
    if document_id:
        query["document_id"] = document_id

    histories = await db.chat_history.find(query).to_list(length=50)
    # Serialize ObjectIds
    for h in histories:
        h["_id"] = str(h["_id"])
    return histories


@router.delete("/history")
async def clear_chat_history(
    document_id: str = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = {"user_id": str(current_user["_id"])}
    if document_id:
        query["document_id"] = document_id
    await db.chat_history.delete_many(query)
    return {"message": "Chat history cleared"}
```

---

## 12. Admin Routes

### `app/routers/admin.py`

```python
from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.dependencies import get_db, get_current_admin
from app.models.user import UserResponse

router = APIRouter()


@router.get("/users")
async def list_all_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    skip = (page - 1) * page_size
    total = await db.users.count_documents({})
    users = await db.users.find({}).skip(skip).limit(page_size).to_list(length=page_size)
    return {
        "items": [UserResponse.from_db(u) for u in users],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/documents")
async def list_all_documents(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    skip = (page - 1) * page_size
    total = await db.documents.count_documents({})
    pipeline = [
        {"$skip": skip},
        {"$limit": page_size},
        {
            "$lookup": {
                "from": "users",
                "localField": "user_id",
                "foreignField": "_id",
                "as": "owner",
            }
        },
    ]
    docs = await db.documents.aggregate(pipeline).to_list(length=page_size)
    for d in docs:
        d["_id"] = str(d["_id"])
    return {
        "items": docs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/stats")
async def platform_stats(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    total_users = await db.users.count_documents({})
    total_docs = await db.documents.count_documents({})
    total_indexed = await db.documents.count_documents({"is_indexed": True})
    total_chats = await db.chat_history.count_documents({})

    return {
        "total_users": total_users,
        "total_documents": total_docs,
        "indexed_documents": total_indexed,
        "total_chat_sessions": total_chats,
    }
```

---

## 13. Error Handling & Logging

### `app/core/logging.py`

```python
import logging
import sys
from app.core.config import settings


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )
    # Quiet down noisy libraries
    logging.getLogger("motor").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


logger = logging.getLogger("smartdocs")
```

Add to `main.py` startup:

```python
from app.core.logging import setup_logging
setup_logging()
```

### Global Exception Handler

Add to `main.py`:

```python
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check logs."},
    )
```

---

## 14. Requirements & Docker

### `requirements.txt`

```txt
# Web framework
fastapi==0.111.0
uvicorn[standard]==0.30.1
python-multipart==0.0.9

# Database
motor==3.4.0
pymongo==4.7.2

# Auth
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4

# Config
pydantic-settings==2.3.0
pydantic[email]==2.7.1

# File processing
PyMuPDF==1.24.5
python-docx==1.1.2

# Chunking — semantic splitter (not a word-counter)
langchain-text-splitters==0.2.2

# Embeddings
openai==1.35.7
sentence-transformers==3.0.1

# Vector store
chromadb==0.5.3

# Utilities
python-dotenv==1.0.1
```

### `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system deps for PyMuPDF
RUN apt-get update && apt-get install -y \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create upload and chroma directories
RUN mkdir -p uploads chroma_db

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### `docker-compose.yml`

```yaml
version: "3.9"

services:
  backend:
    build: .
    ports:
      - "8000:8000"
    env_file:
      - .env
    volumes:
      - ./uploads:/app/uploads
      - ./chroma_db:/app/chroma_db
    depends_on:
      - mongodb
    restart: unless-stopped

  mongodb:
    image: mongo:7.0
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    restart: unless-stopped

volumes:
  mongo_data:
```

---

## 15. Testing Checklist

Run these manually in order before building the frontend.

### Auth Tests

```bash
# 1. Register user
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","full_name":"Test User"}'

# 2. Login — save the token
curl -X POST http://localhost:8000/auth/login \
  -F "username=test@example.com" -F "password=password123"

# Set TOKEN variable
export TOKEN="<token from above>"

# 3. Get profile
curl http://localhost:8000/auth/me -H "Authorization: Bearer $TOKEN"
```

### Document Tests

```bash
# Upload a PDF
curl -X POST http://localhost:8000/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/your/test.pdf"

# List documents
curl http://localhost:8000/documents/ -H "Authorization: Bearer $TOKEN"
```

### RAG Tests

```bash
# Wait 10-15 seconds for background indexing

# Ask a question (use document_id from list response)
curl -X POST http://localhost:8000/chat/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is this document about?","document_id":"<doc_id>"}'

# Ask without document_id — searches all user documents
curl -X POST http://localhost:8000/chat/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"Summarize my documents"}'
```

### Security Test — Multi-User Isolation

```bash
# Create a second user, upload different documents
# Ask a question as User 2 using User 1's document_id
# Expected: 404 Not Found — not User 1's answer
```

**This test is not optional.** Run it before the demo.

---

## Common Failure Points

| Symptom | Cause | Fix |
|---|---|---|
| Ghost document after failed delete | Wrong deletion order + no status flag | Mark `status: "deleting"` first; delete Mongo LAST |
| ChromaDB delete fails, Mongo record survives | No partial failure handling | Abort and return 500 if ChromaDB fails; user retries |
| User gets 401 mid-session | 15-min access token with no refresh | Call `/auth/refresh` on 401; only redirect to login if refresh also fails |
| Stolen token works for hours | Long-lived access token | Keep access tokens at 15 min; refresh tokens handle continuity |
| Scanned PDF uploads silently, queries return nothing | Pre-flight check causes double I/O; or single-page heuristic gives false rejections | Extract once in background worker; raise `ScannedPDFError` if no text found; set `status: failed_unreadable`; frontend polls `/documents/{id}/status` |
| User doesn't know their PDF failed | `is_indexed: false` gives no detail | Three distinct status values: `indexed`, `failed_unreadable`, `failed_error` — each with a specific `error_message` |
| Document list cuts off at 100 | `to_list(length=100)` hardcoded | Skip/limit pagination with `total`, `page`, `total_pages` in response envelope |
| Admin sees only 500 users/docs max | `to_list(length=500)` hardcoded | Same pagination pattern; use `Query(ge=1, le=100)` to bound page_size |
| API freezes during document upload | CPU-bound embedding/extraction blocking event loop | Use `asyncio.to_thread()` for all sync CPU work |
| OOM crash on concurrent uploads | `await file.read()` loads entire file into RAM | Stream with 1MB chunks; reject oversized files during stream |
| Poor retrieval quality | Naive word-counter splits sentences mid-thought | Use `RecursiveCharacterTextSplitter` with sentence-aware separators |
| LLM hallucinating facts not in doc | `gpt-3.5-turbo` weak factual grounding | Use `gpt-4o-mini` — cheaper, larger context, less hallucination |
| ChromaDB empty after restart | Used in-memory client | Set `PersistentClient(path=...)` |
| `RuntimeError: no event loop` | Calling async function from sync context | Use `asyncio.run()` in thread wrappers |
| Document indexed but no results | `user_id` mismatch in ChromaDB filter | Log both stored and queried `user_id` values |
| OpenAI timeout breaks request | No try/except around LLM call | Wrap in try/except, return 503 with retry hint |
| JWT `sub` is ObjectId, not str | `ObjectId` not serializable | Always convert: `str(user["_id"])` |

---

*Next: Frontend (Streamlit) — build only after all tests above pass.*
