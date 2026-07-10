import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import chromadb
import chromadb.config

async def check_state():
    # Check MongoDB for all documents
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.smartdocs
    
    docs = await db.documents.find({}).to_list(length=50)
    print(f"\n=== MongoDB: {len(docs)} documents ===")
    for doc in docs:
        print(f"  [{doc.get('status')}] {doc.get('original_filename')} | chunks: {doc.get('chunk_count', 0)} | error: {doc.get('error_message', '-')[:80]}")

    # Check ChromaDB for actual stored vectors
    settings_chroma = chromadb.config.Settings(anonymized_telemetry=False)
    chroma = chromadb.PersistentClient(path="./chroma_db", settings=settings_chroma)
    try:
        collection = chroma.get_collection("smartdocs_chunks")
        count = collection.count()
        print(f"\n=== ChromaDB: {count} vectors stored ===")
    except Exception as e:
        print(f"\n=== ChromaDB: collection not found or empty ({e}) ===")

if __name__ == "__main__":
    asyncio.run(check_state())
