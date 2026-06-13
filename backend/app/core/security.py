from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from app.core.config import settings


def hash_password(plain_password: str) -> str:
    pwd_bytes = plain_password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        pwd_bytes = plain_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False


def create_access_token(user_id: str) -> str:
    """Short-lived. Expires in ACCESS_TOKEN_EXPIRE_MINUTES (default: 15)."""
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "type": "access", "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def create_refresh_token(user_id: str) -> str:
    """
    Long-lived. Expires in REFRESH_TOKEN_EXPIRE_DAYS (default: 7).
    Uses a SEPARATE secret key from the access token.

    Why a separate secret?
    If you need to invalidate ALL refresh tokens (e.g., after a breach),
    you rotate REFRESH_SECRET_KEY without touching SECRET_KEY.
    Access tokens still work; only refresh is revoked. Gives you surgical
    revocation instead of logging out every user simultaneously.
    """
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    return jwt.encode(
        {"sub": user_id, "type": "refresh", "exp": expire},
        settings.refresh_secret_key or settings.secret_key,  # fallback if not set
        algorithm=settings.algorithm,
    )


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def decode_refresh_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(
            token,
            settings.refresh_secret_key or settings.secret_key,
            algorithms=[settings.algorithm],
        )
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None
