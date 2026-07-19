from fastapi import APIRouter, HTTPException, status, Depends, Header
from app.schemas.models import SyncBatchRequest, SyncBatchResponse
from app.services.sync_service import process_sync_batch
from app.services.auth_service import decode_access_token

router = APIRouter()

async def get_current_officer(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    return payload

@router.post("/batch", response_model=SyncBatchResponse, summary="Batch Sync Enterprises, Consents, & Proxy Records from On-Device Queue")
async def sync_batch(request: SyncBatchRequest, current_officer = Depends(get_current_officer)):
    # Ensure officer submitting matches token or is from same institution
    if request.institution_id != current_officer.institution_id:
        raise HTTPException(status_code=403, detail="Institution mismatch during sync")
    if request.officer_id != current_officer.sub:
        raise HTTPException(status_code=403, detail="Officer ID in request body does not match authenticated token.")
    return process_sync_batch(request, current_officer.sub)
