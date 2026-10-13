"""Patient-owned document upload, extraction, and human review API."""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import PurePath
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field
from supabase import Client

from app.api.routes.patient import get_patient_context
from app.core.auth import bearer_scheme
from app.services.document_processor import (
    DocumentValidationError,
    MAX_DOCUMENT_BYTES,
    process_document,
    validate_document,
)

router = APIRouter(prefix="/patient/documents", tags=["patient-documents"])
BUCKET = "medical-records"


class ExtractedDataCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str = Field(pattern="^(confirm|correct|reject)$")
    corrected_entity: dict[str, Any] | None = None
    note: str | None = Field(default=None, max_length=2000)


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    context: tuple[dict[str, Any], Client] = Depends(get_patient_context),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    profile, client = context
    patient_id = profile["id"]
    if credentials is None:
        raise HTTPException(status_code=401, detail="Bearer access token required.")
    if not file.filename or len(file.filename) > 255:
        raise HTTPException(status_code=400, detail="A valid filename is required.")
    content = await file.read(MAX_DOCUMENT_BYTES + 1)
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 15 MiB upload limit.")
    try:
        mime_type = validate_document(file.filename, file.content_type, content)
    except DocumentValidationError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from None

    # Use a server-generated path and retain only a sanitized display filename.
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", PurePath(file.filename).name)[:180] or "medical-document"
    document_id = str(uuid.uuid4())
    storage_path = f"{patient_id}/{document_id}/{safe_name}"
    try:
        client.storage.from_(BUCKET).upload(
            storage_path, content,
            file_options={"content-type": mime_type, "upsert": "false"},
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Unable to upload the document to private storage.") from None

    try:
        inserted = client.table("medical_documents").insert({
            "id": document_id,
            "patient_id": patient_id,
            "uploaded_by": patient_id,
            "storage_path": storage_path,
            "file_name": safe_name,
            "mime_type": mime_type,
            "file_size_bytes": len(content),
            "processing_status": "processing",
        }).select("id, patient_id, file_name, mime_type, file_size_bytes, document_type, processing_status, document_date, created_at").single().execute()
    except Exception:
        try:
            client.storage.from_(BUCKET).remove([storage_path])
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Unable to register the uploaded document.") from None

    # The first version runs extraction synchronously. Persist only explicit results,
    # provenance and review flags; never fabricate a missing value.
    try:
        extraction = process_document(safe_name, mime_type, content)
        entities = extraction["entities"]
        for entity in entities:
            client.table("extracted_document_data").insert({
                "patient_id": patient_id,
                "document_id": document_id,
                "extracted_data": entity,
                "extraction_model": extraction["extraction_engine"],
                "confidence": entity["confidence"],
                "review_status": "unreviewed",
            }).execute()

        document_date = next(
            (entity["normalized_value"] for entity in entities
             if entity["entity_type"] == "report_date" and entity["normalized_value"]),
            None,
        )
        processing_status = "review_required" if extraction["needs_human_review"] else "processed"
        updated = client.table("medical_documents").update({
            "processing_status": processing_status,
            "document_date": document_date,
            "document_type": "medical_report",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", document_id).eq("patient_id", patient_id).select(
            "id, patient_id, file_name, mime_type, file_size_bytes, document_type, processing_status, document_date, created_at"
        ).single().execute()
        return {"document": updated.data, "extraction": {
            "entity_count": len(entities),
            "needs_human_review": extraction["needs_human_review"],
            "review_reasons": extraction["review_reasons"],
            "page_count": extraction["page_count"],
        }}
    except HTTPException:
        raise
    except Exception:
        # Do not expose parser, database, or storage internals to the client.
        try:
            client.table("medical_documents").update({"processing_status": "failed"}).eq(
                "id", document_id
            ).eq("patient_id", patient_id).execute()
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail="The document was uploaded, but extraction could not be completed. Please retry or request human review.",
        ) from None


@router.get("")
def list_documents(
    context: tuple[dict[str, Any], Client] = Depends(get_patient_context),
) -> dict[str, Any]:
    profile, client = context
    result = client.table("medical_documents").select(
        "id, file_name, mime_type, file_size_bytes, document_type, processing_status, document_date, created_at, updated_at"
    ).eq("patient_id", profile["id"]).order("created_at", desc=True).execute()
    return {"documents": result.data or []}


@router.get("/{document_id}/extracted-data")
def get_extracted_data(
    document_id: str,
    context: tuple[dict[str, Any], Client] = Depends(get_patient_context),
) -> dict[str, Any]:
    profile, client = context
    doc = client.table("medical_documents").select("id").eq(
        "id", document_id
    ).eq("patient_id", profile["id"]).maybe_single().execute()
    if not doc.data:
        raise HTTPException(status_code=404, detail="Document not found.")
    result = client.table("extracted_document_data").select(
        "id, document_id, extracted_data, extraction_model, confidence, review_status, reviewed_at, created_at, updated_at"
    ).eq("document_id", document_id).eq("patient_id", profile["id"]).order("created_at").execute()
    return {"document_id": document_id, "items": result.data or []}


@router.patch("/{document_id}/extracted-data/{data_id}")
def review_extracted_data(
    document_id: str,
    data_id: str,
    update: ExtractedDataCorrection,
    context: tuple[dict[str, Any], Client] = Depends(get_patient_context),
) -> dict[str, Any]:
    profile, client = context
    patient_id = profile["id"]
    current = client.table("extracted_document_data").select(
        "id, document_id, patient_id, extracted_data, confidence, review_status"
    ).eq("id", data_id).eq("document_id", document_id).eq(
        "patient_id", patient_id
    ).maybe_single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Extracted item not found for this patient.")
    if update.action == "correct" and update.corrected_entity is None:
        raise HTTPException(status_code=422, detail="Provide corrected_entity when action is correct.")
    if update.action != "correct" and update.corrected_entity is not None:
        raise HTTPException(status_code=422, detail="corrected_entity is accepted only for correction.")

    old_entity = current.data["extracted_data"]
    new_entity = update.corrected_entity if update.action == "correct" else old_entity
    if new_entity is not None:
        # Preserve source provenance and make the human intervention visible.
        new_entity = {**new_entity, "human_review": {
            "action": update.action, "note": update.note,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }}
    review_status = {"confirm": "confirmed", "correct": "corrected", "reject": "rejected"}[update.action]
    result = client.table("extracted_document_data").update({
        "extracted_data": new_entity,
        "review_status": review_status,
        "reviewed_by": patient_id,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", data_id).eq("document_id", document_id).eq(
        "patient_id", patient_id
    ).select("id, document_id, extracted_data, extraction_model, confidence, review_status, reviewed_at, updated_at").single().execute()
    return {"item": result.data}
