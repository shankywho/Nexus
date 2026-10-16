"""Memory routes exposing episodic, semantic, procedural memory, and history (Track 02)."""

from typing import Any

from fastapi import APIRouter, Depends, Query

from nexus_api.memory.store import get_memory_store
from nexus_api.routes.deps import get_tenant, get_user, require_admin

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("/episodes")
def list_episodes(
    entities: list[str] = Query(default=[]),
    tenant: str = Depends(get_tenant),
) -> dict[str, Any]:
    """Retrieve episodic memory records, optionally filtered by touched entities."""
    store = get_memory_store(tenant=tenant)
    episodes = store.recall_episodes(entities=entities, limit=10)
    return {
        "tenant": tenant,
        "count": len(episodes),
        "episodes": episodes,
    }


@router.get("/facts")
def list_semantic_facts(
    active_only: bool = Query(default=True),
    tenant: str = Depends(get_tenant),
) -> dict[str, Any]:
    """Retrieve learned semantic facts with bi-temporal status and supersessions."""
    store = get_memory_store(tenant=tenant)
    facts = store.list_facts(active_only=active_only)
    return {
        "tenant": tenant,
        "count": len(facts),
        "facts": facts,
    }


@router.get("/procedures")
def list_procedures(
    tenant: str = Depends(get_tenant),
) -> dict[str, Any]:
    """Retrieve procedural playbooks learned by agents across runs."""
    store = get_memory_store(tenant=tenant)
    procs = store.list_procedures()
    return {
        "tenant": tenant,
        "count": len(procs),
        "procedures": procs,
    }


@router.get("/history")
def get_conversation_history(
    conversation_id: str = Query(default="default"),
    limit: int = Query(default=20),
    tenant: str = Depends(get_tenant),
) -> dict[str, Any]:
    """Retrieve persistent multi-turn conversation history for a user/conversation."""
    store = get_memory_store(tenant=tenant)
    turns = store.get_conversation_history(conversation_id=conversation_id, limit=limit)
    return {
        "tenant": tenant,
        "conversation_id": conversation_id,
        "turns": turns,
    }


@router.post("/reset")
def reset_memory(
    tenant: str = Depends(get_tenant),
    _: None = Depends(require_admin),
) -> dict[str, Any]:
    """Wipe memory graph for the specified tenant (Admin token required)."""
    store = get_memory_store(tenant=tenant)
    store.reset()
    return {"tenant": tenant, "status": "memory_cleared"}
