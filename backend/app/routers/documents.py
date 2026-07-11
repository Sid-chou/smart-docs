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
    # await file.read() on a large PDF spikes RAM.
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

    Memory discipline:
      - `text` and `chunks` are explicitly deleted after use.
      - Raw uploaded file is removed after indexing — it's dead weight once
        vectors are in MongoDB Atlas. Render's disk is ephemeral anyway.
      - gc.collect() forces reclaim after heavy allocations in a worker thread.
    """
    import gc
    from app.services.extraction import ScannedPDFError

    try:
        # Single extraction pass — CPU-bound, offload to thread
        text = await asyncio.to_thread(extract_text, file_path, file_type)
        chunks = await asyncio.to_thread(chunk_text, text)

        # Free the raw text string immediately — chunks are all we need
        del text
        gc.collect()

        await asyncio.to_thread(
            _sync_index_chunks,
            chunks, document_id, user_id, os.path.basename(file_path)
        )

        chunk_count = len(chunks)
        # Free chunks array — vectors are now in MongoDB Atlas
        del chunks
        gc.collect()

        await db.documents.update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {
                "status": "indexed",
                "is_indexed": True,
                "chunk_count": chunk_count,
            }}
        )

    except ScannedPDFError as e:
        # Known, recoverable condition — scanned image PDF.
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
        import traceback
        error_details = f"Indexing failed: {str(e)}"
        print(f"[INDEXING ERROR] doc={document_id} error={e!r}")
        traceback.print_exc()
        await db.documents.update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {
                "status": "failed_error",
                "is_indexed": False,
                "error_message": error_details,
            }}
        )

    finally:
        # Always clean up the raw file — it's dead weight once indexed
        # (or failed). Render's disk is ephemeral and 512 MB RAM can't
        # afford to buffer raw PDFs indefinitely.
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as cleanup_err:
                print(f"[WARN] Could not remove uploaded file {file_path}: {cleanup_err}")


def _sync_index_chunks(chunks, document_id, user_id, filename):
    """
    Synchronous wrapper for Atlas vector indexing.
    Called via asyncio.to_thread() — runs in a worker thread, not the event loop.
    """
    index_document_chunks(
        chunks=chunks,
        document_id=document_id,
        user_id=user_id,
        filename=filename,
    )


@router.get("/{document_id}/status")
async def get_document_status(
    document_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Polling endpoint for the frontend to check indexing status.
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
    Paginated document list with response envelope.
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
    Ordered deletion across three systems: Atlas chunks, disk, MongoDB.
    """
    doc = await db.documents.find_one({
        "_id": ObjectId(document_id),
        "user_id": str(current_user["_id"])
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Step 1: Mark as deleting
    await db.documents.update_one(
        {"_id": ObjectId(document_id)},
        {"$set": {"status": "deleting"}}
    )

    # Step 2: Remove vectors from MongoDB Atlas chunks collection
    try:
        from app.services.vectorstore import delete_document_chunks
        delete_document_chunks(
            document_id=document_id,
            user_id=str(current_user["_id"])
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove document vectors. Record marked for cleanup. Error: {e}"
        )

    # Step 3: Delete file from disk
    if os.path.exists(doc["file_path"]):
        try:
            os.remove(doc["file_path"])
        except OSError as e:
            print(f"[WARN] Could not delete file {doc['file_path']}: {e}. Continuing.")

    # Step 4: Delete MongoDB record
    await db.documents.delete_one({"_id": ObjectId(document_id)})

    return {"message": "Document deleted"}
