from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.routes.doctor import get_doctor_context, router as doctor_router


def test_non_doctor_receives_403_on_doctor_route():
    app = FastAPI()
    app.include_router(doctor_router, prefix="/api")
    def deny_non_doctor():
        raise HTTPException(status_code=403, detail="Doctor access is restricted.")
    app.dependency_overrides[get_doctor_context] = deny_non_doctor
    response = TestClient(app).get("/api/doctor/queue")
    assert response.status_code == 403
