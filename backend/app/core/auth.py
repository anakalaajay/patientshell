import os
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

bearer_scheme = HTTPBearer(auto_error=False)


def _new_supabase_client() -> Client:
    """Create a request-scoped client so JWT headers cannot leak across requests."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase authentication is not configured.",
        )

    return create_client(supabase_url, supabase_key)


def get_current_profile(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Verify the bearer token with Supabase Auth and load the caller's profile.

    The public/anon key is used only as a client identifier. The supplied access
    token is verified by Auth and is also forwarded to PostgREST so database
    reads are subject to the caller's RLS policies. Never use a service-role key
    in this dependency.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer access token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    client = _new_supabase_client()

    try:
        auth_response = client.auth.get_user(token)
        user = auth_response.user
    except Exception:
        # Do not leak JWT, Auth response, or upstream details to the caller.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # Use this request's JWT for PostgREST/RLS. The client is request-scoped.
        client.postgrest.auth(token)
        result = (
            client.table("user_profiles")
            .select("id, role, full_name, email")
            .eq("id", str(user.id))
            .maybe_single()
            .execute()
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to load the authenticated profile.",
        ) from None

    profile = result.data
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Authenticated account has no provisioned user profile.",
        )

    # Return only the fields needed by the API; authorization role comes from
    # the database, not user-editable Auth user metadata.
    return {
        "id": profile["id"],
        "role": profile["role"],
        "full_name": profile.get("full_name"),
        "email": profile.get("email") or user.email,
    }


def create_authenticated_client(access_token: str) -> Client:
    """Return a fresh Supabase client whose PostgREST calls use this user's JWT."""
    client = _new_supabase_client()
    client.postgrest.auth(access_token)
    return client
