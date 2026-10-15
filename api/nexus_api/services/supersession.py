"""Decision supersession and lifecycle state machine."""

import logging
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings
from nexus_api.services.eventbus import get_eventbus

logger = logging.getLogger(__name__)


async def apply_decision_lifecycle(
    decision_id: str,
    event_kind: str,
    event_id: str,
    event_ts: str,
    supersedes_id: str | None = None,
    reverses_id: str | None = None,
    org_id: str = "acme",
) -> dict[str, Any]:
    """Execute decision lifecycle transitions per §9b."""
    settings = get_settings()
    falkor = get_falkor_client()
    graph_name = settings.GRAPH_COMPANY
    eventbus = get_eventbus()

    transitions: dict[str, Any] = {}

    # 1. Check if event promotes decision from proposed to active
    if event_kind in ("adr", "linear_ticket", "jira_ticket", "github_pr"):
        activate_cypher = """
        MATCH (d:Decision {id: $dec_id, org_id: $org_id})
        WHERE d.status = 'proposed'
        SET d.status = 'active',
            d.decided_at = coalesce(d.decided_at, $ts),
            d.updated_at = $ts
        WITH d
        OPTIONAL MATCH (d)-[r:DECIDED_IN|TRACKED_BY|DOCUMENTED_IN]->()
        SET r.status = 'active'
        RETURN d.id
        """
        falkor.query(
            graph_name,
            activate_cypher,
            {"dec_id": decision_id, "org_id": org_id, "ts": event_ts},
        )
        transitions["activated"] = decision_id

    # 2. Check if a PR reverses an active decision without immediate replacement (marks contested=true)
    if reverses_id and not supersedes_id:
        contest_cypher = """
        MATCH (d:Decision {id: $rev_id, org_id: $org_id})
        WHERE d.status = 'active'
        SET d.contested = true,
            d.contested_by_pr = $event_id,
            d.updated_at = $ts
        RETURN d.id
        """
        falkor.query(
            graph_name,
            contest_cypher,
            {
                "rev_id": reverses_id,
                "org_id": org_id,
                "event_id": event_id,
                "ts": event_ts,
            },
        )
        transitions["contested"] = reverses_id

    # 3. Check supersession: old decision becomes superseded by new decision
    target_old_id = supersedes_id or reverses_id
    if target_old_id and target_old_id != decision_id:
        supersede_cypher = """
        MATCH (old:Decision {id: $old_id, org_id: $org_id})
        WHERE old.status <> 'superseded'
        SET old.status = 'superseded',
            old.superseded_at = $ts,
            old.superseded_by = $new_id,
            old.contested = false,
            old.updated_at = $ts
        WITH old
        MATCH (new:Decision {id: $new_id, org_id: $org_id})
        MERGE (new)-[s:SUPERSEDES {org_id: $org_id}]->(old)
        SET s.at = $ts,
            s.via = $event_id,
            s.reason = 'Superseded by ' + $new_id
        WITH old, new
        OPTIONAL MATCH (old)-[r:DECIDED_IN|TRACKED_BY|DOCUMENTED_IN]->()
        SET r.status = 'superseded'
        RETURN old.id AS old_id, new.id AS new_id
        """
        res = falkor.query(
            graph_name,
            supersede_cypher,
            {
                "old_id": target_old_id,
                "new_id": decision_id,
                "org_id": org_id,
                "ts": event_ts,
                "event_id": event_id,
            },
        )
        if res and res.result_set:
            transitions["superseded"] = target_old_id
            transitions["superseded_by"] = decision_id
            await eventbus.publish(
                "decision.superseded",
                {
                    "old_decision_id": target_old_id,
                    "new_decision_id": decision_id,
                    "event_id": event_id,
                    "at": event_ts,
                },
            )

    return transitions
