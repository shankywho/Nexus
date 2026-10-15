"""Derived graph metrics: KNOWS_ABOUT weights and centrality."""

import logging
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings

logger = logging.getLogger(__name__)


def compute_derived_edges(org_id: str = "acme") -> None:
    """Compute and update KNOWS_ABOUT relationships and centrality."""
    settings = get_settings()
    falkor = get_falkor_client()
    graph_name = settings.GRAPH_COMPANY

    # 1. Update KNOWS_ABOUT for maintainers (base weight 0.9)
    maintainer_cypher = """
    MATCH (p:Person {org_id: $org_id})-[m:MAINTAINS]->(s:Service {org_id: $org_id})
    MERGE (p)-[k:KNOWS_ABOUT {org_id: $org_id}]->(s)
    SET k.weight = 0.9,
        k.evidence_count = coalesce(k.evidence_count, 1) + 1
    """
    try:
        falkor.query(graph_name, maintainer_cypher, {"org_id": org_id})
    except Exception as exc:
        logger.debug("maintainer_cypher failed: %s", exc)

    # 2. Update KNOWS_ABOUT from PRs affecting services
    pr_cypher = """
    MATCH (p:Person {org_id: $org_id})-[:AUTHORED]->(pr:PullRequest {org_id: $org_id})-[:AFFECTS]->(s:Service {org_id: $org_id})
    WITH p, s, count(pr) AS pr_count
    OPTIONAL MATCH (p)-[m:MAINTAINS]->(s)
    MERGE (p)-[k:KNOWS_ABOUT {org_id: $org_id}]->(s)
    SET k.evidence_count = coalesce(k.evidence_count, 0) + pr_count,
        k.weight = CASE WHEN m IS NOT NULL THEN 1.0 ELSE 0.5 END
    """
    try:
        falkor.query(graph_name, pr_cypher, {"org_id": org_id})
    except Exception as exc:
        logger.debug("pr_cypher failed: %s", exc)

    # 3. Update KNOWS_ABOUT from tickets affecting services
    ticket_cypher = """
    MATCH (p:Person {org_id: $org_id})-[:AUTHORED]->(t:Ticket {org_id: $org_id})-[:AFFECTS]->(s:Service {org_id: $org_id})
    WITH p, s, count(t) AS t_count
    MERGE (p)-[k:KNOWS_ABOUT {org_id: $org_id}]->(s)
    SET k.evidence_count = coalesce(k.evidence_count, 0) + t_count
    """
    try:
        falkor.query(graph_name, ticket_cypher, {"org_id": org_id})
    except Exception as exc:
        logger.debug("ticket_cypher failed: %s", exc)


def get_degree_centrality(
    org_id: str = "acme", limit: int = 10
) -> list[dict[str, Any]]:
    """Return top people by degree centrality with their expertise."""
    settings = get_settings()
    falkor = get_falkor_client()
    graph_name = settings.GRAPH_COMPANY

    cypher = """
    MATCH (p:Person {org_id: $org_id})-[r]-()
    WITH p, count(r) AS degree
    OPTIONAL MATCH (p)-[k:KNOWS_ABOUT]->(s:Service)
    RETURN p.id AS person_id, p.name AS name, degree,
           collect({service: s.id, weight: k.weight}) AS expertise
    ORDER BY degree DESC
    LIMIT $limit
    """
    res = falkor.query(graph_name, cypher, {"org_id": org_id, "limit": limit})
    results: list[dict[str, Any]] = []
    if res and res.result_set:
        for row in res.result_set:
            results.append(
                {
                    "person_id": row[0],
                    "name": row[1],
                    "degree": row[2],
                    "expertise": [e for e in row[3] if e.get("service")],
                }
            )
    return results
