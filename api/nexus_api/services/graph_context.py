"""Collect the slice of the company graph a question needs, as plain data a language model can read."""

import json
import re
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings

_STOP = {
    "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are", "was", "were", "do", "does",
    "did", "we", "our", "us", "what", "why", "who", "how", "when", "where", "which", "that", "this", "it",
    "with", "about", "from", "by", "at", "be", "as", "any", "still", "now", "use", "using",
}

MAX_EVENTS = 18


def tokens(text: str) -> set[str]:
    """Lowercase word tokens without stop words, keeping ids such as DEC-021 or INC-77 whole."""
    return {t for t in re.findall(r"[a-z0-9][a-z0-9\-_.]*", text.lower()) if t not in _STOP and len(t) > 1}


def rank_events(question: str, events: list[dict[str, Any]], limit: int = MAX_EVENTS) -> list[dict[str, Any]]:
    """Pick the source events that best match the question, newest first among equals."""
    q = tokens(question)

    def score(e: dict[str, Any]) -> int:
        refs = e.get("refs") or {}
        ref_ids = " ".join(str(v) for v in refs.values() if isinstance(v, str)) + " " + " ".join(
            str(x) for x in refs.get("service_ids") or []
        )
        hay = tokens(f"{e.get('text', '')} {ref_ids} {e.get('actor', '')} {e.get('channel', '')}")
        return len(q & hay)

    scored = sorted(events, key=lambda e: (score(e), str(e.get("ts", ""))), reverse=True)
    return [e for e in scored if score(e) > 0][:limit] or sorted(events, key=lambda e: str(e.get("ts", "")), reverse=True)[:8]


def _rows(graph: str, cypher: str, params: dict[str, Any]) -> list[list[Any]]:
    res = get_falkor_client().query(graph, cypher, params)
    return list(res.result_set) if res and res.result_set else []


def gather_context(question: str) -> tuple[dict[str, Any], set[str]]:
    """Return (context, known_ids). Everything in context comes straight from FalkorDB."""
    settings = get_settings()
    g = settings.GRAPH_COMPANY
    org = {"org_id": settings.NEXUS_ORG_ID}
    known: set[str] = set()

    decisions: dict[str, dict[str, Any]] = {}
    for did, status, summary, decided, sup_by, sup_at in _rows(
        g,
        "MATCH (d:Decision {org_id:$org_id}) RETURN d.id, d.status, d.summary, d.decided_at, d.superseded_by, d.superseded_at",
        org,
    ):
        decisions[did] = {
            "id": did, "status": status, "summary": summary, "decided_at": decided,
            "superseded_by": sup_by, "superseded_at": sup_at, "services": [], "sources": [],
        }
        known.add(did)
    for did, sid in _rows(g, "MATCH (d:Decision {org_id:$org_id})-[:AFFECTS]->(s:Service) RETURN d.id, s.id", org):
        if did in decisions and sid not in decisions[did]["services"]:
            decisions[did]["services"].append(sid)
    for did, sid, title, kind, created in _rows(
        g,
        "MATCH (d:Decision {org_id:$org_id})-[:DECIDED_IN|DOCUMENTED_IN|TRACKED_BY]->(x) "
        "RETURN d.id, x.id, coalesce(x.title, x.summary, x.id), coalesce(x.kind, x.system, ''), coalesce(x.created_at, x.merged_at, '')",
        org,
    ):
        if did in decisions:
            decisions[did]["sources"].append({"id": sid, "title": str(title)[:160], "kind": kind, "date": str(created)[:10]})
            known.add(sid)

    services: dict[str, dict[str, Any]] = {}
    for sid, name, tier, team in _rows(
        g, "MATCH (s:Service {org_id:$org_id}) RETURN s.id, s.name, s.tier, s.team_id", org
    ):
        services[sid] = {"id": sid, "name": name, "tier": tier, "team": team, "people": []}
        known.add(sid)
    for pid, pname, role, rel, sid in _rows(
        g,
        "MATCH (p:Person {org_id:$org_id})-[r:OWNS|MAINTAINS]->(s:Service) RETURN p.id, p.name, p.role, type(r), s.id",
        org,
    ):
        if sid in services:
            services[sid]["people"].append({"id": pid, "name": pname, "role": role, "relation": rel})
        known.add(pid)

    incidents = [
        {"id": i, "summary": s, "severity": sev, "started_at": at}
        for i, s, sev, at in _rows(
            g, "MATCH (i:Incident {org_id:$org_id}) RETURN i.id, i.summary, i.severity, i.started_at", org
        )
    ]
    known.update(i["id"] for i in incidents)

    events: list[dict[str, Any]] = []
    for (raw,) in _rows(g, "MATCH (e:SourceEvent {org_id:$org_id}) RETURN e.raw_json", org):
        try:
            events.append(json.loads(raw))
        except (TypeError, ValueError):
            continue
    picked = rank_events(question, events)
    for e in events:
        known.add(str(e.get("id")))
        refs = e.get("refs") or {}
        known.update(str(v) for v in refs.values() if isinstance(v, str))
        if e.get("thread_id"):
            known.add(str(e["thread_id"]))

    context = {
        "decisions": list(decisions.values()),
        "services": list(services.values()),
        "incidents": incidents,
        "relevant_events": [
            {
                "id": e.get("id"), "kind": e.get("kind"), "ts": e.get("ts"), "actor": e.get("actor"),
                "channel": e.get("channel"), "thread_id": e.get("thread_id"), "text": e.get("text"),
                "refs": {k: v for k, v in (e.get("refs") or {}).items() if v},
                "supersedes": e.get("supersedes"), "reverses": e.get("reverses"),
            }
            for e in sorted(picked, key=lambda e: str(e.get("ts", "")))
        ],
    }
    return context, known
