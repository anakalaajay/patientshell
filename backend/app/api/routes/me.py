from typing import Any

from fastapi import APIRouter, Depends

from app.core.auth import get_current_profile

router = APIRouter(tags=["auth"])


@router.get("/me")
def read_current_user(
    profile: dict[str, Any] = Depends(get_current_profile),
) -> dict[str, Any]:
    """Return the verified caller's database profile and role."""
    return {"user": profile}
