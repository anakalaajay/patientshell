"""Patient-only, ownership-scoped Dr. Anya document explanation endpoint."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from supabase import Client

from app.api.routes.patient import get_patient_context
from app.services.ai_companion import explain_document

router = APIRouter(prefix="/patient/ai", tags=["patient-ai"])

class ExplainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: str = Field(min_length=1, max_length=100)
    question: str | None = Field(default=None, max_length=1500)
    language: str = Field(default="en", pattern="^(en|te)$")

@router.post("/explain")
def explain(
    request: ExplainRequest,
    context: tuple[dict[str, Any], Client] = Depends(get_patient_context),
) -> dict[str, Any]:
    """Explain only a document belonging to the JWT-authenticated patient."""
    profile, client = context
    patient_id = profile["id"]
    try:
        document_result = (
            client.table("medical_documents")
            .select("id, patient_id, file_name, document_date, processing_status, document_type")
            .eq("id", request.document_id)
            .eq("patient_id", patient_id)
            .maybe_single()
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=503, detail="Unable to retrieve this document.") from None
    document = document_result.data
    if not document:
        # Do not disclose whether another patient's document ID exists.
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        extracted_result = (
            client.table("extracted_document_data")
            .select("id, patient_id, document_id, extracted_data, confidence, review_status, created_at")
            .eq("document_id", document["id"])
            .eq("patient_id", patient_id)
            .order("created_at")
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=503, detail="Unable to retrieve extracted document facts.") from None
    return explain_document(
        document=document,
        entities=extracted_result.data or [],
        question=request.question,
        language=request.language,
    )
