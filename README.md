# SmartDocs AI - Backend

SmartDocs AI is a secure, multi-tenant RAG (Retrieval-Augmented Generation) document assistant. It allows users to upload documents (PDF, DOCX, TXT), extracts and indexes their contents into vector storage (ChromaDB) and metadata storage (MongoDB), and enables natural language Q&A with strict user-level isolation.

## 🚀 Features

- **User Authentication**: Secure user registration and login using JWT (Access & Refresh tokens) and bcrypt.
- **Document Management**: Upload, list, and delete documents. Extracts text from PDFs, DOCX, and TXT files.
- **Vector Storage**: Asynchronously chunks and embeds documents into ChromaDB for semantic search.
- **RAG Pipeline**: Integrates with OpenAI (`gpt-4o-mini`) and sentence-transformers (`all-MiniLM-L6-v2`) to provide context-aware answers to user questions based on their uploaded documents.
- **Chat History**: Persists Q&A sessions.
- **Multi-Tenant Isolation**: Strict security ensuring users can only search and access their own documents.

## 🛠️ Technology Stack

- **Framework**: FastAPI (Python 3.11+)
- **Metadata Database**: MongoDB (Motor async driver)
- **Vector Database**: ChromaDB (local persistence)
- **Embeddings**: Sentence-Transformers / OpenAI
- **LLM Engine**: OpenAI (`gpt-4o-mini`)
- **Deployment**: Docker & Docker Compose

## ⚙️ Setup & Installation

### Prerequisites

- Python 3.11+
- Docker and Docker Compose (if running via containers)
- MongoDB (if running locally without Docker)

### 1. Clone the repository

```bash
git clone https://github.com/Sid-chou/smart-docs.git
cd smart-docs
```

### 2. Environment Configuration

Create a `.env` file in the root directory based on the following template:

```env
# MongoDB
MONGODB_URL=mongodb://mongo:27017 # or mongodb://localhost:27017 for local
DATABASE_NAME=smartdocs

# JWT
SECRET_KEY=your-super-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# OpenAI
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# Embedding strategy: "openai" or "local"
EMBEDDING_STRATEGY=local

# ChromaDB
CHROMA_PERSIST_DIR=./chroma_db

# File Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
```

### 3. Run with Docker Compose

The easiest way to run the application is using Docker. This will spin up the FastAPI backend and a MongoDB instance.

```bash
docker-compose up --build
```

The API will be available at `http://localhost:8000`. You can access the interactive API documentation at `http://localhost:8000/docs`.

### 4. Run Locally (Without Docker)

If you prefer to run it locally for development:

```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Make sure MongoDB is running locally
# Start the FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 📖 API Endpoints Overview

- **Auth**: `/auth/register`, `/auth/login`, `/auth/me`, `/auth/refresh`
- **Documents**: `/documents/upload`, `/documents/list`, `/documents/{id}/status`, `/documents/{id}` (Delete)
- **Chat**: `/chat/ask`, `/chat/history`
- **Admin**: `/admin/stats`, `/admin/users`, `/admin/documents`

Visit `http://localhost:8000/docs` for the complete OpenAPI specification and to test the endpoints interactively.

## 🧪 Testing

A Python verification script (`verify_endpoints.py`) is provided to test the end-to-end lifecycle, including auth, document uploads, polling, and RAG QA.

```bash
python verify_endpoints.py
```
