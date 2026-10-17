"""Integration tests for duplicate handling, malformed webhooks, and the core session timeline."""

import json
from pathlib import Path

import pytest
from httpx import AsyncClient
from scripts.seed import ensure_schema_indexes, seed_events, seed_people_and_services

from nexus_api.adapters.falkor import get_falkor_client


@pytest.mark.asyncio
async def test_integration_8_duplicate_event_id(async_client: AsyncClient) -> None:
    """Duplicate event id returns duplicate=True and node count is unchanged."""
    event_payload = {
        "id": "evt-int-dup-1",
        "org_id": "acme",
        "kind": "slack_message",
        "actor": "arjun",
        "text": "Testing duplicate endpoint handling",
        "refs": {"service_ids": ["auth-gateway"]},
    }

    # First post
    r1 = await async_client.post("/api/ingest/event", json=event_payload)
    assert r1.status_code == 200
    assert r1.json()["duplicate"] is False

    # Second post
    r2 = await async_client.post("/api/ingest/event", json=event_payload)
    assert r2.status_code == 200
    assert r2.json()["duplicate"] is True
    assert r2.json()["step"] == "duplicate_skipped"


@pytest.mark.asyncio
async def test_integration_9_malformed_webhook_returns_202(
    async_client: AsyncClient,
) -> None:
    """Malformed webhook returns 202, stored raw, without raising 500."""
    malformed = {"corrupted_payload": True, "garbage": 12345}
    r = await async_client.post("/api/ingest/event", json=malformed)
    assert r.status_code == 202
    data = r.json()
    assert data["status"] == "accepted"
    assert data["step"] == "rejected_shape"


@pytest.mark.asyncio
async def test_integration_2_and_3_core_session_timeline(
    async_client: AsyncClient,
) -> None:
    """Integration 2 & 3:
    - Seed --until 2026-09-30: Ask 'Where do we store user sessions?' -> contains Redis
    - Ingest remaining events: Ask 'Where do we store user sessions?' -> contains Postgres, with superseded_sources containing Sep 18 Slack thread.
    """
    falkor = get_falkor_client()
    falkor.reset_nexus_graphs()
    ensure_schema_indexes()
    seed_people_and_services()

    # Seed until 2026-09-30 (pre-October state)
    count_before = await seed_events(until="2026-09-30T23:59:59Z")
    assert count_before > 0

    # Ask the question before incident
    res_before = await async_client.post(
        "/api/ask", json={"question": "Where do we store user sessions?"}
    )
    assert res_before.status_code == 200
    data_before = res_before.json()
    assert "redis" in data_before["answer"].lower(), (
        f"Expected answer to contain Redis, got: {data_before['answer']}"
    )
    assert any("ADR-038" in s["id"] for s in data_before["current_sources"])

    # Ingest the remaining events (post 2026-09-30, includes INC-77, PR-1184, ADR-042)
    base_dir = Path(__file__).resolve().parent.parent.parent.parent
    events_file = base_dir / "fixtures/company/events.jsonl"
    with open(events_file, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            ev = json.loads(line)
            if ev.get("ts", "") > "2026-09-30T23:59:59Z":
                await async_client.post("/api/ingest/event", json=ev)

    # Ask the same question now
    res_after = await async_client.post(
        "/api/ask", json={"question": "Where do we store user sessions?"}
    )
    assert res_after.status_code == 200
    data_after = res_after.json()
    assert "postgres" in data_after["answer"].lower(), (
        f"Expected answer to contain Postgres, got: {data_after['answer']}"
    )
    # Current sources must cite ADR-042
    assert any("ADR-042" in s["id"] for s in data_after["current_sources"])
    # Superseded sources must contain the Sep 18 Slack thread
    assert any(
        "1758172800" in s["id"] or "slack" in s["id"].lower()
        for s in data_after["superseded_sources"]
    )
