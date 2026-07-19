from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.models import router as models_router
from app.api.v1.sync import router as sync_router
from app.api.v1.admin import router as admin_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
api_router.include_router(models_router, prefix="/models", tags=["ML Models"])
api_router.include_router(sync_router, prefix="/sync", tags=["Offline Sync"])
api_router.include_router(admin_router, prefix="/admin", tags=["Institution Admin"])

