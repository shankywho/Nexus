"""Health check route for NEXUS."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings

router = APIRouter(tags=["health"])


class GraphCounts(BaseModel):
    company: int
    temporal: int
    docs: int


class HealthResponse(BaseModel):
    status: str
    falkordb: str
    mock: bool
    graphs: GraphCounts


@router.get("/health", response_model=HealthResponse)
@router.get("/healthz", response_model=HealthResponse)
def get_health() -> dict[str, Any]:
    """Return health status of API, FalkorDB connection, and graph node counts."""
    settings = get_settings()
    falkor = get_falkor_client()
    falkor_up = falkor.ping()

    if falkor_up:
        company_count = falkor.count_nodes(settings.GRAPH_COMPANY)
        temporal_count = falkor.count_nodes(settings.GRAPH_TEMPORAL)
        docs_count = falkor.count_nodes(settings.GRAPH_DOCS)
    else:
        company_count = 0
        temporal_count = 0
        docs_count = 0

    return {
        "status": "ok" if falkor_up else "degraded",
        "falkordb": "up" if falkor_up else "down",
        "mock": settings.MOCK_EXTERNALS,
        "graphs": {
            "company": company_count,
            "temporal": temporal_count,
            "docs": docs_count,
        },
    }
