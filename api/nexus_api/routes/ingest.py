"""Ingest HTTP routes."""

from typing import Any

from fastapi import APIRouter, Depends, Response

from nexus_api.models.events import IngestResult
from nexus_api.routes.deps import require_ingest_token
from nexus_api.services.ingest import ingest_source_event

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


@router.post("/event", response_model=IngestResult, dependencies=[Depends(require_ingest_token)])
async def ingest_event(payload: dict[str, Any], response: Response) -> IngestResult:
    """Ingest a single SourceEvent (tolerant, idempotent)."""
    result, status_code = await ingest_source_event(payload)
    response.status_code = status_code
    return result
