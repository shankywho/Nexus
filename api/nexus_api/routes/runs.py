"""Runs and telemetry inspection routes."""

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from nexus_api.services.tracing import get_tracing_store

router = APIRouter(prefix="/api/runs", tags=["runs"])


class RunItem(BaseModel):
    id: str
    kind: str | None = None
    status: str | None = None
    started_at: str | None = None
    ended_at: str | None = None
    error: str | None = None


class RunDetailResponse(RunItem):
    input_json: str | None = None
    steps: list[dict[str, Any]] = Field(default_factory=list)


@router.get("", response_model=list[RunItem])
def list_runs(kind: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """List recent telemetry runs."""
    tracing = get_tracing_store()
    return tracing.list_runs(kind=kind, limit=limit)


@router.get("/{run_id}", response_model=RunDetailResponse)
def get_run(run_id: str) -> dict[str, Any]:
    """Retrieve full waterfall steps for a specific run."""
    tracing = get_tracing_store()
    run_dict = tracing.get_run(run_id)
    if not run_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run {run_id} not found",
        )
    return run_dict
