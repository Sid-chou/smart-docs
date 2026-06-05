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
        "items": [UserResponse.from_db(u).dict(by_alias=True) for u in users],
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
        # Stringify owner _id to avoid ObjectId serialization errors
        if d.get("owner"):
            for owner in d["owner"]:
                owner["_id"] = str(owner["_id"])
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
