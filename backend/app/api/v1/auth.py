from fastapi import APIRouter, HTTPException, status
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth_service import authenticate_officer, create_access_token

router = APIRouter()

@router.post("/login", response_model=TokenResponse, summary="Officer Login with Phone & PIN")
async def login(request: LoginRequest):
    officer = authenticate_officer(request.phone, request.pin)
    if not officer:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid phone number or PIN. Ensure account is active."
        )
    return create_access_token(officer)
