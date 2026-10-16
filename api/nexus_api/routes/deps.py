"""Shared request guards."""

import hmac

from fastapi import Header, HTTPException, status

from nexus_api.config import get_settings


def matches_token(supplied: str | None, expected: str) -> bool:
    """Constant-time comparison that treats a missing header as a mismatch."""
    return bool(supplied) and hmac.compare_digest(supplied.encode(), expected.encode())  # type: ignore[union-attr]


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """Destructive routes need the X-Admin-Token header to match ADMIN_TOKEN."""
    if not matches_token(x_admin_token, get_settings().ADMIN_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A valid X-Admin-Token header is required",
        )


def require_ingest_token(x_ingest_token: str | None = Header(default=None)) -> None:
    """If INGEST_TOKEN is set, webhook ingest must send it as X-Ingest-Token."""
    expected = get_settings().INGEST_TOKEN
    if expected and not matches_token(x_ingest_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid X-Ingest-Token header is required",
        )


def get_tenant(x_tenant: str | None = Header(default=None)) -> str:
    """Resolve tenant ID from X-Tenant header or fallback to NEXUS_ORG_ID."""
    if x_tenant and x_tenant.strip():
        return x_tenant.strip().lower()
    return get_settings().NEXUS_ORG_ID.lower()


def get_user(x_user: str | None = Header(default=None)) -> str:
    """Resolve user ID from X-User header or default."""
    if x_user and x_user.strip():
        return x_user.strip()
    return "default_user"

