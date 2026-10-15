"""Admin routes for NEXUS."""

from typing import Any

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings
from nexus_api.services.tracing import get_tracing_store

router = APIRouter(prefix="/api/admin", tags=["admin"])


class ResetResponse(BaseModel):
    status: str
    dropped_graphs: dict[str, bool]
    tracing_cleared: bool


@router.post("/reset", response_model=ResetResponse)
def admin_reset(x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    """Drop all nexus_* graphs and reset tracing store."""
    settings = get_settings()
    if x_admin_token and x_admin_token != settings.ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid X-Admin-Token",
        )

    falkor = get_falkor_client()
    dropped = falkor.reset_nexus_graphs()

    tracing = get_tracing_store()
    tracing.reset_runs()

    return {
        "status": "ok",
        "dropped_graphs": dropped,
        "tracing_cleared": True,
    }
