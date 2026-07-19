from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.router import api_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Udyam Sahayak Backend — Gate 3 (Full Suite: Multi-Cluster, Audio, Climate Modifier, Institution Admin Dashboard)"
)

# CORS configuration for PWA access
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API v1 router
app.include_router(api_router, prefix="/api/v1")

@app.get("/health", tags=["Health"])
@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "kisan-credit-copilot-backend",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "gate": 3
    }

