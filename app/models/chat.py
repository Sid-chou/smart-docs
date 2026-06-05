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
