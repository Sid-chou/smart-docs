from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    # MongoDB settings
    mongodb_url: str = "mongodb://localhost:27017"
    database_name: str = "smartdocs"

    # CORS settings
    cors_origins: str = "http://localhost:3000"

    # JWT Authentication settings
    secret_key: str = "your-super-secret-key-change-this-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_secret_key: str = ""
    refresh_token_expire_days: int = 7

    # OpenAI / LLM settings
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str | None = None
    embedding_model: str = "text-embedding-3-small"

    # Embedding Strategy
    embedding_strategy: str = "local"  # "openai" or "local"

    # ChromaDB settings
    chroma_persist_dir: str = "./chroma_db"

    # File upload settings
    upload_dir: str = "./uploads"
    max_file_size_mb: int = 10

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
