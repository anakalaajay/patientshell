import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.me import router as me_router
from app.api.routes.patient import router as patient_router
from app.api.routes.documents import router as documents_router
from app.api.routes.doctor import router as doctor_router
from app.api.routes.ai import router as ai_router


app = FastAPI(
    title="Patientshell API",
    version="0.5.0",
    description="Patient portal, document intelligence, and Dr. Anya AI companion API.",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/api/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Return a lightweight status response for deployment and monitoring checks."""
    return {"status": "ok", "service": "patientshell-api"}


app.include_router(me_router, prefix="/api")
app.include_router(patient_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(doctor_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
