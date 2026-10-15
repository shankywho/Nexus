"""Audits service: executes the 4 Quick Audit Cypher files and formats graph outputs."""

import logging
from pathlib import Path
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings
from nexus_api.services.tracing import get_tracing_store

logger = logging.getLogger(__name__)

CYPHER_DIR = Path(__file__).resolve().parent.parent / "cypher"


def _extract_node(node_obj: Any) -> dict[str, Any] | None:
    if node_obj is None or not hasattr(node_obj, "properties"):
        return None
    props = dict(node_obj.properties)
    node_id = props.get("id") or str(getattr(node_obj, "id", ""))
    labels = list(getattr(node_obj, "labels", []))
    label = props.get("name") or props.get("title") or node_id
    return {
        "id": node_id,
        "internal_id": getattr(node_obj, "id", None),
        "label": label,
        "labels": labels,
        "properties": props,
    }


def _extract_edge(edge_obj: Any, node_map: dict[int, str]) -> dict[str, Any] | None:
    if edge_obj is None or not hasattr(edge_obj, "relation"):
        return None
    src_int = getattr(edge_obj, "src_node", None)
    dst_int = getattr(edge_obj, "dest_node", None)
    src_id = node_map.get(src_int, str(src_int)) if src_int is not None else "unknown"
    dst_id = node_map.get(dst_int, str(dst_int)) if dst_int is not None else "unknown"
    props = dict(getattr(edge_obj, "properties", {}))
    return {
        "id": str(getattr(edge_obj, "id", f"{src_id}_{dst_id}")),
        "source": src_id,
        "target": dst_id,
        "rel_type": getattr(edge_obj, "relation", "RELATED_TO"),
        "properties": props,
        "status": props.get("status", "active"),
    }


def run_who_owns_what(org_id: str = "acme") -> dict[str, Any]:
    """Execute who_owns_what.cypher."""
    settings = get_settings()
    falkor = get_falkor_client()
    tracing = get_tracing_store()

    run_id = tracing.start_run(kind="audit", input_data={"audit": "who_owns_what"})
    cypher_file = CYPHER_DIR / "who_owns_what.cypher"
    cypher = cypher_file.read_text(encoding="utf-8")

    res = falkor.query(settings.GRAPH_COMPANY, cypher, {"org_id": org_id})

    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    node_int_map: dict[int, str] = {}
    highlight_ids: set[str] = set()

    if res and res.result_set:
        for row in res.result_set:
            p, r, t, team = row[0], row[1], row[2], row[3]
            for n_obj in (p, t, team):
                n_dict = _extract_node(n_obj)
                if n_dict:
                    nodes[n_dict["id"]] = n_dict
                    if n_dict["internal_id"] is not None:
                        node_int_map[n_dict["internal_id"]] = n_dict["id"]
                    highlight_ids.add(n_dict["id"])

            e_dict = _extract_edge(r, node_int_map)
            if e_dict:
                edges.append(e_dict)

    tracing.record_step(
        run_id=run_id,
        node="audit_who_owns_what",
        latency_ms=10,
        status="ok",
        output_preview=f"Returned {len(nodes)} nodes, {len(edges)} edges",
        cypher=cypher,
    )
    tracing.end_run(run_id, status="completed")

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "highlight_ids": list(highlight_ids),
        "cypher": cypher,
        "run_id": run_id,
    }


def run_decision_trace(
    decision_id: str | None = None,
    service_id: str | None = None,
    org_id: str = "acme",
) -> dict[str, Any]:
    """Execute decision_trace.cypher."""
    settings = get_settings()
    falkor = get_falkor_client()
    tracing = get_tracing_store()

    run_id = tracing.start_run(
        kind="audit",
        input_data={
            "audit": "decision_trace",
            "decision_id": decision_id,
            "service_id": service_id,
        },
    )
    cypher_file = CYPHER_DIR / "decision_trace.cypher"
    cypher = cypher_file.read_text(encoding="utf-8")

    params: dict[str, Any] = {
        "org_id": org_id,
        "decision_id": decision_id,
        "service_id": service_id,
    }
    res = falkor.query(settings.GRAPH_COMPANY, cypher, params)

    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    node_int_map: dict[int, str] = {}
    highlight_ids: set[str] = set()

    if res and res.result_set:
        for row in res.result_set:
            d_node = row[0]
            d_dict = _extract_node(d_node)
            if d_dict:
                nodes[d_dict["id"]] = d_dict
                if d_dict["internal_id"] is not None:
                    node_int_map[d_dict["internal_id"]] = d_dict["id"]
                highlight_ids.add(d_dict["id"])

            for path_idx in range(1, 5):
                path_obj = row[path_idx]
                if path_obj is not None and hasattr(path_obj, "nodes"):
                    for n_obj in path_obj.nodes():
                        n_dict = _extract_node(n_obj)
                        if n_dict:
                            nodes[n_dict["id"]] = n_dict
                            if n_dict["internal_id"] is not None:
                                node_int_map[n_dict["internal_id"]] = n_dict["id"]
                            highlight_ids.add(n_dict["id"])

                    if hasattr(path_obj, "edges"):
                        for e_obj in path_obj.edges():
                            e_dict = _extract_edge(e_obj, node_int_map)
                            if e_dict:
                                edges.append(e_dict)

    tracing.end_run(run_id, status="completed")

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "highlight_ids": list(highlight_ids),
        "cypher": cypher,
        "run_id": run_id,
    }


def run_stale_knowledge(org_id: str = "acme") -> dict[str, Any]:
    """Execute stale_knowledge.cypher."""
    settings = get_settings()
    falkor = get_falkor_client()
    tracing = get_tracing_store()

    run_id = tracing.start_run(kind="audit", input_data={"audit": "stale_knowledge"})
    cypher_file = CYPHER_DIR / "stale_knowledge.cypher"
    cypher = cypher_file.read_text(encoding="utf-8")

    res = falkor.query(settings.GRAPH_COMPANY, cypher, {"org_id": org_id})

    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    node_int_map: dict[int, str] = {}
    highlight_ids: set[str] = set()

    if res and res.result_set:
        for row in res.result_set:
            d_node, edge_obj, s_node, status = row[0], row[1], row[2], row[3]
            for n_obj in (d_node, s_node):
                n_dict = _extract_node(n_obj)
                if n_dict:
                    nodes[n_dict["id"]] = n_dict
                    if n_dict["internal_id"] is not None:
                        node_int_map[n_dict["internal_id"]] = n_dict["id"]
                    if (
                        status == "superseded"
                        or n_dict.get("properties", {}).get("status") == "superseded"
                    ):
                        highlight_ids.add(n_dict["id"])

            e_dict = _extract_edge(edge_obj, node_int_map)
            if e_dict:
                edges.append(e_dict)
                if e_dict["status"] == "superseded":
                    highlight_ids.add(e_dict["id"])

    tracing.end_run(run_id, status="completed")

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "highlight_ids": list(highlight_ids),
        "cypher": cypher,
        "run_id": run_id,
    }


def run_bus_factor(org_id: str = "acme") -> dict[str, Any]:
    """Execute bus_factor.cypher."""
    settings = get_settings()
    falkor = get_falkor_client()
    tracing = get_tracing_store()

    run_id = tracing.start_run(kind="audit", input_data={"audit": "bus_factor"})
    cypher_file = CYPHER_DIR / "bus_factor.cypher"
    cypher = cypher_file.read_text(encoding="utf-8")

    res = falkor.query(settings.GRAPH_COMPANY, cypher, {"org_id": org_id})

    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    highlight_ids: list[str] = []

    if res and res.result_set:
        for row in res.result_set:
            p_node, degree, expertise = row[0], row[1], row[2]
            p_dict = _extract_node(p_node)
            if p_dict:
                p_dict["properties"]["degree"] = degree
                p_dict["properties"]["expertise"] = expertise
                nodes[p_dict["id"]] = p_dict
                highlight_ids.append(p_dict["id"])

    tracing.end_run(run_id, status="completed")

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "highlight_ids": highlight_ids,
        "cypher": cypher,
        "run_id": run_id,
    }
