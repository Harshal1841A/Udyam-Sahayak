import time
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from passlib.context import CryptContext
from fastapi import HTTPException, status
from app.config import settings
from app.schemas.auth import LoginRequest, TokenResponse, OfficerInfo, JWTPayload
from app.services.db_service import get_db_connection

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

import bcrypt as _native_bcrypt

def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    if plain_pin == hashed_pin:
        return True
    try:
        if hashed_pin.startswith("$2b$") or hashed_pin.startswith("$2a$"):
            try:
                return _native_bcrypt.checkpw(plain_pin.encode('utf-8'), hashed_pin.encode('utf-8'))
            except Exception:
                return pwd_context.verify(plain_pin, hashed_pin)
    except Exception:
        return False
    return False

def hash_pin(pin: str) -> str:
    try:
        return _native_bcrypt.hashpw(pin.encode('utf-8'), _native_bcrypt.gensalt()).decode('utf-8')
    except Exception:
        try:
            return pwd_context.hash(pin)
        except Exception:
            return pin

def authenticate_officer(phone: str, pin: str) -> Optional[OfficerInfo]:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, institution_id, name, phone, pin_hash, active FROM officers WHERE phone = ?", (phone,))
    row = cur.fetchone()
    conn.close()
    
    if not row:
        return None
    
    officer = dict(row)
    if not officer["active"]:
        return None
    
    if not verify_pin(pin, officer["pin_hash"]):
        return None
    
    return OfficerInfo(
        id=officer["id"],
        institution_id=officer["institution_id"],
        name=officer["name"],
        phone=officer["phone"],
        active=bool(officer["active"])
    )

def create_access_token(officer: OfficerInfo) -> TokenResponse:
    expires_in = 43200 # 12 hours
    exp = int(time.time()) + expires_in
    
    payload = {
        "sub": officer.id,
        "institution_id": officer.institution_id,
        "phone": officer.phone,
        "role": "field_officer",
        "exp": exp
    }
    
    access_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in,
        officer=officer
    )

def decode_access_token(token: str) -> JWTPayload:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return JWTPayload(**payload)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired. Please login again."
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials."
        )
