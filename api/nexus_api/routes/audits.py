"""Audits HTTP routes."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from nexus_api.config import get_settings
from nexus_api.services.audits import (
    run_bus_factor,
    run_decision_trace,
    run_stale_knowledge,
    run_who_owns_what,
)

router = APIRouter(prefix="/api/audits", tags=["audits"])


class DecisionTraceParams(BaseModel):
    decision_id: str | None = None
    service_id: str | None = None


class AuditResponse(BaseModel):
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    highlight_ids: list[str] = Field(default_factory=list)
    cypher: str = ""
    run_id: str = ""


@router.api_route("/who-owns-what", methods=["GET", "POST"], response_model=AuditResponse)
@router.api_route("/owners", methods=["GET", "POST"], response_model=AuditResponse)
def audit_who_owns_what() -> dict[str, Any]:
    """Execute WHO OWNS WHAT audit."""
    settings = get_settings()
    return run_who_owns_what(org_id=settings.NEXUS_ORG_ID)


@router.api_route("/decision-trace", methods=["GET", "POST"], response_model=AuditResponse)
@router.api_route("/trace", methods=["GET", "POST"], response_model=AuditResponse)
def audit_decision_trace(params: DecisionTraceParams | None = None) -> dict[str, Any]:
    """Execute DECISION TRACE audit."""
    settings = get_settings()
    dec_id = params.decision_id if params else None
    srv_id = params.service_id if params else None
    return run_decision_trace(
        decision_id=dec_id, service_id=srv_id, org_id=settings.NEXUS_ORG_ID
    )


@router.api_route("/stale-knowledge", methods=["GET", "POST"], response_model=AuditResponse)
@router.api_route("/stale", methods=["GET", "POST"], response_model=AuditResponse)
def audit_stale_knowledge() -> dict[str, Any]:
    """Execute STALE / SUPERSEDED KNOWLEDGE audit."""
    settings = get_settings()
    return run_stale_knowledge(org_id=settings.NEXUS_ORG_ID)


@router.api_route("/bus-factor", methods=["GET", "POST"], response_model=AuditResponse)
def audit_bus_factor() -> dict[str, Any]:
    """Execute BUS FACTOR / SME FINDER audit."""
    settings = get_settings()
    return run_bus_factor(org_id=settings.NEXUS_ORG_ID)
