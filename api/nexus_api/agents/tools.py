"""Agent tools registry for Track 01 and Track 02.

Tools execute graph algorithms, multi-hop traversals, memory retrieval,
and action generation. Every tool returns {result, cypher, rows, ms, touched_ids}.
"""

import time
from typing import Any, Callable

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings
from nexus_api.memory.store import get_memory_store


def who_owns(service_id: str, org_id: str = "acme") -> dict[str, Any]:
    """Find the team, maintainers, and on-call engineers for a service."""
    t0 = time.time()
    settings = get_settings()
    falkor = get_falkor_client()

    cypher = """
    MATCH (s:Service {id: $service_id, org_id: $org_id})
    OPTIONAL MATCH (t:Team {org_id: $org_id})-[:OWNS]->(s)
    OPTIONAL MATCH (p:Person {org_id: $org_id})-[:MAINTAINS]->(s)
    OPTIONAL MATCH (p2:Person {org_id: $org_id})-[:KNOWS_ABOUT]->(s)
    RETURN s.id AS service,
           s.name AS name,
           s.tier AS tier,
           t.name AS team,
           collect(DISTINCT {id: p.id, name: p.name, role: p.role}) AS maintainers,
           collect(DISTINCT {id: p2.id, name: p2.name}) AS experts
    """
    res = falkor.query(settings.GRAPH_COMPANY, cypher, {"service_id": service_id, "org_id": org_id})
    ms = int((time.time() - t0) * 1000)

    rows = 0
    result: dict[str, Any] = {"service": service_id, "maintainers": [], "experts": []}
    touched: list[str] = [service_id]

    if res and res.result_set:
        row = res.result_set[0]
        rows = 1
        result = {
            "service": row[0],
            "name": row[1],
            "tier": row[2],
            "team": row[3],
            "maintainers": row[4] or [],
            "experts": row[5] or [],
        }
        for m in result["maintainers"]:
            if m.get("id"):
                touched.append(m["id"])

    return {
        "result": result,
        "cypher": cypher.strip().replace("    ", " "),
        "rows": rows,
        "ms": ms,
        "touched_ids": touched,
    }


def blast_radius(service_id: str, org_id: str = "acme") -> dict[str, Any]:
    """Calculate upstream and downstream blast radius over Service DEPENDS_ON hierarchy."""
    t0 = time.time()
    settings = get_settings()
    falkor = get_falkor_client()

    cypher = """
    MATCH path = (root:Service {id: $service_id, org_id: $org_id})<-[:DEPENDS_ON*1..4]-(downstream:Service)
    RETURN downstream.id AS service_id,
           downstream.name AS service_name,
           downstream.tier AS tier,
           length(path) AS depth
    ORDER BY depth ASC
    """
    res = falkor.query(settings.GRAPH_COMPANY, cypher, {"service_id": service_id, "org_id": org_id})
    ms = int((time.time() - t0) * 1000)

    affected = []
    touched = [service_id]
    if res and res.result_set:
        for row in res.result_set:
            affected.append({
                "service_id": row[0],
                "service_name": row[1],
                "tier": row[2],
                "depth": row[3],
            })
            touched.append(row[0])

    # Also check immediate dependencies (what this service depends on)
    dep_cypher = """
    MATCH (root:Service {id: $service_id, org_id: $org_id})-[:DEPENDS_ON]->(dep:Service)
    RETURN dep.id AS id, dep.name AS name
    """
    res_dep = falkor.query(settings.GRAPH_COMPANY, dep_cypher, {"service_id": service_id, "org_id": org_id})
    depends_on = []
    if res_dep and res_dep.result_set:
        for row in res_dep.result_set:
            depends_on.append({"id": row[0], "name": row[1]})
            touched.append(row[0])

    return {
        "result": {
            "root_service": service_id,
            "upstream_affected_count": len(affected),
            "upstream_affected": affected,
            "direct_dependencies": depends_on,
        },
        "cypher": cypher.strip().replace("    ", " "),
        "rows": len(affected),
        "ms": ms,
        "touched_ids": list(set(touched)),
    }


def criticality_rank(org_id: str = "acme") -> dict[str, Any]:
    """Run PageRank and betweenness centrality over Service DEPENDS_ON graph."""
    t0 = time.time()
    settings = get_settings()
    falkor = get_falkor_client()

    cypher = "CALL algo.pageRank('Service', 'DEPENDS_ON')"
    res = None
    try:
        res = falkor.query(settings.GRAPH_COMPANY, cypher)
    except Exception:
        # Fallback to degree centrality query if procedure unavailable
        cypher = """
        MATCH (s:Service {org_id: $org_id})
        OPTIONAL MATCH (other:Service)-[r:DEPENDS_ON]->(s)
        RETURN s.id AS service, count(r) AS score
        ORDER BY score DESC
        """
        res = falkor.query(settings.GRAPH_COMPANY, cypher, {"org_id": org_id})

    ms = int((time.time() - t0) * 1000)
    ranks = []
    touched = []
    if res and res.result_set:
        for row in res.result_set:
            node = row[0]
            score = float(row[1]) if len(row) > 1 else 0.0
            node_id = getattr(node, "properties", {}).get("id") or (
                str(node) if not hasattr(node, "id") else getattr(node, "id", "")
            )
            ranks.append({"service": node_id, "score": round(score, 4)})
            if node_id:
                touched.append(node_id)

    return {
        "result": ranks[:8],
        "cypher": cypher.strip(),
        "rows": len(ranks),
        "ms": ms,
        "touched_ids": touched[:8],
    }


def decision_trace(decision_id: str, org_id: str = "acme") -> dict[str, Any]:
    """Trace multi-hop decision causality, supersessions, incidents, and PRs."""
    t0 = time.time()
    settings = get_settings()
    falkor = get_falkor_client()

    cypher = """
    MATCH (d:Decision {id: $decision_id, org_id: $org_id})
    OPTIONAL MATCH (d)-[:SUPERSEDES*1..3]->(old:Decision)
    OPTIONAL MATCH (d)<-[:DOCUMENTED_IN]-(doc:Document)
    OPTIONAL MATCH (d)<-[:IMPLEMENTED_BY]-(pr:PullRequest)
    OPTIONAL MATCH (pr)<-[:TRIGGERED]-(inc:Incident)
    RETURN d.id AS id,
           d.title AS title,
           d.status AS status,
           collect(DISTINCT old.id) AS superseded_ids,
           collect(DISTINCT doc.id) AS docs,
           collect(DISTINCT pr.id) AS prs,
           collect(DISTINCT inc.id) AS incidents
    """
    res = falkor.query(settings.GRAPH_COMPANY, cypher, {"decision_id": decision_id, "org_id": org_id})
    ms = int((time.time() - t0) * 1000)

    rows = 0
    result: dict[str, Any] = {"decision": decision_id}
    touched = [decision_id]

    if res and res.result_set:
        row = res.result_set[0]
        rows = 1
        result = {
            "id": row[0],
            "title": row[1],
            "status": row[2],
            "superseded_decisions": row[3] or [],
            "documents": row[4] or [],
            "pull_requests": row[5] or [],
            "incidents": row[6] or [],
        }
        touched.extend(result["superseded_decisions"])
        touched.extend(result["pull_requests"])
        touched.extend(result["incidents"])

    return {
        "result": result,
        "cypher": cypher.strip().replace("    ", " "),
        "rows": rows,
        "ms": ms,
        "touched_ids": list(set(touched)),
    }


def find_experts(service_id: str, org_id: str = "acme") -> dict[str, Any]:
    """Identify key maintainers and bus factor for a service."""
    t0 = time.time()
    settings = get_settings()
    falkor = get_falkor_client()

    cypher = """
    MATCH (s:Service {id: $service_id, org_id: $org_id})
    OPTIONAL MATCH (p:Person {org_id: $org_id})-[:MAINTAINS]->(s)
    RETURN s.id AS service,
           collect(DISTINCT {id: p.id, name: p.name, role: p.role}) AS maintainers
    """
    res = falkor.query(settings.GRAPH_COMPANY, cypher, {"service_id": service_id, "org_id": org_id})
    ms = int((time.time() - t0) * 1000)

    maintainers = []
    touched = [service_id]
    if res and res.result_set:
        maintainers = res.result_set[0][1] or []
        for m in maintainers:
            if m.get("id"):
                touched.append(m["id"])

    bus_factor = len(maintainers)
    return {
        "result": {
            "service_id": service_id,
            "maintainers": maintainers,
            "bus_factor": bus_factor,
            "is_single_point_of_failure": bus_factor == 1,
        },
        "cypher": cypher.strip().replace("    ", " "),
        "rows": len(maintainers),
        "ms": ms,
        "touched_ids": touched,
    }


def recall(entities: list[str], tenant: str = "acme") -> dict[str, Any]:
    """Search episodic memory and procedural playbooks for similar past incidents."""
    t0 = time.time()
    store = get_memory_store(tenant=tenant)
    episodes = store.recall_episodes(entities=entities, limit=3)
    ms = int((time.time() - t0) * 1000)

    cypher_preview = (
        f"MATCH (ep:Episode {{tenant: '{tenant}'}})-[:TOUCHED]->(ent:EntityRef) WHERE ent.id IN {entities} ..."
    )
    return {
        "result": {
            "recalled_episodes": episodes,
            "has_matching_playbook": any(e.get("playbook") for e in episodes),
        },
        "cypher": cypher_preview,
        "rows": len(episodes),
        "ms": ms,
        "touched_ids": entities,
    }


def remember(
    incident_id: str,
    goal: str,
    outcome: str,
    entities: list[str],
    tool_sequence: list[str] | None = None,
    tenant: str = "acme",
) -> dict[str, Any]:
    """Save resolved incident episode and procedural playbook in native FalkorDB memory."""
    t0 = time.time()
    store = get_memory_store(tenant=tenant)

    proc_id = None
    if tool_sequence:
        pattern = f"incident_{incident_id.split('-')[0].lower()}"
        proc_id = store.register_procedure(trigger_pattern=pattern, tool_sequence=tool_sequence)

    ep_id = store.record_episode(
        incident_id=incident_id,
        goal=goal,
        outcome=outcome,
        touched_entities=entities,
        procedure_id=proc_id,
    )
    ms = int((time.time() - t0) * 1000)

    return {
        "result": {
            "episode_id": ep_id,
            "procedure_id": proc_id,
            "status": "memorized",
        },
        "cypher": f"MERGE (ep:Episode {{id: '{ep_id}'}}) ...",
        "rows": 1,
        "ms": ms,
        "touched_ids": [ep_id, *entities],
    }


# Action tools (Actions based on what the graph shows - Track 1)


def open_ticket(title: str, service_id: str, priority: str = "high", org_id: str = "acme") -> dict[str, Any]:
    """Create an action ticket in the graph."""
    t0 = time.time()
    settings = get_settings()
    falkor = get_falkor_client()
    from datetime import UTC, datetime
    import uuid

    action_id = f"act_ticket_{uuid.uuid4().hex[:6]}"
    now = datetime.now(UTC).isoformat()

    cypher = """
    MATCH (s:Service {id: $service_id, org_id: $org_id})
    CREATE (a:Action {
        id: $action_id,
        kind: 'ticket',
        title: $title,
        priority: $priority,
        target: $service_id,
        status: 'created',
        ts: $now
    })
    MERGE (a)-[:TARGETS]->(s)
    RETURN a.id
    """
    falkor.query(
        settings.GRAPH_COMPANY,
        cypher,
        {
            "action_id": action_id,
            "service_id": service_id,
            "title": title,
            "priority": priority,
            "org_id": org_id,
            "now": now,
        },
    )
    ms = int((time.time() - t0) * 1000)

    return {
        "result": {"action_id": action_id, "kind": "ticket", "title": title, "target": service_id},
        "cypher": cypher.strip().replace("    ", " "),
        "rows": 1,
        "ms": ms,
        "touched_ids": [service_id, action_id],
    }


def page_owner(service_id: str, message: str, org_id: str = "acme") -> dict[str, Any]:
    """Trigger an on-call page action targeting the maintainers found in the graph."""
    t0 = time.time()
    settings = get_settings()
    falkor = get_falkor_client()
    from datetime import UTC, datetime
    import uuid

    action_id = f"act_page_{uuid.uuid4().hex[:6]}"
    now = datetime.now(UTC).isoformat()

    cypher = """
    MATCH (s:Service {id: $service_id, org_id: $org_id})
    OPTIONAL MATCH (p:Person {org_id: $org_id})-[:MAINTAINS]->(s)
    CREATE (a:Action {
        id: $action_id,
        kind: 'page',
        service_id: $service_id,
        message: $message,
        status: 'dispatched',
        ts: $now
    })
    MERGE (a)-[:TARGETS]->(s)
    RETURN a.id, collect(p.name) AS paged_maintainers
    """
    res = falkor.query(
        settings.GRAPH_COMPANY,
        cypher,
        {"action_id": action_id, "service_id": service_id, "message": message, "org_id": org_id, "now": now},
    )
    ms = int((time.time() - t0) * 1000)

    paged = []
    if res and res.result_set:
        paged = res.result_set[0][1] or []

    return {
        "result": {"action_id": action_id, "kind": "page", "service": service_id, "paged_engineers": paged},
        "cypher": cypher.strip().replace("    ", " "),
        "rows": 1,
        "ms": ms,
        "touched_ids": [service_id, action_id],
    }


def flag_decision_for_review(decision_id: str, reason: str, org_id: str = "acme") -> dict[str, Any]:
    """Flag a stale or implicated decision for architectural review."""
    t0 = time.time()
    settings = get_settings()
    falkor = get_falkor_client()
    from datetime import UTC, datetime
    import uuid

    action_id = f"act_flag_{uuid.uuid4().hex[:6]}"
    now = datetime.now(UTC).isoformat()

    cypher = """
    MATCH (d:Decision {id: $decision_id, org_id: $org_id})
    SET d.review_flagged = true, d.review_reason = $reason
    CREATE (a:Action {
        id: $action_id,
        kind: 'flag_decision',
        decision_id: $decision_id,
        reason: $reason,
        status: 'flagged',
        ts: $now
    })
    MERGE (a)-[:FLAGS]->(d)
    RETURN a.id, d.title
    """
    res = falkor.query(
        settings.GRAPH_COMPANY,
        cypher,
        {"action_id": action_id, "decision_id": decision_id, "reason": reason, "org_id": org_id, "now": now},
    )
    ms = int((time.time() - t0) * 1000)

    title = ""
    if res and res.result_set:
        title = res.result_set[0][1] or ""

    return {
        "result": {"action_id": action_id, "decision": decision_id, "decision_title": title, "status": "flagged"},
        "cypher": cypher.strip().replace("    ", " "),
        "rows": 1,
        "ms": ms,
        "touched_ids": [decision_id, action_id],
    }


# Tool Definitions & Schema for MCP and LLM function calling
TOOL_DEFINITIONS = [
    {
        "name": "blast_radius",
        "description": "Calculate upstream affected services that depend on this service when it fails.",
        "parameters": {
            "type": "object",
            "properties": {
                "service_id": {"type": "string", "description": "Service ID (e.g. web-checkout, auth-gateway)"},
                "org_id": {"type": "string", "default": "acme"},
            },
            "required": ["service_id"],
        },
    },
    {
        "name": "who_owns",
        "description": "Look up the owner team, maintainer engineers, and domain experts for a service.",
        "parameters": {
            "type": "object",
            "properties": {
                "service_id": {"type": "string", "description": "Service ID to check ownership for"},
                "org_id": {"type": "string", "default": "acme"},
            },
            "required": ["service_id"],
        },
    },
    {
        "name": "decision_trace",
        "description": "Trace architectural decisions, supersession chains, incidents, and PRs affecting a decision.",
        "parameters": {
            "type": "object",
            "properties": {
                "decision_id": {"type": "string", "description": "Decision ID (e.g. DEC-017, DEC-021)"},
                "org_id": {"type": "string", "default": "acme"},
            },
            "required": ["decision_id"],
        },
    },
    {
        "name": "criticality_rank",
        "description": "Run graph PageRank & centrality algorithms to score service criticality across the dependency graph.",
        "parameters": {
            "type": "object",
            "properties": {"org_id": {"type": "string", "default": "acme"}},
        },
    },
    {
        "name": "find_experts",
        "description": "Identify key maintainers and domain experts for a service to assess bus factor risk.",
        "parameters": {
            "type": "object",
            "properties": {
                "service_id": {"type": "string", "description": "Service ID"},
                "org_id": {"type": "string", "default": "acme"},
            },
            "required": ["service_id"],
        },
    },
    {
        "name": "recall",
        "description": "Search episodic agent memory to recall past incident outcomes and reusable playbooks.",
        "parameters": {
            "type": "object",
            "properties": {
                "entities": {"type": "array", "items": {"type": "string"}, "description": "Entity/service IDs"},
                "tenant": {"type": "string", "default": "acme"},
            },
            "required": ["entities"],
        },
    },
    {
        "name": "remember",
        "description": "Store an incident episode and procedural playbook in agent memory.",
        "parameters": {
            "type": "object",
            "properties": {
                "incident_id": {"type": "string"},
                "goal": {"type": "string"},
                "outcome": {"type": "string"},
                "entities": {"type": "array", "items": {"type": "string"}},
                "tool_sequence": {"type": "array", "items": {"type": "string"}},
                "tenant": {"type": "string", "default": "acme"},
            },
            "required": ["incident_id", "goal", "outcome", "entities"],
        },
    },
    {
        "name": "open_ticket",
        "description": "Create an automated remediation ticket in the company graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "service_id": {"type": "string"},
                "priority": {"type": "string", "default": "high"},
            },
            "required": ["title", "service_id"],
        },
    },
    {
        "name": "page_owner",
        "description": "Dispatch an urgent page to the primary maintainer of a service found in the graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "service_id": {"type": "string"},
                "message": {"type": "string"},
            },
            "required": ["service_id", "message"],
        },
    },
    {
        "name": "flag_decision_for_review",
        "description": "Flag a superseded or implicated decision for architectural review.",
        "parameters": {
            "type": "object",
            "properties": {
                "decision_id": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["decision_id", "reason"],
        },
    },
]

TOOLS_BY_NAME: dict[str, Callable[..., dict[str, Any]]] = {
    "blast_radius": blast_radius,
    "who_owns": who_owns,
    "decision_trace": decision_trace,
    "criticality_rank": criticality_rank,
    "find_experts": find_experts,
    "recall": recall,
    "remember": remember,
    "open_ticket": open_ticket,
    "page_owner": page_owner,
    "flag_decision_for_review": flag_decision_for_review,
}
