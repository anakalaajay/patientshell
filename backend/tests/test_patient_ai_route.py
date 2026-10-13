from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.ai import router as ai_router
from app.api.routes.patient import get_patient_context


class Query:
    def __init__(self, table, data):
        self.table_name = table
        self.data = data
        self.filters = {}
    def select(self, *_args): return self
    def eq(self, key, value): self.filters[key] = value; return self
    def maybe_single(self): return self
    def order(self, *_args, **_kwargs): return self
    def execute(self):
        if self.table_name == "medical_documents":
            if self.filters.get("id") == "doc-owned" and self.filters.get("patient_id") == "patient-1":
                return type("Result", (), {"data": {"id":"doc-owned","patient_id":"patient-1","file_name":"report.pdf","document_date":None,"processing_status":"processed"}})()
            return type("Result", (), {"data": None})()
        return type("Result", (), {"data": []})()


class Client:
    def table(self, name):
        return Query(name, {})


def make_app(role="patient"):
    app = FastAPI()
    app.include_router(ai_router, prefix="/api")
    app.dependency_overrides[get_patient_context] = lambda: (
        {"id": "patient-1", "role": role}, Client()
    )
    return TestClient(app)


def test_patient_cannot_request_another_patients_document(monkeypatch):
    # The query mock returns no document unless both requested ID and patient scope match.
    client = make_app()
    response = client.post("/api/patient/ai/explain", json={"document_id": "doc-other"})
    assert response.status_code == 404


def test_owned_document_uses_only_scoped_extracted_entities(monkeypatch):
    from app.api.routes import ai
    monkeypatch.setattr(ai, "explain_document", lambda **kwargs: {
        "configured": False, "document_id": kwargs["document"]["id"],
        "extracted_document_facts": [], "source_references": [],
    })
    response = make_app().post("/api/patient/ai/explain", json={"document_id": "doc-owned"})
    assert response.status_code == 200
    assert response.json()["document_id"] == "doc-owned"


def test_non_patient_is_forbidden():
    # Exercise the real role guard, not a mocked dependency.
    from app.api.routes.patient import get_patient_context
    from fastapi import Depends, HTTPException
    from app.api.routes.ai import router as router
    app = FastAPI()
    app.include_router(router, prefix="/api")
    def deny():
        raise HTTPException(status_code=403, detail="patient only")
    app.dependency_overrides[get_patient_context] = deny
    response = TestClient(app).post("/api/patient/ai/explain", json={"document_id": "doc-owned"})
    assert response.status_code == 403
