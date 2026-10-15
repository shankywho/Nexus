"""Projector service: maps SourceEvents into typed MERGE Cypher on nexus_company."""

import json
import logging
from datetime import UTC, datetime
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings
from nexus_api.models.events import SourceEventIn
from nexus_api.services.derive import compute_derived_edges
from nexus_api.services.supersession import apply_decision_lifecycle

logger = logging.getLogger(__name__)


async def project_event(event: SourceEventIn) -> dict[str, Any]:
    """Project a SourceEvent onto the typed nexus_company graph."""
    settings = get_settings()
    falkor = get_falkor_client()
    graph_name = settings.GRAPH_COMPANY
    org_id = event.org_id or settings.NEXUS_ORG_ID
    now_iso = datetime.now(UTC).isoformat()
    raw_json = json.dumps(event.model_dump())
    event_id = event.id or f"evt_{int(datetime.now().timestamp() * 1000)}"
    event_ts = event.ts or now_iso
    event_kind = (event.kind or "unknown").lower()
    actor_id = event.actor or "system"
    text_str = event.text or ""

    # 1. Upsert SourceEvent node
    upsert_source_cypher = """
    MERGE (se:SourceEvent {id: $id, org_id: $org_id})
    SET se.kind = $kind,
        se.ts = $ts,
        se.raw_json = $raw_json,
        se.ingested_at = $ingested_at
    RETURN se.id
    """
    falkor.query(
        graph_name,
        upsert_source_cypher,
        {
            "id": event_id,
            "org_id": org_id,
            "kind": event_kind,
            "ts": event_ts,
            "raw_json": raw_json,
            "ingested_at": now_iso,
        },
    )

    # 2. Upsert actor Person
    falkor.query(
        graph_name,
        """
        MERGE (p:Person {id: $actor_id, org_id: $org_id})
        ON CREATE SET p.name = $actor_id, p.role = 'Contributor'
        """,
        {"actor_id": actor_id, "org_id": org_id},
    )

    # 3. Upsert referenced services
    for s_id in event.refs.service_ids:
        falkor.query(
            graph_name,
            """
            MERGE (s:Service {id: $s_id, org_id: $org_id})
            ON CREATE SET s.name = $s_id, s.tier = 1
            """,
            {"s_id": s_id, "org_id": org_id},
        )

    # 4. Upsert Decision if present
    decision_id = event.refs.decision_id
    if decision_id:
        # Default status for new decision in a slack debate is proposed
        default_status = (
            "active"
            if event_kind in ("linear_ticket", "adr", "github_pr")
            else "proposed"
        )
        falkor.query(
            graph_name,
            """
            MERGE (d:Decision {id: $dec_id, org_id: $org_id})
            ON CREATE SET d.title = $title,
                          d.summary = $summary,
                          d.status = $default_status,
                          d.decided_at = $ts,
                          d.created_at = $ts
            """,
            {
                "dec_id": decision_id,
                "org_id": org_id,
                "title": f"Decision {decision_id}",
                "summary": event.text or "",
                "default_status": default_status,
                "ts": event_ts,
            },
        )
        # Link Decision -> AFFECTS -> Service
        for s_id in event.refs.service_ids:
            falkor.query(
                graph_name,
                """
                MATCH (d:Decision {id: $dec_id, org_id: $org_id})
                MATCH (s:Service {id: $s_id, org_id: $org_id})
                MERGE (d)-[r:AFFECTS {org_id: $org_id}]->(s)
                """,
                {"dec_id": decision_id, "s_id": s_id, "org_id": org_id},
            )

    # 5. Entity-specific projections
    if event_kind in ("slack_message", "slack_thread"):
        thread_id = event.thread_id or f"slack:{event.channel or 'general'}:{event_id}"
        falkor.query(
            graph_name,
            """
            MERGE (st:SlackThread {id: $thread_id, org_id: $org_id})
            SET st.channel = $channel,
                st.ts = $ts,
                st.summary = $summary,
                st.url = 'https://acme.slack.example/archives/' + $channel
            WITH st
            MATCH (p:Person {id: $actor_id, org_id: $org_id})
            MERGE (p)-[part:PARTICIPATED_IN {org_id: $org_id}]->(st)
            SET part.messages = coalesce(part.messages, 0) + 1
            WITH st
            MATCH (se:SourceEvent {id: $event_id, org_id: $org_id})
            MERGE (st)-[:DERIVED_FROM {org_id: $org_id}]->(se)
            """,
            {
                "thread_id": thread_id,
                "org_id": org_id,
                "channel": event.channel or "general",
                "ts": event_ts,
                "summary": (event.text or "")[:300],
                "actor_id": actor_id,
                "event_id": event_id,
            },
        )
        if decision_id:
            falkor.query(
                graph_name,
                """
                MATCH (d:Decision {id: $dec_id, org_id: $org_id})
                MATCH (st:SlackThread {id: $thread_id, org_id: $org_id})
                MERGE (d)-[r:DECIDED_IN {org_id: $org_id}]->(st)
                SET r.status = d.status
                """,
                {"dec_id": decision_id, "thread_id": thread_id, "org_id": org_id},
            )

    elif event_kind in ("linear_ticket", "jira_ticket"):
        ticket_id = event.refs.ticket_id or (
            text_str.split(":")[0] if ":" in text_str else event_id
        )
        falkor.query(
            graph_name,
            """
            MERGE (t:Ticket {id: $ticket_id, org_id: $org_id})
            SET t.title = $title,
                t.system = $system,
                t.status = 'open',
                t.url = 'https://linear.app/acme/issue/' + $ticket_id
            WITH t
            MATCH (p:Person {id: $actor_id, org_id: $org_id})
            MERGE (p)-[:AUTHORED {org_id: $org_id}]->(t)
            WITH t
            MATCH (se:SourceEvent {id: $event_id, org_id: $org_id})
            MERGE (t)-[:DERIVED_FROM {org_id: $org_id}]->(se)
            """,
            {
                "ticket_id": ticket_id,
                "org_id": org_id,
                "title": text_str,
                "system": "linear" if "linear" in event_kind else "jira",
                "actor_id": actor_id,
                "event_id": event_id,
            },
        )
        for s_id in event.refs.service_ids:
            falkor.query(
                graph_name,
                """
                MATCH (t:Ticket {id: $ticket_id, org_id: $org_id})
                MATCH (s:Service {id: $s_id, org_id: $org_id})
                MERGE (t)-[:AFFECTS {org_id: $org_id}]->(s)
                """,
                {"ticket_id": ticket_id, "s_id": s_id, "org_id": org_id},
            )
        if decision_id:
            falkor.query(
                graph_name,
                """
                MATCH (d:Decision {id: $dec_id, org_id: $org_id})
                MATCH (t:Ticket {id: $ticket_id, org_id: $org_id})
                MERGE (d)-[r:TRACKED_BY {org_id: $org_id}]->(t)
                SET r.status = d.status
                """,
                {"dec_id": decision_id, "ticket_id": ticket_id, "org_id": org_id},
            )

    elif event_kind in ("adr", "notion_doc", "doc"):
        doc_id = event.refs.doc_id or (
            text_str.split(":")[0] if ":" in text_str else event_id
        )
        doc_kind = "adr" if event_kind == "adr" else "notion"
        falkor.query(
            graph_name,
            """
            MERGE (doc:Document {id: $doc_id, org_id: $org_id})
            SET doc.title = $title,
                doc.kind = $kind,
                doc.created_at = $ts,
                doc.url = 'https://docs.acmepayments.test/' + $doc_id,
                doc.doc_path = 'fixtures/company/docs/' + $doc_id + '.md'
            WITH doc
            MATCH (p:Person {id: $actor_id, org_id: $org_id})
            MERGE (p)-[:AUTHORED {org_id: $org_id}]->(doc)
            WITH doc
            MATCH (se:SourceEvent {id: $event_id, org_id: $org_id})
            MERGE (doc)-[:DERIVED_FROM {org_id: $org_id}]->(se)
            """,
            {
                "doc_id": doc_id,
                "org_id": org_id,
                "title": text_str,
                "kind": doc_kind,
                "ts": event_ts,
                "actor_id": actor_id,
                "event_id": event_id,
            },
        )
        for s_id in event.refs.service_ids:
            falkor.query(
                graph_name,
                """
                MATCH (doc:Document {id: $doc_id, org_id: $org_id})
                MATCH (s:Service {id: $s_id, org_id: $org_id})
                MERGE (doc)-[:AFFECTS {org_id: $org_id}]->(s)
                """,
                {"doc_id": doc_id, "s_id": s_id, "org_id": org_id},
            )
        if decision_id:
            falkor.query(
                graph_name,
                """
                MATCH (d:Decision {id: $dec_id, org_id: $org_id})
                MATCH (doc:Document {id: $doc_id, org_id: $org_id})
                MERGE (d)-[r:DOCUMENTED_IN {org_id: $org_id}]->(doc)
                SET r.status = d.status
                """,
                {"dec_id": decision_id, "doc_id": doc_id, "org_id": org_id},
            )

    elif event_kind == "github_pr":
        pr_id = event.refs.pr_id or (
            text_str.split(":")[0].replace("PR #", "PR-").replace("PR-", "PR-")
            if "PR" in text_str
            else event_id
        )
        if not pr_id.startswith("PR-"):
            pr_id = f"PR-{pr_id.replace('PR #', '').strip()}"
        num = int("".join(c for c in pr_id if c.isdigit()) or "0")
        falkor.query(
            graph_name,
            """
            MERGE (pr:PullRequest {id: $pr_id, org_id: $org_id})
            SET pr.repo = 'acmepayments/core',
                pr.number = $number,
                pr.merged_at = $ts,
                pr.url = 'https://github.com/acme/core/pull/' + toString($number)
            WITH pr
            MATCH (p:Person {id: $actor_id, org_id: $org_id})
            MERGE (p)-[:AUTHORED {org_id: $org_id}]->(pr)
            WITH pr
            MATCH (se:SourceEvent {id: $event_id, org_id: $org_id})
            MERGE (pr)-[:DERIVED_FROM {org_id: $org_id}]->(se)
            """,
            {
                "pr_id": pr_id,
                "org_id": org_id,
                "number": num,
                "ts": event_ts,
                "actor_id": actor_id,
                "event_id": event_id,
            },
        )
        for s_id in event.refs.service_ids:
            falkor.query(
                graph_name,
                """
                MATCH (pr:PullRequest {id: $pr_id, org_id: $org_id})
                MATCH (s:Service {id: $s_id, org_id: $org_id})
                MERGE (pr)-[:AFFECTS {org_id: $org_id}]->(s)
                """,
                {"pr_id": pr_id, "s_id": s_id, "org_id": org_id},
            )
        if event.refs.ticket_id:
            falkor.query(
                graph_name,
                """
                MATCH (t:Ticket {id: $ticket_id, org_id: $org_id})
                MATCH (pr:PullRequest {id: $pr_id, org_id: $org_id})
                MERGE (t)-[:IMPLEMENTED_BY {org_id: $org_id}]->(pr)
                """,
                {"ticket_id": event.refs.ticket_id, "pr_id": pr_id, "org_id": org_id},
            )
        if event.reverses:
            falkor.query(
                graph_name,
                """
                MATCH (pr:PullRequest {id: $pr_id, org_id: $org_id})
                MATCH (d:Decision {id: $rev_id, org_id: $org_id})
                MERGE (pr)-[:REVERSES {org_id: $org_id}]->(d)
                """,
                {"pr_id": pr_id, "rev_id": event.reverses, "org_id": org_id},
            )

    elif event_kind == "incident":
        inc_id = (
            text_str.split(":")[0].strip() if ":" in text_str else f"INC-{event_id}"
        )
        falkor.query(
            graph_name,
            """
            MERGE (inc:Incident {id: $inc_id, org_id: $org_id})
            SET inc.severity = 'sev-1',
                inc.started_at = $ts,
                inc.summary = $summary
            WITH inc
            MATCH (se:SourceEvent {id: $event_id, org_id: $org_id})
            MERGE (inc)-[:DERIVED_FROM {org_id: $org_id}]->(se)
            """,
            {
                "inc_id": inc_id,
                "org_id": org_id,
                "ts": event_ts,
                "summary": event.text or "",
                "event_id": event_id,
            },
        )
        for s_id in event.refs.service_ids:
            falkor.query(
                graph_name,
                """
                MATCH (inc:Incident {id: $inc_id, org_id: $org_id})
                MATCH (s:Service {id: $s_id, org_id: $org_id})
                MERGE (inc)-[:AFFECTS {org_id: $org_id}]->(s)
                """,
                {"inc_id": inc_id, "s_id": s_id, "org_id": org_id},
            )

    # 6. Apply decision lifecycle transitions
    if decision_id:
        await apply_decision_lifecycle(
            decision_id=decision_id,
            event_kind=event_kind,
            event_id=event_id,
            event_ts=event_ts,
            supersedes_id=event.supersedes,
            reverses_id=event.reverses,
            org_id=org_id,
        )

    # 7. Compute derived weights (KNOWS_ABOUT)
    compute_derived_edges(org_id)

    return {"event_id": event_id, "status": "projected"}
