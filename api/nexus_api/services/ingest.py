"""Ingest pipeline orchestrator per §9a."""

import asyncio
import json
import logging
import time
from datetime import UTC, datetime
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.adapters.temporal import get_temporal_graph
from nexus_api.config import get_settings
from nexus_api.models.events import IngestResult, SourceEventIn
from nexus_api.services.eventbus import get_eventbus
from nexus_api.services.projector import project_event
from nexus_api.services.tracing import get_tracing_store

logger = logging.getLogger(__name__)


async def ingest_source_event(payload: dict[str, Any]) -> tuple[IngestResult, int]:
    """Ingest a single SourceEvent through the full pipeline. Returns (result, http_status_code)."""
    settings = get_settings()
    falkor = get_falkor_client()
    tracing = get_tracing_store()
    eventbus = get_eventbus()
    temporal = get_temporal_graph()

    start_t = time.time()
    now_iso = datetime.now(UTC).isoformat()
    run_id = tracing.start_run(kind="ingest", input_data=payload)

    # 1. Validation (tolerant)
    try:
        event = SourceEventIn.model_validate(payload)
    except Exception as exc:
        logger.warning("Event validation failed, storing raw: %s", exc)
        raw_id = payload.get("id") or f"err_{int(time.time() * 1000)}"
        falkor.query(
            settings.GRAPH_COMPANY,
            """
            MERGE (se:SourceEvent {id: $id, org_id: $org_id})
            SET se.raw_json = $raw_json,
                se.rejected = true,
                se.ingested_at = $ingested_at
            """,
            {
                "id": raw_id,
                "org_id": settings.NEXUS_ORG_ID,
                "raw_json": json.dumps(payload),
                "ingested_at": now_iso,
            },
        )
        tracing.record_step(
            run_id=run_id,
            node="validate",
            latency_ms=int((time.time() - start_t) * 1000),
            status="rejected_shape",
            input_preview=str(payload)[:300],
            output_preview="Stored raw in SourceEvent with rejected=true",
        )
        tracing.end_run(run_id, status="accepted_degraded")
        return (
            IngestResult(
                status="accepted",
                event_id=raw_id,
                duplicate=False,
                run_id=run_id,
                step="rejected_shape",
                error=str(exc),
            ),
            202,
        )

    # Check if payload is completely empty garbage or invalid shape
    is_garbage = not event.id and not event.text and not event.kind and not event.actor
    # Also if payload was just arbitrary non-event fields like {"corrupted_payload": True}
    if is_garbage or (not event.id and not event.kind and not event.text):
        raw_id = f"err_{int(time.time() * 1000)}"
        falkor.query(
            settings.GRAPH_COMPANY,
            """
            MERGE (se:SourceEvent {id: $id, org_id: $org_id})
            SET se.raw_json = $raw_json,
                se.rejected = true,
                se.ingested_at = $ingested_at
            """,
            {
                "id": raw_id,
                "org_id": settings.NEXUS_ORG_ID,
                "raw_json": json.dumps(payload),
                "ingested_at": now_iso,
            },
        )
        tracing.end_run(run_id, status="accepted_degraded")
        return (
            IngestResult(
                status="accepted",
                event_id=raw_id,
                duplicate=False,
                run_id=run_id,
                step="rejected_shape",
                error="Payload lacked minimal identifiable event fields",
            ),
            202,
        )

    event_id = event.id or f"evt_{int(time.time() * 1000)}"
    event.id = event_id
    org_id = event.org_id or settings.NEXUS_ORG_ID

    # 2. Idempotency check on event.id
    check_cypher = "MATCH (se:SourceEvent {id: $id, org_id: $org_id}) RETURN se.id"
    res = falkor.query(
        settings.GRAPH_COMPANY, check_cypher, {"id": event_id, "org_id": org_id}
    )
    if res and res.result_set and len(res.result_set) > 0:
        tracing.record_step(
            run_id=run_id,
            node="idempotency",
            latency_ms=int((time.time() - start_t) * 1000),
            status="duplicate",
            input_preview=f"event_id={event_id}",
            output_preview="Duplicate event id detected, skipped replay",
        )
        tracing.end_run(run_id, status="duplicate")
        return (
            IngestResult(
                status="ok",
                event_id=event_id,
                duplicate=True,
                run_id=run_id,
                step="duplicate_skipped",
            ),
            200,
        )

    await eventbus.publish(
        "ingest.received", {"event_id": event_id, "kind": event.kind, "run_id": run_id}
    )

    # 3. Concurrent Projector + Temporal ingestion
    async def run_temporal() -> str | None:
        facts_dicts = [f.model_dump() for f in event.facts] if event.facts else []
        ep_uuid = await temporal.add_episode(
            name=f"Episode {event_id}",
            body=event.text or f"Event {event_id}",
            source_description=f"{event.kind} via {event.channel or 'direct'}",
            reference_time=event.ts or now_iso,
            group_id=org_id,
            facts=facts_dicts,
        )
        falkor.query(
            settings.GRAPH_COMPANY,
            """
            MATCH (se:SourceEvent {id: $id, org_id: $org_id})
            SET se.episode_uuid = $ep_uuid
            """,
            {"id": event_id, "org_id": org_id, "ep_uuid": ep_uuid},
        )
        await eventbus.publish(
            "temporal.episode_added", {"event_id": event_id, "episode_uuid": ep_uuid}
        )
        return ep_uuid

    project_task = asyncio.create_task(project_event(event))
    temporal_task = asyncio.create_task(run_temporal())

    proj_res, temp_res = await asyncio.gather(
        project_task, temporal_task, return_exceptions=True
    )

    if isinstance(proj_res, Exception):
        logger.error("Projector failed for %s: %s", event_id, proj_res)
        tracing.record_step(
            run_id=run_id,
            node="projector",
            latency_ms=int((time.time() - start_t) * 1000),
            status="error",
            output_preview=str(proj_res),
        )
        tracing.end_run(run_id, status="error", error=str(proj_res))
        raise proj_res

    if isinstance(temp_res, Exception):
        logger.warning("Temporal ingest failed for %s: %s", event_id, temp_res)
        falkor.query(
            settings.GRAPH_COMPANY,
            """
            MATCH (se:SourceEvent {id: $id, org_id: $org_id})
            SET se.temporal_status = 'failed'
            """,
            {"id": event_id, "org_id": org_id},
        )
        await eventbus.publish(
            "step.error", {"event_id": event_id, "error": str(temp_res)}
        )

    # Emit ingest.projected and graph.delta
    await eventbus.publish(
        "ingest.projected",
        {"event_id": event_id, "run_id": run_id, "kind": event.kind},
    )
    await eventbus.publish(
        "graph.delta",
        {"added_nodes": [event_id], "source": event.kind},
    )

    latency_ms = int((time.time() - start_t) * 1000)
    tracing.record_step(
        run_id=run_id,
        node="ingest_pipeline",
        latency_ms=latency_ms,
        status="completed",
        input_preview=str(payload)[:300],
        output_preview=f"Projected {event_id} in {latency_ms}ms",
    )
    tracing.end_run(run_id, status="completed")

    return (
        IngestResult(
            status="ok",
            event_id=event_id,
            duplicate=False,
            run_id=run_id,
            step="completed",
        ),
        200,
    )
