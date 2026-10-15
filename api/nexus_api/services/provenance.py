"""Provenance service: traces current vs superseded sources for decisions."""

from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings
from nexus_api.models.api import SourceRef


def get_decision_provenance(decision_id: str, org_id: str = "acme") -> dict[str, Any]:
    """Build current_sources and superseded_sources for a decision."""
    settings = get_settings()
    falkor = get_falkor_client()
    graph_name = settings.GRAPH_COMPANY

    # 1. Fetch target decision and its direct sources
    direct_cypher = """
    MATCH (d:Decision {id: $dec_id, org_id: $org_id})
    OPTIONAL MATCH (d)-[r:DOCUMENTED_IN|TRACKED_BY|DECIDED_IN]->(src)
    RETURN d.id AS dec_id, d.title AS title, d.status AS status, d.decided_at AS decided_at,
           labels(src) AS src_labels, src.id AS src_id, src.title AS src_title,
           r.status AS edge_status, type(r) AS rel_type,
           coalesce(src.created_at, src.ts, src.merged_at) AS src_date
    """
    res = falkor.query(
        graph_name, direct_cypher, {"dec_id": decision_id, "org_id": org_id}
    )

    current_sources: list[SourceRef] = []
    superseded_sources: list[SourceRef] = []
    seen_ids: set[str] = set()

    # Find if there is a tracking ticket for "via" display
    ticket_cypher = """
    MATCH (d:Decision {id: $dec_id, org_id: $org_id})-[:TRACKED_BY]->(t:Ticket)
    RETURN t.id AS ticket_id
    """
    res_ticket = falkor.query(
        graph_name, ticket_cypher, {"dec_id": decision_id, "org_id": org_id}
    )
    via_ticket = (
        res_ticket.result_set[0][0] if res_ticket and res_ticket.result_set else None
    )

    dec_status = "active"
    if res and res.result_set:
        for row in res.result_set:
            dec_status = row[2] or "active"
            src_labels = row[4] or []
            src_id = row[5]
            src_title = row[6] or src_id
            src_date = row[9] or row[3]  # source date or decision date

            if not src_id or src_id in seen_ids:
                continue
            seen_ids.add(src_id)

            via_str = (
                via_ticket
                if "Document" in src_labels and via_ticket
                else ("Linear" if "Ticket" in src_labels else "Slack")
            )
            ref = SourceRef(
                id=src_id,
                label=src_title,
                date=src_date,
                via=via_str,
            )
            if dec_status == "superseded" or row[7] == "superseded":
                ref.reason = "Invalidated by superseding decision"
                superseded_sources.append(ref)
            else:
                current_sources.append(ref)

    # 2. Fetch superseded decisions via SUPERSEDES chain
    supersedes_chain_cypher = """
    MATCH (d:Decision {id: $dec_id, org_id: $org_id})-[:SUPERSEDES*1..3]->(old:Decision)
    OPTIONAL MATCH (old)-[r:DOCUMENTED_IN|TRACKED_BY|DECIDED_IN]->(oldsrc)
    RETURN old.id AS old_id, old.title AS old_title, old.decided_at AS old_date,
           labels(oldsrc) AS old_labels, oldsrc.id AS old_src_id, oldsrc.title AS old_src_title,
           oldsrc.channel AS old_channel,
           coalesce(oldsrc.ts, oldsrc.created_at, old.decided_at) AS oldsrc_date
    """
    res_old = falkor.query(
        graph_name, supersedes_chain_cypher, {"dec_id": decision_id, "org_id": org_id}
    )
    if res_old and res_old.result_set:
        for row in res_old.result_set:
            old_src_id = row[4]
            if not old_src_id or old_src_id in seen_ids:
                continue
            seen_ids.add(old_src_id)
            label = row[5] or old_src_id
            if row[6]:  # Slack channel
                label = f"#{row[6]} Slack Thread"
            date_val = row[7] or row[2]
            superseded_sources.append(
                SourceRef(
                    id=old_src_id,
                    label=label,
                    date=date_val,
                    reason=f"Invalidated by {decision_id}",
                )
            )

    return {
        "decision_id": decision_id,
        "status": dec_status,
        "current_sources": [s.model_dump() for s in current_sources],
        "superseded_sources": [s.model_dump() for s in superseded_sources],
    }
