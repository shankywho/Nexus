"""Ask agent service: router -> tools -> answerer -> validation -> provenance."""

import logging
import time
from pathlib import Path
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.adapters.llm import get_llm_client, llm_mode
from nexus_api.agents.router import route_question
from nexus_api.config import get_settings
from nexus_api.models.api import AskRequest, AskResponse, LLMAnswer, OwnerRef, SourceRef
from nexus_api.services.eventbus import get_eventbus
from nexus_api.services.graph_context import gather_context, tokens
from nexus_api.services.tracing import get_tracing_store

logger = logging.getLogger(__name__)


def validate_and_filter_sources(
    current_sources: list[SourceRef],
    superseded_sources: list[SourceRef],
    path: list[str],
    org_id: str = "acme",
    run_id: str = "",
    strict: bool = False,
) -> tuple[list[SourceRef], list[SourceRef], list[str], list[str]]:
    """Validate existence of sources in graph, drop hallucinated IDs, and enforce supersession rules.

    strict=True (used for model answers) drops every id that is not a node in the graph. The default
    also lets through anything that looks like a DEC-/ADR-/LIN-/PR-/INC- id, for the scripted answers.
    """
    settings = get_settings()
    falkor = get_falkor_client()
    tracing = get_tracing_store()

    # 1. Fetch all known IDs from nexus_company
    known_cypher = """
    MATCH (n {org_id: $org_id})
    RETURN coalesce(n.id, n.name) AS id
    """
    res_known = falkor.query(settings.GRAPH_COMPANY, known_cypher, {"org_id": org_id})
    known_ids: set[str] = set()
    if res_known and res_known.result_set:
        for row in res_known.result_set:
            if row[0]:
                known_ids.add(str(row[0]))

    # Also include temporal entities & episodic names
    res_temp = falkor.query(
        settings.GRAPH_TEMPORAL,
        "MATCH (e:Entity {group_id: $org_id}) RETURN e.name",
        {"org_id": org_id},
    )
    if res_temp and res_temp.result_set:
        for row in res_temp.result_set:
            if row[0]:
                known_ids.add(str(row[0]))

    # Add known hardcoded fixtures like SlackThread IDs or Doc IDs if present in graph
    res_sources = falkor.query(
        settings.GRAPH_COMPANY,
        "MATCH (se:SourceEvent {org_id: $org_id}) RETURN se.id",
        {"org_id": org_id},
    )
    if res_sources and res_sources.result_set:
        for row in res_sources.result_set:
            if row[0]:
                known_ids.add(str(row[0]))

    # 2. Fetch all superseded decision IDs and their linked source IDs
    superseded_cypher = """
    MATCH (d:Decision {status: 'superseded', org_id: $org_id})
    OPTIONAL MATCH (d)-[:DECIDED_IN|TRACKED_BY|DOCUMENTED_IN]->(src)
    RETURN d.id AS dec_id, src.id AS src_id
    """
    res_sup = falkor.query(
        settings.GRAPH_COMPANY, superseded_cypher, {"org_id": org_id}
    )
    superseded_dec_ids: set[str] = set()
    superseded_src_ids: set[str] = set()
    if res_sup and res_sup.result_set:
        for row in res_sup.result_set:
            if row[0]:
                superseded_dec_ids.add(str(row[0]))
            if row[1]:
                superseded_src_ids.add(str(row[1]))

    # 3. Check temporal invalid_at
    temp_inv_cypher = """
    MATCH (s:Entity)-[r:RELATES_TO]->(o:Entity)
    WHERE r.invalid_at IS NOT NULL
    RETURN r.episodes AS eps
    """
    res_inv = falkor.query(settings.GRAPH_TEMPORAL, temp_inv_cypher)
    invalid_episode_ids: set[str] = set()
    if res_inv and res_inv.result_set:
        for row in res_inv.result_set:
            eps = row[0]
            if isinstance(eps, list):
                invalid_episode_ids.update([str(x) for x in eps])

    # 4. Filter hallucinated IDs
    hallucinated_dropped: list[str] = []
    validated_current: list[SourceRef] = []
    validated_superseded: list[SourceRef] = []
    validated_path: list[str] = []

    for p_id in path:
        if (
            known_ids
            and p_id not in known_ids
            and (strict or not any(k in p_id for k in ("DEC-", "ADR-", "LIN-", "PR-", "INC-")))
        ):
            hallucinated_dropped.append(p_id)
        else:
            validated_path.append(p_id)

    for s in current_sources:
        # Check if hallucinated (unknown in graph)
        if (
            known_ids
            and s.id not in known_ids
            and (strict or not any(
                k in s.id
                for k in (
                    "ADR-",
                    "DEC-",
                    "LIN-",
                    "PR-",
                    "INC-",
                    "session-store",
                    "ledger",
                    "auth-gateway",
                    "fraud-scorer",
                    "slack:",
                )
            ))
        ):
            hallucinated_dropped.append(s.id)
            continue
        validated_current.append(s)

    for s in superseded_sources:
        if (
            known_ids
            and s.id not in known_ids
            and (strict or not any(
                k in s.id
                for k in (
                    "ADR-",
                    "DEC-",
                    "LIN-",
                    "PR-",
                    "INC-",
                    "session-store",
                    "ledger",
                    "auth-gateway",
                    "fraud-scorer",
                    "slack:",
                )
            ))
        ):
            hallucinated_dropped.append(s.id)
            continue
        validated_superseded.append(s)

    if hallucinated_dropped and run_id:
        tracing.record_step(
            run_id=run_id,
            node="hallucinated_id_dropped",
            latency_ms=1,
            status="dropped",
            output_preview=f"Dropped hallucinated IDs: {hallucinated_dropped}",
        )

    # 5. Enforce supersession rule: superseded items CAN NEVER be in current_sources
    clean_current: list[SourceRef] = []
    clean_superseded: list[SourceRef] = list(validated_superseded)
    filtered_superseded_ids: list[str] = []

    for s in validated_current:
        is_superseded = (
            s.id in superseded_dec_ids
            or s.id in superseded_src_ids
            or s.id in invalid_episode_ids
            or "DEC-017" in s.id
            or ("ADR-038" in s.id and "DEC-021" in known_ids)
        )
        if is_superseded:
            s.reason = s.reason or "Invalidated by superseding decision"
            if s.id not in {x.id for x in clean_superseded}:
                clean_superseded.append(s)
            filtered_superseded_ids.append(s.id)
        else:
            clean_current.append(s)

    return clean_current, clean_superseded, validated_path, hallucinated_dropped


def _short(text: object, limit: int = 60) -> str:
    """Clip to a word boundary with an ellipsis."""
    t = str(text)
    return t if len(t) <= limit else t[:limit].rsplit(" ", 1)[0] + "…"


def graph_fallback(question: str) -> tuple[str, list[SourceRef], list[SourceRef], list[str], list[OwnerRef]] | None:
    """Offline answer built directly from the graph for questions the scripted answers do not cover.

    Finds a service named in the question, reads the decisions that affect it, and states the live one
    while flagging the one it replaced. Returns None when the question names no service or decision.
    """
    context, _known = gather_context(question)
    q = question.lower()
    decisions = {d["id"]: d for d in context["decisions"]}

    def mentioned(svc: dict[str, Any]) -> bool:
        words = {str(svc["id"]).replace("-", " "), str(svc["name"]).lower()}
        words.update(w for w in str(svc["name"]).lower().replace("&", " ").split() if len(w) > 5)
        return any(w in q for w in words)

    svc_ids = [str(s["id"]) for s in context["services"] if mentioned(s)]
    related = [d for d in decisions.values() if d["id"].lower() in q or set(d["services"]) & set(svc_ids)]
    if not related:
        # no service or id named: match decisions by the words in their summary and source titles
        asked = tokens(question)

        def overlap(d: dict[str, Any]) -> int:
            text = " ".join([str(d["summary"])] + [str(x["title"]) for x in d["sources"]])
            return len(asked & tokens(text))

        scored = sorted(decisions.values(), key=overlap, reverse=True)
        if not scored or overlap(scored[0]) < 2:
            return None
        top = scored[0]
        chain = {top["id"], str(top["superseded_by"] or "")}
        chain |= {d["id"] for d in decisions.values() if d["superseded_by"] == top["id"]}
        related = [d for d in decisions.values() if d["id"] in chain]
    related.sort(key=lambda d: str(d["decided_at"]))
    live = [d for d in related if d["status"] == "active"]
    old = [d for d in related if d["status"] == "superseded"]

    def ref(d: dict[str, Any], reason: str | None = None) -> SourceRef:
        src = max(d["sources"], key=lambda x: str(x["date"]), default=None)
        return SourceRef(
            id=str(src["id"]) if src else str(d["id"]),
            label=f"{d['id']}: {str(d['summary'])[:70]}",
            date=str(d["decided_at"])[:10],
            reason=reason,
        )

    parts = [f"{d['id']} is the current decision: {d['summary']}" for d in live]
    parts += [f"{d['id']} was superseded by {d['superseded_by']}: {d['summary']}" for d in old]
    owners = [
        OwnerRef(person=p["id"], role=f"{p['relation']} {s['id']}")
        for s in context["services"]
        if s["id"] in svc_ids
        for p in s["people"]
    ]
    return (
        " ".join(parts),
        [ref(d) for d in live],
        [ref(d, f"Replaced by {d['superseded_by']}") for d in old],
        [str(d["id"]) for d in related],
        owners,
    )


_ANSWER_PROMPT = (Path(__file__).resolve().parent.parent / "agents" / "prompts" / "answer.md").read_text()


async def _live_answer(question: str, as_of: str | None) -> tuple[LLMAnswer, bool, str]:
    """Answer from graph context with the configured model. Returns (answer, degraded, model name)."""
    import json

    context, _known = gather_context(question)
    user = json.dumps({"question": question, "as_of": as_of, "graph_context": context}, default=str)
    llm = get_llm_client()
    answer, degraded = await llm.generate_json(_ANSWER_PROMPT, user, LLMAnswer)
    return answer, degraded, str(getattr(llm, "model", llm_mode()))


async def answer_question(request: AskRequest | str) -> AskResponse:
    """Execute Ask workflow with full provenance and temporal validation."""
    if isinstance(request, str):
        request = AskRequest(question=request)
    settings = get_settings()
    falkor = get_falkor_client()
    tracing = get_tracing_store()
    eventbus = get_eventbus()
    org_id = settings.NEXUS_ORG_ID

    start_t = time.time()
    run_id = tracing.start_run(kind="ask", input_data={"question": request.question})

    # 1. Router Step
    router_output = route_question(request.question)
    tracing.record_step(
        run_id=run_id,
        node="router",
        latency_ms=int((time.time() - start_t) * 1000),
        status="ok",
        input_preview=request.question,
        output_preview=f"intents={router_output.intents}, entities={router_output.entities}",
    )
    await eventbus.publish(
        "ask.step",
        {"run_id": run_id, "step": "router", "output": router_output.model_dump()},
    )

    q_lower = request.question.lower()

    # 2. Check Decision State in Graph
    check_decisions_cypher = """
    MATCH (d:Decision {org_id: $org_id})
    RETURN d.id AS id, d.status AS status, d.title AS title
    """
    res_dec = falkor.query(
        settings.GRAPH_COMPANY, check_decisions_cypher, {"org_id": org_id}
    )
    active_dec_ids = set()
    superseded_dec_ids = set()
    if res_dec and res_dec.result_set:
        for row in res_dec.result_set:
            if row[1] == "active":
                active_dec_ids.add(row[0])
            elif row[1] == "superseded":
                superseded_dec_ids.add(row[0])

    # 3. Answer generation: Claude over graph context when a key is configured, scripted demo answers otherwise
    answer_text = ""
    current_sources: list[SourceRef] = []
    superseded_sources: list[SourceRef] = []
    owners: list[OwnerRef] = []
    path: list[str] = []
    confidence = 0.95
    mode = "scripted"
    model_name: str | None = None
    degraded = False

    live: LLMAnswer | None = None
    if llm_mode() != "scripted":
        t0 = time.time()
        try:
            live, degraded, model_name = await _live_answer(request.question, request.as_of)
            tracing.record_step(
                run_id=run_id,
                node="llm",
                latency_ms=int((time.time() - t0) * 1000),
                status="degraded" if degraded else "ok",
                input_preview=request.question,
                output_preview=live.answer[:300],
            )
            if degraded or not live.answer.strip():
                live = None
            else:
                mode = llm_mode()
        except Exception as exc:  # network, auth or quota errors: fall back, but say so
            logger.error("Live answer failed, using scripted answer: %s", exc)
            degraded = True
            live = None

    if live is not None:
        answer_text = live.answer
        current_sources = live.current_sources
        superseded_sources = live.superseded_sources
        owners = live.owners
        path = live.path
        confidence = max(0.0, min(1.0, live.confidence))
    else:
        if "who owns" in q_lower and "session" in q_lower:
            answer_text = "Priya Sharma (Principal Systems Engineer, Platform Infrastructure) maintains and owns the session-store service."
            current_sources = [SourceRef(id="session-store", label="Service session-store")]
            owners = [OwnerRef(person="priya", role="MAINTAINS session-store")]

        elif "why did we stop using redis" in q_lower or (
            "redis" in q_lower and "stop" in q_lower
        ):
            answer_text = "We stopped using Redis for sessions following Incident INC-77, where memory pressure triggered volatile-lru eviction dropping 12% of sessions. Emergency PR #1184 reverted sessions to Postgres."
            current_sources = [
                SourceRef(id="INC-77", label="Incident INC-77", date="2026-10-02"),
                SourceRef(
                    id="PR-1184",
                    label="PR-1184 Revert session store to Postgres",
                    date="2026-10-02",
                ),
                SourceRef(id="ADR-042", label="ADR-042", date="2026-10-12"),
            ]
            superseded_sources = [
                SourceRef(
                    id="ADR-038",
                    label="ADR-038 Store user sessions in Redis",
                    date="2026-09-22",
                    reason="Invalidated by INC-77 & PR-1184",
                )
            ]
            path = ["INC-77", "PR-1184", "ADR-042"]
            owners = [OwnerRef(person="priya", role="Principal Systems Engineer")]

        elif "what changed about sessions" in q_lower:
            answer_text = "In September, sessions were moved from Postgres to Redis (DEC-017 / ADR-038). In October, following eviction incident INC-77, PR-1184 and ADR-042 returned sessions back to Postgres."
            current_sources = [SourceRef(id="ADR-042", label="ADR-042 (2026-10-12)")]
            superseded_sources = [
                SourceRef(
                    id="ADR-038",
                    label="ADR-038 (2026-09-22)",
                    reason="Superseded by ADR-042",
                )
            ]

        elif "session" in q_lower or "sessions" in q_lower:
            if "DEC-021" in active_dec_ids:
                answer_text = "Sessions are stored in Postgres. ADR-042 (2026-10-12) reverted the Redis move after INC-77 eviction dropped sessions."
                current_sources = [
                    SourceRef(
                        id="ADR-042",
                        label="ADR-042 (2026-10-12)",
                        date="2026-10-12",
                        via="LIN-409",
                    )
                ]
                superseded_sources = [
                    SourceRef(
                        id="slack:eng-backend:1758172800",
                        label="#eng-backend Slack Thread (2026-09-18)",
                        date="2026-09-18",
                        reason="Invalidated by DEC-021",
                    )
                ]
                path = ["DEC-021", "ADR-042", "LIN-409", "PR-1184"]
                owners = [OwnerRef(person="priya", role="MAINTAINS session-store")]
                confidence = 0.92
            else:
                answer_text = "User sessions are stored in Redis per DEC-017 and ADR-038."
                current_sources = [
                    SourceRef(
                        id="ADR-038", label="ADR-038", date="2026-09-22", via="LIN-391"
                    )
                ]
                superseded_sources = []
                path = ["DEC-017", "ADR-038", "LIN-391"]
                owners = [OwnerRef(person="arjun", role="MAINTAINS session-store")]
                confidence = 0.90

        elif "ledger" in q_lower and ("who" in q_lower or "knows" in q_lower):
            answer_text = "Kabir Rao is the sole maintainer and domain expert for the Core Banking Ledger (bus factor = 1)."
            current_sources = [SourceRef(id="ledger", label="Service ledger")]
            owners = [
                OwnerRef(person="kabir", role="Staff Ledger Architect (MAINTAINS ledger)")
            ]

        elif "fraud" in q_lower:
            answer_text = "The current fraud scoring model decision is DEC-026 (ADR-045), deploying a real-time XGBoost ML model to evaluate payment risk."
            current_sources = [
                SourceRef(
                    id="DEC-026",
                    label="ADR-045 Real-time XGBoost ML Model",
                    date="2026-10-07",
                )
            ]
            superseded_sources = [
                SourceRef(
                    id="DEC-024",
                    label="ADR-035 Heuristic Rules",
                    date="2026-09-20",
                    reason="Invalidated by DEC-026",
                )
            ]
            path = ["DEC-026", "ADR-045", "PR-1192"]
            owners = [OwnerRef(person="ananya", role="MAINTAINS fraud-scorer")]

        elif "superseded this quarter" in q_lower or "superseded" in q_lower:
            ctx_all, _ = gather_context(request.question)
            dead = [d for d in ctx_all["decisions"] if d["status"] == "superseded"]
            answer_text = f"{len(dead)} decisions were superseded: " + "; ".join(
                f"{d['id']} ({_short(d['summary'])}) was replaced by {d['superseded_by']}" for d in dead
            )
            current_sources = [
                SourceRef(id=str(d["superseded_by"]), label=f"{d['superseded_by']} replaces {d['id']}") for d in dead
            ]
            superseded_sources = [
                SourceRef(id=str(d["id"]), label=f"{d['id']} {_short(d['summary'], 50)}", reason=f"Replaced by {d['superseded_by']}")
                for d in dead
            ]

        elif "trace the decision behind pr-1184" in q_lower or "pr-1184" in q_lower:
            answer_text = "PR-1184 was triggered by incident INC-77 and reversed decision DEC-017 (which originated in LIN-391 and ADR-038)."
            current_sources = [
                SourceRef(id="PR-1184", label="PR #1184 Revert session store to Postgres"),
                SourceRef(id="INC-77", label="Incident INC-77"),
            ]
            superseded_sources = [
                SourceRef(
                    id="DEC-017",
                    label="DEC-017 Move session store to Redis",
                    reason="Reversed by PR-1184",
                )
            ]
            path = ["DEC-017", "LIN-391", "INC-77", "PR-1184"]

        elif "is adr-038 still valid" in q_lower or "adr-038" in q_lower:
            if "DEC-021" in active_dec_ids:
                answer_text = "No, ADR-038 is superseded by ADR-042. Sessions reside in Postgres permanently."
                current_sources = [SourceRef(id="ADR-042", label="ADR-042")]
                superseded_sources = [
                    SourceRef(id="ADR-038", label="ADR-038", reason="Superseded by ADR-042")
                ]
            else:
                answer_text = "ADR-038 is currently active."
                current_sources = [SourceRef(id="ADR-038", label="ADR-038")]

        elif "auth-gateway" in q_lower:
            answer_text = "Changes to auth-gateway should be reviewed by Arjun Mehta and Vikram Desai, who maintain the service."
            current_sources = [SourceRef(id="auth-gateway", label="Service auth-gateway")]
            owners = [
                OwnerRef(person="arjun", role="MAINTAINS auth-gateway"),
                OwnerRef(person="vikram", role="MAINTAINS auth-gateway"),
            ]

        elif "what changed about sessions" in q_lower:
            answer_text = "In September, sessions were moved from Postgres to Redis (DEC-017 / ADR-038). In October, following eviction incident INC-77, PR-1184 and ADR-042 returned sessions back to Postgres."
            current_sources = [SourceRef(id="ADR-042", label="ADR-042 (2026-10-12)")]
            superseded_sources = [
                SourceRef(
                    id="ADR-038",
                    label="ADR-038 (2026-09-22)",
                    reason="Superseded by ADR-042",
                )
            ]

        else:
            fallback = graph_fallback(request.question)
            if fallback is not None:
                answer_text, current_sources, superseded_sources, path, owners = fallback
                confidence = 0.8
            else:
                answer_text = (
                    "The graph has nothing that matches this question. "
                    "Try naming a service, a decision id such as DEC-021, or an incident."
                )
                confidence = 0.3


    # 4. Strict validation: Drop hallucinated IDs and strip superseded sources from current_sources
    clean_curr, clean_super, clean_path, _hallucinated = validate_and_filter_sources(
        current_sources=current_sources,
        superseded_sources=superseded_sources,
        path=path,
        org_id=org_id,
        run_id=run_id,
        strict=mode != "scripted",
    )

    if not clean_curr and confidence < 0.6:
        confidence = 0.3
        answer_text = f"Low confidence: {answer_text}"

    latency_ms = int((time.time() - start_t) * 1000)
    tracing.record_step(
        run_id=run_id,
        node="answerer",
        latency_ms=latency_ms,
        status="ok",
        output_preview=answer_text[:300],
    )
    tracing.end_run(run_id, status="completed")

    await eventbus.publish(
        "ask.completed",
        {"run_id": run_id, "question": request.question, "confidence": confidence},
    )

    return AskResponse(
        answer=answer_text,
        current_sources=clean_curr,
        superseded_sources=clean_super,
        path=clean_path,
        owners=owners,
        confidence=confidence,
        degraded=degraded,
        run_id=run_id,
        mode=mode,
        model=model_name,
    )
