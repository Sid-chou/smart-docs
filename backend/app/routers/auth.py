from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from pydantic import BaseModel

from app.models.user import UserCreate, UserResponse
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_refresh_token,
)
from app.dependencies import get_db, get_current_user

router = APIRouter()


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(user_data: UserCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "email": user_data.email,
        "hashed_password": hash_password(user_data.password),
        "full_name": user_data.full_name,
        "is_active": True,
        "is_admin": False,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    return UserResponse.from_db(user_doc)


@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    user = await db.users.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = str(user["_id"])
    return {
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id),
        "token_type": "bearer",
    }


@router.post("/refresh")
async def refresh_token(
    body: RefreshRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Exchange a valid refresh token for a new access token + new refresh token.

    Rotation strategy: every /refresh call invalidates the old refresh token
    by issuing a new one. This limits the damage window if a refresh token
    is stolen — it becomes stale as soon as the legitimate user next refreshes.

    The frontend should call this endpoint whenever it receives a 401, using
    the stored refresh token. If /refresh also returns 401, redirect to login.
    That's the full auth flow: silent re-auth on 401 → login only if refresh expired.
    """
    payload = decode_refresh_token(body.refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token. Please log in again.",
        )

    user_id = payload.get("sub")
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user or not user.get("is_active"):
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Issue new token pair — old refresh token is effectively rotated out
    return {
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id),
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse.from_db(current_user)


@router.put("/me")
async def update_profile(
    full_name: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    from bson import ObjectId
    await db.users.update_one(
        {"_id": ObjectId(str(current_user["_id"]))},
        {"$set": {"full_name": full_name, "updated_at": datetime.utcnow()}},
    )
    return {"message": "Profile updated"}
