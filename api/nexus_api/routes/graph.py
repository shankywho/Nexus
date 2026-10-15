"""Graph topology and temporal inspection routes."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.adapters.temporal import get_temporal_graph
from nexus_api.config import get_settings

router = APIRouter(prefix="/api/graph", tags=["graph"])


class TopologyNode(BaseModel):
    id: str
    name: str
    label: str
    group: str
    properties: dict[str, Any] = Field(default_factory=dict)


class TopologyLink(BaseModel):
    id: str
    source: str
    target: str
    label: str
    status: str = "active"  # active | superseded
    properties: dict[str, Any] = Field(default_factory=dict)


class TopologyResponse(BaseModel):
    nodes: list[TopologyNode]
    links: list[TopologyLink]


@router.get("/topology", response_model=TopologyResponse)
def get_graph_topology() -> dict[str, Any]:
    """Return full nexus_company graph for react-force-graph-2d."""
    settings = get_settings()
    falkor = get_falkor_client()
    graph_name = settings.GRAPH_COMPANY
    org_id = settings.NEXUS_ORG_ID

    cypher = """
    MATCH (s {org_id: $org_id})-[r]->(t {org_id: $org_id})
    RETURN s, r, t
    """
    res = falkor.query(graph_name, cypher, {"org_id": org_id})

    nodes_map: dict[str, TopologyNode] = {}
    links: list[TopologyLink] = []
    seen_link_ids: set[str] = set()

    if res and res.result_set:
        for row in res.result_set:
            s_obj, r_obj, t_obj = row[0], row[1], row[2]
            for obj in (s_obj, t_obj):
                if obj and hasattr(obj, "properties"):
                    p = dict(obj.properties)
                    nid = p.get("id") or str(getattr(obj, "id", ""))
                    name = p.get("name") or p.get("title") or nid
                    labels = list(getattr(obj, "labels", ["Entity"]))
                    group = labels[0] if labels else "Entity"
                    if nid not in nodes_map:
                        nodes_map[nid] = TopologyNode(
                            id=nid,
                            name=name,
                            label=name,
                            group=group,
                            properties=p,
                        )

            if r_obj and hasattr(r_obj, "relation"):
                s_nid = dict(s_obj.properties).get("id", str(getattr(s_obj, "id", "")))
                t_nid = dict(t_obj.properties).get("id", str(getattr(t_obj, "id", "")))
                r_props = dict(getattr(r_obj, "properties", {}))
                r_id = f"{s_nid}_{t_nid}_{r_obj.relation}"
                if r_id not in seen_link_ids:
                    seen_link_ids.add(r_id)
                    edge_status = r_props.get("status", "active")
                    if r_obj.relation == "SUPERSEDES":
                        edge_status = "superseded"
                    links.append(
                        TopologyLink(
                            id=r_id,
                            source=s_nid,
                            target=t_nid,
                            label=r_obj.relation,
                            status=edge_status,
                            properties=r_props,
                        )
                    )

    # Also include disconnected nodes if any
    all_nodes_cypher = "MATCH (n {org_id: $org_id}) RETURN n"
    res_nodes = falkor.query(graph_name, all_nodes_cypher, {"org_id": org_id})
    if res_nodes and res_nodes.result_set:
        for row in res_nodes.result_set:
            obj = row[0]
            if obj and hasattr(obj, "properties"):
                p = dict(obj.properties)
                nid = p.get("id") or str(getattr(obj, "id", ""))
                name = p.get("name") or p.get("title") or nid
                labels = list(getattr(obj, "labels", ["Entity"]))
                group = labels[0] if labels else "Entity"
                if nid not in nodes_map:
                    nodes_map[nid] = TopologyNode(
                        id=nid,
                        name=name,
                        label=name,
                        group=group,
                        properties=p,
                    )

    return {
        "nodes": list(nodes_map.values()),
        "links": links,
    }


@router.get("/temporal/edges")
async def get_temporal_edges(entity: str | None = None) -> list[dict[str, Any]]:
    """Retrieve temporal facts and valid/invalid temporal windows."""
    settings = get_settings()
    temporal = get_temporal_graph()
    if entity:
        return await temporal.get_entity_edges(entity_name=entity, group_id=settings.NEXUS_ORG_ID)
    return await temporal.search(query="", group_ids=[settings.NEXUS_ORG_ID], num_results=50)
