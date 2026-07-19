from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class LoginRequest(BaseModel):
    phone: str = Field(..., description="Officer phone number (e.g. +919876543210)")
    pin: str = Field(..., description="Officer 4-digit PIN")

class OfficerInfo(BaseModel):
    id: str
    institution_id: str
    name: str
    phone: str
    active: bool

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 43200 # 12 hours in seconds
    officer: OfficerInfo

class JWTPayload(BaseModel):
    sub: str # officer_id
    institution_id: str
    phone: str
    role: str = "field_officer"
    exp: int
