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
