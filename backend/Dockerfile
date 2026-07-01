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

# IMPORTANT — Render free tier has 512 MB RAM.
# --workers 1: Each extra worker forks the process and loads ChromaDB + all
#   Python state into a separate memory space. 2 workers = 2x RAM usage.
#   On 512 MB, even 2 workers = OOM crash. 1 worker is mandatory.
# --timeout-keep-alive 5: Reduces idle HTTP connection memory overhead.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "5"]
