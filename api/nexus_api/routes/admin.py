"""Admin routes for NEXUS."""

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.routes.deps import require_admin
from nexus_api.services.tracing import get_tracing_store

router = APIRouter(prefix="/api/admin", tags=["admin"])


class ResetResponse(BaseModel):
    status: str
    dropped_graphs: dict[str, bool]
    tracing_cleared: bool


@router.post("/reset", response_model=ResetResponse, dependencies=[Depends(require_admin)])
def admin_reset() -> dict[str, Any]:
    """Drop all nexus_* graphs and reset tracing store."""
    falkor = get_falkor_client()
    dropped = falkor.reset_nexus_graphs()

    tracing = get_tracing_store()
    tracing.reset_runs()

    return {
        "status": "ok",
        "dropped_graphs": dropped,
        "tracing_cleared": True,
    }
