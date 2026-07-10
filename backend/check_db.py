import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_latest_doc():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.smartdocs
    
    # Get the most recent document
    doc = await db.documents.find_one({}, sort=[("uploaded_at", -1)])
    if doc:
        print(f"Filename: {doc.get('original_filename')}")
        print(f"Status: {doc.get('status')}")
        print(f"Error Message: {doc.get('error_message', 'No error message')}")
    else:
        print("No documents found in database.")

if __name__ == "__main__":
    asyncio.run(check_latest_doc())
