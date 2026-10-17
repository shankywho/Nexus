"""Agent routes for incident investigation and execution traces."""

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from nexus_api.agents.runtime import AgentRuntime
from nexus_api.memory.store import get_memory_store
from nexus_api.routes.deps import get_tenant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentRunRequest(BaseModel):
    incident_id: str = Field(..., json_schema_extra={"example": "INC-83"})
    title: str | None = Field(default=None, json_schema_extra={"example": "web-checkout 5xx spike"})
    service_id: str | None = Field(default=None, json_schema_extra={"example": "web-checkout"})
    description: str = Field(default="", json_schema_extra={"example": "Checkout error rate surge"})
    dry_run: bool = False


@router.post("/run")
async def trigger_agent_run(
    payload: AgentRunRequest,
    tenant: str = Depends(get_tenant),
) -> dict[str, Any]:
    """Trigger multi-agent incident triage workflow (Scout -> Planner -> Scribe)."""
    title = payload.title
    service_id = payload.service_id
    description = payload.description

    if not title or not service_id:
        incidents_path = (
            Path(__file__).resolve().parent.parent.parent.parent
            / "fixtures/company/incidents.json"
        )
        if incidents_path.exists():
            try:
                with open(incidents_path, encoding="utf-8") as f:
                    canned = json.load(f).get("incidents", [])
                    for inc in canned:
                        if inc.get("id") == payload.incident_id:
                            title = title or inc.get("title")
                            service_id = service_id or inc.get("service_id")
                            description = description or inc.get("description", "")
                            break
            except (OSError, ValueError) as exc:
                logger.debug("incident lookup skipped: %s", exc)
        title = title or f"Incident {payload.incident_id}"
        service_id = service_id or "web-checkout"

    runtime = AgentRuntime(tenant=tenant)
    res = await runtime.run_incident_triage(
        incident_id=payload.incident_id,
        title=title,
        service_id=service_id,
        description=description,
    )
    return res


@router.get("/runs/{run_id}")
def get_run_trace(
    run_id: str,
    tenant: str = Depends(get_tenant),
) -> dict[str, Any]:
    """Retrieve explainable graph execution trace for an agent run."""
    store = get_memory_store(tenant=tenant)
    trace = store.get_run_trace(run_id)
    return {
        "run_id": run_id,
        "tenant": tenant,
        "step_count": len(trace),
        "steps": trace,
    }


@router.get("/tasks")
def list_agent_tasks(
    tenant: str = Depends(get_tenant),
) -> dict[str, Any]:
    """List shared agent tasks, statuses, and handoff chains."""
    store = get_memory_store(tenant=tenant)
    tasks = store.list_tasks()
    return {
        "tenant": tenant,
        "count": len(tasks),
        "tasks": tasks,
    }


@router.get("/incidents")
def list_incidents() -> dict[str, Any]:
    """List sample incidents available to page agents with."""
    incidents_path = Path(__file__).resolve().parent.parent.parent.parent / "fixtures/company/incidents.json"
    if incidents_path.exists():
        with open(incidents_path, encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)
            return data
    return {"incidents": []}
