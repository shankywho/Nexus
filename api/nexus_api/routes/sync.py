"""Sync simulation HTTP routes."""

from typing import Any

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from nexus_api.config import get_settings
from nexus_api.routes.deps import matches_token
from nexus_api.services.sync_replayer import get_sync_replayer

router = APIRouter(prefix="/api/sync", tags=["sync"])


class SimulateSyncRequest(BaseModel):
    interval_ms: int = Field(default=600, ge=0)
    reset: bool = False


class SimulateSyncResponse(BaseModel):
    status: str
    run_id: str


class SyncStatusResponse(BaseModel):
    state: str
    processed: int
    total: int
    run_id: str


@router.post("/simulate", response_model=SimulateSyncResponse)
async def start_sync_simulation(
    request: SimulateSyncRequest | None = None,
    x_admin_token: str | None = Header(default=None),
) -> dict[str, Any]:
    """Start the Simulate Live Company Sync replay. Returns 409 if already running."""
    settings = get_settings()
    interval_ms = request.interval_ms if request else settings.SYNC_DEFAULT_INTERVAL_MS
    reset = request.reset if request else False

    if reset and not matches_token(x_admin_token, settings.ADMIN_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A valid X-Admin-Token header is required when reset=true",
        )

    replayer = get_sync_replayer()
    try:
        run_id = await replayer.start(interval_ms=interval_ms, reset=reset)
        return {"status": "started", "run_id": run_id}
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err


@router.get("/status", response_model=SyncStatusResponse)
def get_sync_status() -> dict[str, Any]:
    """Get current sync replay progress."""
    replayer = get_sync_replayer()
    return replayer.get_status()


@router.post("/cancel")
async def cancel_sync_simulation() -> dict[str, Any]:
    """Cancel the active sync replay."""
    replayer = get_sync_replayer()
    cancelled = await replayer.cancel()
    return {"status": "cancelled" if cancelled else "not_running"}
