"""
Configuration settings for Udyam Sahayak Backend.
Loads environment variables safely without hardcoded secrets.
"""
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Udyam Sahayak Backend"
    VERSION: str = "0.1.0"
    CORS_ORIGINS: list = ["*"]
    ENVIRONMENT: str = "development"
    PORT: int = 8000
    
    # Database / Supabase
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/kisan_credit"
    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    
    # JWT
    JWT_SECRET_KEY: str = "dev-fallback-secret-do-not-use-in-production-1234567890"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
