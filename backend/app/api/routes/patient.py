from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field
from supabase import Client

from app.core.auth import (
    bearer_scheme,
    create_authenticated_client,
    get_current_profile,
)

router = APIRouter(prefix="/patient", tags=["patient"])


def get_patient_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    profile: dict[str, Any] = Depends(get_current_profile),
) -> tuple[dict[str, Any], Client]:
    """Verify patient role and create a Supabase client scoped to the same JWT."""
    if profile.get("role") != "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The patient portal is available to patient accounts only.",
        )
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer access token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return profile, create_authenticated_client(credentials.credentials)


class PatientProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date_of_birth: date | None = None
    sex_at_birth: str | None = Field(default=None, max_length=60)
    blood_type: str | None = Field(default=None, max_length=8)
    emergency_contact_name: str | None = Field(default=None, max_length=160)
    emergency_contact_phone: str | None = Field(default=None, max_length=40)


class PatientQuestionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=3, max_length=3000)
    package_id: str | None = None


@router.get("/profile")
def get_patient_profile(
    context: tuple[dict[str, Any], Client] = Depends(get_patient_context),
) -> dict[str, Any]:
    """Return only the authenticated patient's account and demographic profile."""
    profile, client = context
    user_result = (
        client.table("user_profiles")
        .select("id, role, full_name, email, phone")
        .eq("id", profile["id"])
        .maybe_single()
        .execute()
    )
    patient_result = (
        client.table("patient_profiles")
        .select(
            "user_id, date_of_birth, sex_at_birth, blood_type, "
            "emergency_contact_name, emergency_contact_phone, created_at, updated_at"
        )
        .eq("user_id", profile["id"])
        .maybe_single()
        .execute()
    )
    if not patient_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile has not been provisioned.",
        )
    return {"user": user_result.data, "patient": patient_result.data}


@router.patch("/profile")
def update_patient_profile(
    update: PatientProfileUpdate,
    context: tuple[dict[str, Any], Client] = Depends(get_patient_context),
) -> dict[str, Any]:
    """Update demographic fields on the caller's own patient profile."""
    profile, client = context
    changes = update.model_dump(exclude_unset=True, mode="json")
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one demographic field to update.",
        )
    result = (
        client.table("patient_profiles")
        .update(changes)
        .eq("user_id", profile["id"])
        .select(
            "user_id, date_of_birth, sex_at_birth, blood_type, "
            "emergency_contact_name, emergency_contact_phone, created_at, updated_at"
        )
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile was not found or could not be updated.",
        )
    return {"patient": result.data}


@router.get("/timeline")
def get_patient_timeline(
    context: tuple[dict[str, Any], Client] = Depends(get_patient_context),
) -> dict[str, Any]:
    """Return chronologically sorted visits/documents plus review package summaries."""
    profile, client = context
    patient_id = profile["id"]

    visits = (
        client.table("medical_visits")
        .select(
            "id, patient_id, doctor_id, visit_type, status, started_at, ended_at, "
            "facility_name, summary, created_at"
        )
        .eq("patient_id", patient_id)
        .order("started_at", desc=True)
        .execute()
        .data
        or []
    )
    documents = (
        client.table("medical_documents")
        .select(
            "id, patient_id, visit_id, file_name, mime_type, file_size_bytes, "
            "document_type, processing_status, document_date, created_at"
        )
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    packages = (
        client.table("review_packages")
        .select("id, title, purpose, status, expires_at, created_at, updated_at")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )

    timeline: list[dict[str, Any]] = []
    for visit in visits:
        timeline.append(
            {
                "id": visit["id"],
                "type": "visit",
                "occurred_at": visit.get("started_at") or visit.get("created_at"),
                **visit,
            }
        )
    for document in documents:
        timeline.append(
            {
                "id": document["id"],
                "type": "document",
                "occurred_at": document.get("document_date") or document.get("created_at"),
                **document,
            }
        )
    timeline.sort(
        key=lambda item: item.get("occurred_at") or "",
        reverse=True,
    )
    return {
        "timeline": timeline,
        "visits": visits,
        "documents": documents,
        "review_packages": packages,
    }


@router.get("/questions")
def get_patient_questions(
    context: tuple[dict[str, Any], Client] = Depends(get_patient_context),
) -> dict[str, Any]:
    """Return the patient's questions and any doctor resolution messages."""
    profile, client = context
    patient_id = profile["id"]
    questions = (
        client.table("patient_questions")
        .select("id, question, package_id, status, created_at, updated_at")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    resolutions = (
        client.table("doctor_review_resolutions")
        .select("id, question_id, resolution, created_at")
        .eq("patient_id", patient_id)
        .execute()
        .data
        or []
    )
    by_question: dict[str, list[dict[str, Any]]] = {}
    for resolution in resolutions:
        question_id = resolution.get("question_id")
        if question_id:
            by_question.setdefault(question_id, []).append(resolution)
    for question in questions:
        question["responses"] = by_question.get(question["id"], [])
    return {"questions": questions}


@router.post("/questions", status_code=status.HTTP_201_CREATED)
def create_patient_question(
    request: PatientQuestionCreate,
    context: tuple[dict[str, Any], Client] = Depends(get_patient_context),
) -> dict[str, Any]:
    """Create a question for the authenticated patient; ignore caller-supplied identity."""
    profile, client = context
    payload = {
        "patient_id": profile["id"],
        "question": request.question.strip(),
        "package_id": request.package_id,
    }
    if len(payload["question"]) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question must contain at least 3 non-whitespace characters.",
        )
    try:
        result = (
            client.table("patient_questions")
            .insert(payload)
            .select("id, question, package_id, status, created_at, updated_at")
            .single()
            .execute()
        )
    except Exception:
        # RLS and composite foreign keys remain the final authorization boundary.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create the question. Check the optional package selection and try again.",
        ) from None
    return {"question": result.data}
