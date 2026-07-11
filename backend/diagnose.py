"""
diagnose.py — Full RAG pipeline health check
Run: python diagnose.py

Checks every layer:
  1. Env vars present
  2. MongoDB Atlas connection
  3. chunks collection exists & has data
  4. Embedding API works
  5. Vector search index exists & returns results
  6. Full end-to-end RAG answer
"""

import os, sys
from dotenv import load_dotenv
load_dotenv()

SEP = "\n" + "-" * 60

def ok(msg):  print(f"  [OK]   {msg}")
def fail(msg): print(f"  [FAIL] {msg}")
def info(msg): print(f"  [INFO] {msg}")
def warn(msg): print(f"  [WARN] {msg}")

# ── 1. Env vars ───────────────────────────────────────────────────────────────
print(SEP)
print("STEP 1 — Environment variables")
print(SEP)

MONGO_URL        = os.getenv("MONGODB_URL", "")
DB_NAME          = os.getenv("DATABASE_NAME", "smartdocs")
API_KEY          = os.getenv("OPENAI_API_KEY", "")
EMBED_STRATEGY   = os.getenv("EMBEDDING_STRATEGY", "openai")
EMBED_MODEL      = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
OPENAI_MODEL     = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
BASE_URL         = os.getenv("OPENAI_BASE_URL", "")

if MONGO_URL:
    masked = MONGO_URL[:30] + "..." if len(MONGO_URL) > 30 else MONGO_URL
    ok(f"MONGODB_URL = {masked}")
else:
    fail("MONGODB_URL is empty — set it in .env or Render env vars")

if API_KEY and API_KEY != "sk-...":
    ok(f"OPENAI_API_KEY = {API_KEY[:8]}...")
else:
    fail("OPENAI_API_KEY is missing or placeholder 'sk-...'")

if EMBED_STRATEGY == "openai":
    ok(f"EMBEDDING_STRATEGY = {EMBED_STRATEGY}")
else:
    fail(f"EMBEDDING_STRATEGY = '{EMBED_STRATEGY}' — must be 'openai' (local crashes Render 512MB)")

info(f"EMBEDDING_MODEL  = {EMBED_MODEL}")
info(f"OPENAI_MODEL     = {OPENAI_MODEL}")
info(f"OPENAI_BASE_URL  = {BASE_URL or '(not set)'}")
info(f"DATABASE_NAME    = {DB_NAME}")


# ── 2. MongoDB connection ─────────────────────────────────────────────────────
print(SEP)
print("STEP 2 — MongoDB Atlas connection")
print(SEP)

try:
    import pymongo
    client = pymongo.MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    ok("Connected to MongoDB Atlas")

    db = client[DB_NAME]

    # List collections
    cols = db.list_collection_names()
    info(f"Collections found: {cols}")

    for expected in ("users", "documents", "chunks"):
        if expected in cols:
            count = db[expected].count_documents({})
            ok(f"  '{expected}' collection exists — {count} documents")
        else:
            if expected == "chunks":
                fail(f"  'chunks' collection NOT FOUND — chunking has never run or migration incomplete")
            else:
                warn(f"  '{expected}' collection not found yet")

except Exception as e:
    fail(f"MongoDB connection failed: {e}")
    print("\nAbort — cannot continue without DB connection.\n")
    sys.exit(1)


# ── 3. chunks deep-dive ───────────────────────────────────────────────────────
print(SEP)
print("STEP 3 — chunks collection deep-dive")
print(SEP)

chunks_col = db["chunks"]
total_chunks = chunks_col.count_documents({})
info(f"Total chunks stored: {total_chunks}")

if total_chunks == 0:
    fail("No chunks found. Either:")
    info("   a) You haven't uploaded a document yet after the Atlas migration")
    info("   b) The indexing background task crashed (check Render logs)")
    info("   c) The Atlas vector search index hasn't been created yet")
else:
    ok(f"{total_chunks} chunks exist")

    # Sample one chunk
    sample = chunks_col.find_one({}, {"text": 1, "user_id": 1, "document_id": 1,
                                      "filename": 1, "chunk_index": 1, "embedding": 1})
    if sample:
        has_embed = "embedding" in sample and len(sample.get("embedding", [])) > 0
        embed_dims = len(sample.get("embedding", [])) if has_embed else 0
        info(f"Sample chunk — filename: {sample.get('filename')}, chunk_index: {sample.get('chunk_index')}")
        info(f"  text preview: {sample.get('text','')[:120]}...")
        if has_embed:
            ok(f"  embedding present — {embed_dims} dimensions")
        else:
            fail("  embedding field is MISSING — chunks stored without vectors, RAG cannot work")

    # Show unique documents indexed
    doc_ids = chunks_col.distinct("document_id")
    ok(f"Documents indexed in chunks: {len(doc_ids)}")
    for did in doc_ids[:5]:
        c = chunks_col.count_documents({"document_id": did})
        fname = chunks_col.find_one({"document_id": did}, {"filename": 1})
        info(f"  doc {did[:12]}... → {fname.get('filename','?')} ({c} chunks)")


# ── 4. Embedding API ──────────────────────────────────────────────────────────
print(SEP)
print("STEP 4 — Embedding API test")
print(SEP)

try:
    import httpx

    model = EMBED_MODEL
    if model in ("text-embedding-004", "text-embedding-3-small", "text-embedding-ada-002"):
        model = "gemini-embedding-001"
    model = model.replace("models/", "")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"
    payload = {
        "requests": [
            {
                "model": f"models/{model}",
                "content": {"parts": [{"text": "test sentence for embedding"}]},
            }
        ]
    }

    with httpx.Client(timeout=15.0) as hx:
        resp = hx.post(url, headers={"x-goog-api-key": API_KEY, "Content-Type": "application/json"}, json=payload)

    if resp.status_code == 200:
        data = resp.json()
        dims = len(data["embeddings"][0]["values"])
        ok(f"Embedding API works — model={model}, dims={dims}")
        if dims != 3072:
            warn(f"  Heads up: your Atlas vector index is configured for 3072 dims. Got {dims}.")
            warn(f"  Update numDimensions in the Atlas vector index to {dims} to avoid query errors.")
    else:
        fail(f"Embedding API returned {resp.status_code}: {resp.text[:300]}")

except Exception as e:
    fail(f"Embedding API call failed: {e}")


# ── 5. Vector search index check ─────────────────────────────────────────────
print(SEP)
print("STEP 5 — Atlas vector search index check")
print(SEP)

try:
    indexes = list(chunks_col.list_search_indexes())
    if not indexes:
        fail("No search indexes found on 'chunks' collection")
        info("You must create the vector index in Atlas UI:")
        info("  Atlas → cluster → Search Indexes → Create Search Index")
        info("  Type: Atlas Vector Search, Collection: chunks, Name: vector_index")
        info("  JSON: { \"fields\": [{ \"type\": \"vector\", \"path\": \"embedding\",")
        info("          \"numDimensions\": 3072, \"similarity\": \"cosine\" },")
        info("          { \"type\": \"filter\", \"path\": \"user_id\" },")
        info("          { \"type\": \"filter\", \"path\": \"document_id\" }] }")
    else:
        for idx in indexes:
            status = idx.get("status", "unknown")
            name   = idx.get("name", "unnamed")
            if status == "READY":
                ok(f"Index '{name}' is READY")
            elif status == "BUILDING":
                warn(f"Index '{name}' is still BUILDING — wait ~1 min then redeploy")
            else:
                fail(f"Index '{name}' status: {status}")
except Exception as e:
    warn(f"Could not list search indexes (pymongo < 4.7?): {e}")
    info("Check manually in Atlas UI → Search Indexes")


# ── 6. End-to-end vector search ───────────────────────────────────────────────
print(SEP)
print("STEP 6 — End-to-end vector search test (requires chunks + index)")
print(SEP)

if total_chunks == 0:
    warn("Skipping — no chunks to search")
else:
    try:
        import httpx

        model = EMBED_MODEL
        if model in ("text-embedding-004", "text-embedding-3-small", "text-embedding-ada-002"):
            model = "gemini-embedding-001"
        model = model.replace("models/", "")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"
        payload = {
            "requests": [{
                "model": f"models/{model}",
                "content": {"parts": [{"text": "summarize the document"}]},
            }]
        }

        with httpx.Client(timeout=15.0) as hx:
            resp = hx.post(url, headers={"x-goog-api-key": API_KEY, "Content-Type": "application/json"}, json=payload)
        resp.raise_for_status()
        query_vec = resp.json()["embeddings"][0]["values"]

        # Use actual user_id from a real chunk
        sample_uid = chunks_col.find_one({}, {"user_id": 1})["user_id"]

        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "embedding",
                    "queryVector": query_vec,
                    "numCandidates": 50,
                    "limit": 3,
                    "filter": {"user_id": {"$eq": sample_uid}},
                }
            },
            {
                "$project": {
                    "_id": 0, "text": 1, "filename": 1, "chunk_index": 1,
                    "score": {"$meta": "vectorSearchScore"},
                }
            },
        ]

        results = list(chunks_col.aggregate(pipeline))

        if results:
            ok(f"Vector search returned {len(results)} chunks:")
            for r in results:
                info(f"  [{r['filename']}] chunk {r['chunk_index']} — score {r['score']:.3f}")
                info(f"  {r['text'][:100]}...")
        else:
            fail("Vector search returned 0 results — check the index status in Atlas UI")

    except Exception as e:
        fail(f"Vector search failed: {e}")
        info("If error mentions 'index not found' — the Atlas vector index is missing or not READY")


# ── Summary ───────────────────────────────────────────────────────────────────
print(SEP)
print("DIAGNOSIS COMPLETE")
print(SEP)
print("""
Next steps by symptom:
  • chunks = 0      → Re-upload a document (old chroma_db data is gone)
  • embedding fail  → Check OPENAI_API_KEY in Render env vars
  • index not found → Create 'vector_index' in Atlas UI (see STEP 5 output)
  • index BUILDING  → Wait 1 min, try again
  • search = 0 hits → Dimension mismatch between model and index numDimensions
""")
