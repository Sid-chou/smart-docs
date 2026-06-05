from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId
from app.models.user import PyObjectId


class DocumentInDB(BaseModel):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    user_id: str                    # str form of user ObjectId
    filename: str
    original_filename: str
    file_path: str                  # path on disk
    file_type: str                  # "pdf", "txt", "docx"
    file_size_bytes: int
    status: str = "pending"         # pending | indexed | failed_unreadable | failed_error | deleting
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
            is_indexed=doc.get("is_indexed", False),
            chunk_count=doc.get("chunk_count", 0),
            error_message=doc.get("error_message"),
            uploaded_at=doc["uploaded_at"],
        )
