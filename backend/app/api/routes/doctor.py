"""Doctor portal API with database-role checks and package-scoped authorization."""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field
from supabase import Client

from app.api.routes.patient import get_patient_context
from app.core.auth import bearer_scheme, create_authenticated_client, get_current_profile
from app.services.review_token_limiter import RateLimitExceeded, review_token_limiter

router = APIRouter(prefix="/doctor", tags=["doctor"])
def get_doctor_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    profile: dict[str, Any] = Depends(get_current_profile),
) -> tuple[dict[str, Any], Client]:
    """Authorization role is read from user_profiles after Supabase Auth verifies the JWT."""
    if profile.get("role") != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor access is restricted to verified doctor-role accounts.",
        )
    if credentials is None:
        raise HTTPException(status_code=401, detail="Bearer access token required.")
    client = create_authenticated_client(credentials.credentials)
    # A role alone is insufficient: require a doctor profile verified by an admin workflow.
    doctor = client.table("doctor_profiles").select(
        "user_id, verification_status"
    ).eq("user_id", profile["id"]).maybe_single().execute().data
    if not doctor or doctor.get("verification_status") != "verified":
        raise HTTPException(status_code=403, detail="Doctor account verification is required.")
    return profile, client


def _rate_limit_token(request: Request, doctor_id: str) -> None:
    remote = request.client.host if request.client else "unknown"
    try:
        review_token_limiter.check(f"{doctor_id}:{remote}")
    except RateLimitExceeded as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from None


def _validate_temporary_token(
    token: str | None,
    request: Request,
    profile: dict[str, Any],
    client: Client,
    package_id: str,
) -> None:
    """Validate only a hash, expiry and revocation via a restricted database RPC."""
    if not token:
        return
    _rate_limit_token(request, profile["id"])
    if len(token) < 32 or len(token) > 512:
        raise HTTPException(status_code=401, detail="Invalid or expired review access token.")
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    try:
        result = client.rpc("validate_doctor_review_token", {
            "p_token_hash": digest,
            "p_package_id": package_id,
            "p_doctor_id": profile["id"],
        }).execute()
    except Exception:
        raise HTTPException(status_code=503, detail="Temporary review access validation is unavailable.") from None
    if not result.data:
        raise HTTPException(status_code=403, detail="Invalid, expired, revoked, or unauthorized review access token.")


def _require_grant(client: Client, doctor_id: str, package_id: str) -> dict[str, Any]:
    try:
        result = client.table("review_package_doctors").select(
            "id, package_id, patient_id, doctor_id, expires_at, revoked_at, granted_at"
        ).eq("doctor_id", doctor_id).eq("package_id", package_id).maybe_single().execute()
    except Exception:
        raise HTTPException(status_code=503, detail="Unable to verify review access.") from None
    grant = result.data
    now = datetime.now(timezone.utc)
    if not grant or grant.get("revoked_at"):
        raise HTTPException(status_code=404, detail="Review package not found or access is not granted.")
    if grant.get("expires_at"):
        try:
            expiry = datetime.fromisoformat(grant["expires_at"].replace("Z", "+00:00"))
        except (ValueError, TypeError):
            raise HTTPException(status_code=403, detail="Review grant has an invalid expiration.") from None
        if expiry <= now:
            raise HTTPException(status_code=403, detail="Review access has expired.")
    return grant


def _audit(client: Client, doctor_id: str, patient_id: str, event: str, resource_id: str, metadata: dict[str, Any]) -> None:
    try:
        client.table("system_audit_events").insert({
            "actor_id": doctor_id,
            "patient_id": patient_id,
            "event_type": event,
            "resource_type": "review_package",
            "resource_id": resource_id,
            "metadata": metadata,
        }).execute()
    except Exception:
        # Audit failures must fail closed for mutations: callers handle this via exception.
        raise HTTPException(status_code=503, detail="Unable to write the required audit record.") from None


class ReviewNote(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=12000)
    recommendations: str | None = Field(default=None, max_length=12000)
    note_type: str = Field(default="clinical_review", pattern="^(clinical_review|follow_up|recommendation)$")


class ResolveReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=12000)
    recommendations: str | None = Field(default=None, max_length=12000)
    status: str = Field(default="completed", pattern="^(completed|needs_information)$")


class QuestionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resolution: str = Field(min_length=3, max_length=12000)


@router.get("/queue")
def get_doctor_queue(
    context: tuple[dict[str, Any], Client] = Depends(get_doctor_context),
) -> dict[str, Any]:
    profile, client = context
    now = datetime.now(timezone.utc).isoformat()
    grants = client.table("review_package_doctors").select(
        "package_id, patient_id, granted_at, expires_at, revoked_at"
    ).eq("doctor_id", profile["id"]).is_("revoked_at", "null").execute().data or []
    queue = []
    for grant in grants:
        if grant.get("expires_at") and grant["expires_at"] <= now:
            continue
        package = client.table("review_packages").select(
            "id, title, purpose, status, expires_at, created_at, updated_at"
        ).eq("id", grant["package_id"]).eq("patient_id", grant["patient_id"]).maybe_single().execute().data
        if not package or package.get("status") in {"revoked", "expired"}:
            continue
        patient = client.table("user_profiles").select(
            "id, full_name"
        ).eq("id", grant["patient_id"]).maybe_single().execute().data or {}
        review = client.table("doctor_reviews").select(
            "id, status, reviewed_at, updated_at"
        ).eq("package_id", grant["package_id"]).eq("patient_id", grant["patient_id"]).eq(
            "doctor_id", profile["id"]
        ).maybe_single().execute().data
        queue.append({
            "package": package,
            "patient": patient,
            "grant": grant,
            "review": review,
            "urgency": "high" if package.get("expires_at") and package["expires_at"] <= now else (
                "active" if package.get("status") in {"shared", "in_review"} else "routine"
            ),
        })
    queue.sort(key=lambda item: (item["urgency"] != "high", item["package"].get("created_at") or ""))
    return {"queue": queue, "active_grants": len(queue)}


@router.get("/reviews/{package_id}")
def get_review_workspace(
    package_id: str,
    request: Request,
    context: tuple[dict[str, Any], Client] = Depends(get_doctor_context),
    review_access_token: str | None = Header(default=None, alias="X-Review-Access-Token"),
) -> dict[str, Any]:
    profile, client = context
    _validate_temporary_token(review_access_token, request, profile, client, package_id)
    grant = _require_grant(client, profile["id"], package_id)
    patient_id = grant["patient_id"]
    package = client.table("review_packages").select(
        "id, patient_id, title, purpose, status, expires_at, created_at"
    ).eq("id", package_id).eq("patient_id", patient_id).single().execute().data
    package_docs = client.table("review_package_documents").select(
        "document_id"
    ).eq("package_id", package_id).eq("patient_id", patient_id).execute().data or []
    document_ids = [item["document_id"] for item in package_docs]
    documents = []
    for document_id in document_ids:
        document = client.table("medical_documents").select(
            "id, file_name, mime_type, file_size_bytes, document_type, processing_status, document_date, created_at, storage_path"
        ).eq("id", document_id).eq("patient_id", patient_id).maybe_single().execute().data
        if not document:
            continue
        extracted = client.table("extracted_document_data").select(
            "id, extracted_data, confidence, review_status, created_at"
        ).eq("document_id", document_id).eq("patient_id", patient_id).order("created_at").execute().data or []
        try:
            signed = client.storage.from_("medical-records").create_signed_url(document["storage_path"], 300)
            signed_url = signed.get("signedURL") or signed.get("signedUrl")
            if signed_url and signed_url.startswith("/"):
                base = os.getenv("SUPABASE_URL", "").rstrip("/")
                signed_url = base + "/storage/v1" + signed_url
        except Exception:
            signed_url = None
        documents.append({**document, "signed_url": signed_url, "extracted_items": extracted})

    package_visits = client.table("review_package_visits").select(
        "visit_id"
    ).eq("package_id", package_id).eq("patient_id", patient_id).execute().data or []
    timeline = []
    for item in package_visits:
        visit = client.table("medical_visits").select(
            "id, visit_type, status, started_at, ended_at, facility_name, summary, created_at"
        ).eq("id", item["visit_id"]).eq("patient_id", patient_id).maybe_single().execute().data
        if visit:
            timeline.append(visit)

    labs = client.table("lab_records").select(
        "id, document_id, test_name, result_value, unit, reference_range, result_flag, observed_at, created_at"
    ).eq("patient_id", patient_id).in_("document_id", document_ids).order("observed_at").execute().data if document_ids else []
    medications = client.table("medication_records").select(
        "id, document_id, medication_name, dosage, route, frequency, instructions, status, started_on, ended_on, created_at"
    ).eq("patient_id", patient_id).in_("document_id", document_ids).execute().data if document_ids else []
    review = client.table("doctor_reviews").select(
        "id, summary, recommendations, status, reviewed_at, created_at, updated_at"
    ).eq("package_id", package_id).eq("patient_id", patient_id).eq("doctor_id", profile["id"]).maybe_single().execute().data
    questions = client.table("patient_questions").select(
        "id, question, status, created_at, updated_at"
    ).eq("patient_id", patient_id).eq("package_id", package_id).order("created_at").execute().data or []
    comparison_rows = list(labs or [])
    parsed_medications = list(medications or [])
    for document in documents:
        for item in document["extracted_items"]:
            entity = item.get("extracted_data") or {}
            source = entity.get("source") or {}
            if entity.get("entity_type") == "lab_result" and entity.get("value") is not None:
                quote = str(source.get("quote") or "")
                from app.services.document_processor import normalize_test_name
                test_name = normalize_test_name(entity.get("test_name") or quote) or "unlabelled extracted lab result"
                comparison_rows.append({
                    "test_name": test_name, "result_value": entity.get("value"),
                    "unit": entity.get("unit"), "reference_range": entity.get("reference_range"),
                    "observed_at": document.get("document_date"), "document_id": document["id"],
                })
            elif entity.get("entity_type") == "medication":
                parsed_medications.append({
                    "id": item["id"], "document_id": document["id"],
                    "medication_name": entity.get("value") or "Uncertain medication",
                    "dosage": source.get("dosage"), "route": source.get("route"),
                    "frequency": source.get("frequency"), "status": "unverified extracted item",
                })
    return {
        "package": package, "grant": grant, "documents": documents, "timeline": timeline,
        "labs": comparison_rows, "medications": parsed_medications, "review": review,
        "questions": questions, "comparison": compare_labs(comparison_rows),
    }


def compare_labs(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Group longitudinal values by exact analyte and compatible units; never diagnose."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        name = " ".join(str(row.get("test_name") or "").strip().lower().split())
        if name:
            groups.setdefault(name, []).append(row)
    comparisons = []
    for name, values in groups.items():
        values.sort(key=lambda row: row.get("observed_at") or row.get("created_at") or "")
        units = {str(row.get("unit") or "").strip().casefold() for row in values}
        contexts = {str(row.get("reference_range") or "").strip().casefold() for row in values}
        compatible = len(units) == 1 and "" not in units and len(contexts) <= 1
        comparisons.append({
            "test_name": name,
            "comparable": compatible,
            "unit_consistency": "consistent" if compatible else "differing_or_missing_units",
            "context_consistency": "consistent" if len(contexts) <= 1 else "reference_ranges_differ",
            "values": [{
                "value": row.get("result_value"), "unit": row.get("unit"),
                "reference_range": row.get("reference_range"),
                "date": row.get("observed_at") or row.get("created_at"),
                "document_id": row.get("document_id"),
            } for row in values],
            "interpretation": "Values are displayed for clinician review; no automated diagnosis or clinical trend conclusion is generated.",
        })
    return {"comparisons": comparisons, "method": "exact test-name and unit/reference-context matching; no unit conversion"}


@router.post("/reviews/{package_id}/notes")
def save_review_note(
    package_id: str,
    note: ReviewNote,
    context: tuple[dict[str, Any], Client] = Depends(get_doctor_context),
) -> dict[str, Any]:
    profile, client = context
    grant = _require_grant(client, profile["id"], package_id)
    patient_id = grant["patient_id"]
    existing = client.table("doctor_reviews").select("id").eq(
        "package_id", package_id
    ).eq("patient_id", patient_id).eq("doctor_id", profile["id"]).maybe_single().execute().data
    payload = {
        "package_id": package_id, "patient_id": patient_id, "doctor_id": profile["id"],
        "summary": note.summary, "recommendations": note.recommendations,
        "status": "in_progress", "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing:
        result = client.table("doctor_reviews").update(payload).eq("id", existing["id"]).eq(
            "patient_id", patient_id
        ).select("id, package_id, summary, recommendations, status, updated_at").single().execute()
        review_id = result.data["id"]
    else:
        result = client.table("doctor_reviews").insert(payload).select(
            "id, package_id, summary, recommendations, status, updated_at"
        ).single().execute()
        review_id = result.data["id"]
    return {"review": result.data}


@router.post("/reviews/{package_id}/resolve")
def resolve_review(
    package_id: str,
    request_body: ResolveReview,
    context: tuple[dict[str, Any], Client] = Depends(get_doctor_context),
) -> dict[str, Any]:
    profile, client = context
    grant = _require_grant(client, profile["id"], package_id)
    patient_id = grant["patient_id"]
    existing = client.table("doctor_reviews").select("id").eq(
        "package_id", package_id
    ).eq("patient_id", patient_id).eq("doctor_id", profile["id"]).maybe_single().execute().data
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "package_id": package_id, "patient_id": patient_id, "doctor_id": profile["id"],
        "summary": request_body.summary, "recommendations": request_body.recommendations,
        "status": request_body.status, "reviewed_at": now, "updated_at": now,
    }
    if existing:
        result = client.table("doctor_reviews").update(payload).eq("id", existing["id"]).eq(
            "patient_id", patient_id
        ).select("id, package_id, status, reviewed_at, summary, recommendations").single().execute()
    else:
        result = client.table("doctor_reviews").insert(payload).select(
            "id, package_id, status, reviewed_at, summary, recommendations"
        ).single().execute()
    package_status = "completed" if request_body.status == "completed" else "in_review"
    client.table("review_packages").update({
        "status": package_status, "updated_at": now
    }).eq("id", package_id).eq("patient_id", patient_id).execute()
    return {"review": result.data, "package_status": package_status}


@router.post("/questions/{question_id}/respond")
def respond_to_patient_question(
    question_id: str,
    response_body: QuestionResponse,
    context: tuple[dict[str, Any], Client] = Depends(get_doctor_context),
) -> dict[str, Any]:
    profile, client = context
    question = client.table("patient_questions").select(
        "id, patient_id, package_id, question, status"
    ).eq("id", question_id).maybe_single().execute().data
    if not question or not question.get("package_id"):
        raise HTTPException(status_code=404, detail="Question not found or not linked to a review package.")
    grant = _require_grant(client, profile["id"], question["package_id"])
    if grant["patient_id"] != question["patient_id"]:
        raise HTTPException(status_code=403, detail="Question is outside the authorized review grant.")
    existing = client.table("doctor_reviews").select("id").eq(
        "package_id", question["package_id"]
    ).eq("patient_id", question["patient_id"]).eq("doctor_id", profile["id"]).maybe_single().execute().data
    if existing:
        review_id = existing["id"]
    else:
        review = client.table("doctor_reviews").insert({
            "package_id": question["package_id"], "patient_id": question["patient_id"],
            "doctor_id": profile["id"], "status": "in_progress",
        }).select("id").single().execute()
        review_id = review.data["id"]
    result = client.table("doctor_review_resolutions").insert({
        "review_id": review_id, "question_id": question_id, "patient_id": question["patient_id"],
        "doctor_id": profile["id"], "resolution": response_body.resolution,
    }).select("id, question_id, resolution, created_at").single().execute()
    client.table("patient_questions").update({
        "status": "answered", "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", question_id).eq("patient_id", question["patient_id"]).execute()
    return {"response": result.data, "question_status": "answered"}
