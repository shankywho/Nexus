"""SourceEvent management and privacy deletion routes."""

from typing import Any

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings

router = APIRouter(prefix="/api/sources", tags=["sources"])


class SourceEventItem(BaseModel):
    id: str
    kind: str | None = None
    ts: str | None = None
    ingested_at: str | None = None
    episode_uuid: str | None = None


class DeleteSourceResponse(BaseModel):
    status: str
    event_id: str
    deleted_nodes_count: int


@router.get("", response_model=list[SourceEventItem])
def list_sources(limit: int = 100) -> list[dict[str, Any]]:
    """List recent SourceEvents for privacy and provenance auditing."""
    settings = get_settings()
    falkor = get_falkor_client()
    cypher = """
    MATCH (se:SourceEvent {org_id: $org_id})
    RETURN se.id, se.kind, se.ts, se.ingested_at, se.episode_uuid
    ORDER BY se.ts DESC
    LIMIT $limit
    """
    res = falkor.query(
        settings.GRAPH_COMPANY,
        cypher,
        {"org_id": settings.NEXUS_ORG_ID, "limit": limit},
    )
    items: list[dict[str, Any]] = []
    if res and res.result_set:
        for row in res.result_set:
            items.append(
                {
                    "id": row[0],
                    "kind": row[1],
                    "ts": row[2],
                    "ingested_at": row[3],
                    "episode_uuid": row[4],
                }
            )
    return items


@router.delete("/{event_id}", response_model=DeleteSourceResponse)
def delete_source(
    event_id: str, x_admin_token: str | None = Header(default=None)
) -> dict[str, Any]:
    """Delete a SourceEvent and any nodes whose only DERIVED_FROM is that event (§13)."""
    settings = get_settings()
    if x_admin_token and x_admin_token != settings.ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid X-Admin-Token",
        )

    falkor = get_falkor_client()
    graph_name = settings.GRAPH_COMPANY
    org_id = settings.NEXUS_ORG_ID

    # 1. Identify nodes whose ONLY DERIVED_FROM edge points to this event
    find_derived_cypher = """
    MATCH (n)-[r:DERIVED_FROM]->(se:SourceEvent {id: $event_id, org_id: $org_id})
    WHERE size((n)-[:DERIVED_FROM]->()) = 1
    RETURN n.id AS id
    """
    res = falkor.query(
        graph_name, find_derived_cypher, {"event_id": event_id, "org_id": org_id}
    )
    derived_ids = [row[0] for row in res.result_set] if res and res.result_set else []

    # 2. Delete those derived-only nodes
    if derived_ids:
        delete_nodes_cypher = """
        MATCH (n)
        WHERE n.id IN $ids AND n.org_id = $org_id
        DETACH DELETE n
        """
        falkor.query(
            graph_name, delete_nodes_cypher, {"ids": derived_ids, "org_id": org_id}
        )

    # 3. Delete the SourceEvent itself
    delete_se_cypher = """
    MATCH (se:SourceEvent {id: $event_id, org_id: $org_id})
    DETACH DELETE se
    """
    falkor.query(graph_name, delete_se_cypher, {"event_id": event_id, "org_id": org_id})

    # 4. Remove episodic node from nexus_temporal if exists
    falkor.query(
        settings.GRAPH_TEMPORAL,
        """
        MATCH (ep:Episodic)
        WHERE ep.name CONTAINS $event_id OR ep.uuid = $event_id
        DETACH DELETE ep
        """,
        {"event_id": event_id},
    )

    return {
        "status": "deleted",
        "event_id": event_id,
        "deleted_nodes_count": len(derived_ids) + 1,
    }
