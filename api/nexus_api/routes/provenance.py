"""Provenance inspection routes."""

from typing import Any

from fastapi import APIRouter

from nexus_api.config import get_settings
from nexus_api.services.provenance import get_decision_provenance

router = APIRouter(prefix="/api/provenance", tags=["provenance"])


@router.get("/{decision_id}")
def get_provenance(decision_id: str) -> dict[str, Any]:
    """Retrieve current vs superseded source lineage for a decision."""
    settings = get_settings()
    return get_decision_provenance(
        decision_id=decision_id, org_id=settings.NEXUS_ORG_ID
    )
