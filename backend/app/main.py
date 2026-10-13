"""Patientshell API and optional single-origin SPA serving.

In production the Docker image copies frontend/dist beside backend/. During API
development the directory is absent, so FastAPI remains an API-only service.
"""
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes.me import router as me_router
from app.api.routes.patient import router as patient_router
from app.api.routes.documents import router as documents_router
from app.api.routes.doctor import router as doctor_router
from app.api.routes.ai import router as ai_router

app = FastAPI(
    title="Patientshell API",
    version="0.9.0",
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


@app.get("/health", tags=["health"])
@app.get("/api/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Lightweight liveness endpoint; does not imply database/provider readiness."""
    return {"status": "ok", "service": "patientshell-api"}


app.include_router(me_router, prefix="/api")
app.include_router(patient_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(doctor_router, prefix="/api")
app.include_router(ai_router, prefix="/api")

# The image layout is /app/backend/app/main.py and /app/frontend/dist.
# Locally this path is simply absent until the frontend has been built.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", str(PROJECT_ROOT / "frontend" / "dist"))).resolve()
INDEX_HTML = FRONTEND_DIST / "index.html"
ASSETS_DIR = FRONTEND_DIST / "assets"

if ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="frontend-assets")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_spa(full_path: str):
    """Serve the SPA for browser routes, never mask API or health endpoints."""
    if full_path == "health" or full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found.")

    if INDEX_HTML.is_file():
        # FileResponse serves index.html for client-side routes; Vite assets use /assets.
        return FileResponse(INDEX_HTML)

    return JSONResponse(
        status_code=404,
        content={
            "detail": "Frontend build not found. Run the frontend dev server separately "
            "or build frontend/dist to enable unified serving."
        },
    )
