"""Integration tests for Phase 3: the 4 Quick Audits."""

import pytest
from httpx import AsyncClient
from scripts.seed import ensure_schema_indexes, seed_events, seed_people_and_services

from nexus_api.adapters.falkor import get_falkor_client


@pytest.mark.asyncio
async def test_integration_5_and_6_audits(async_client: AsyncClient) -> None:
    """Verify all 4 Quick Audits return non-empty nodes, proper highlights, and superseded edges."""
    falkor = get_falkor_client()
    falkor.reset_nexus_graphs()
    ensure_schema_indexes()
    seed_people_and_services()
    await seed_events()  # Ingest all 50 events

    # 1. Who Owns What
    r1 = await async_client.post("/api/audits/who-owns-what")
    assert r1.status_code == 200
    d1 = r1.json()
    assert len(d1["nodes"]) > 0
    assert len(d1["edges"]) > 0
    assert "priya" in d1["highlight_ids"]
    assert "session-store" in d1["highlight_ids"]
    assert "kabir" in d1["highlight_ids"]
    assert "ledger" in d1["highlight_ids"]

    # 2. Decision Trace
    r2 = await async_client.post(
        "/api/audits/decision-trace", json={"decision_id": "DEC-021"}
    )
    assert r2.status_code == 200
    d2 = r2.json()
    assert len(d2["nodes"]) > 0
    assert "DEC-021" in d2["highlight_ids"]

    # 3. Stale Knowledge (Integration 6)
    r3 = await async_client.post("/api/audits/stale-knowledge")
    assert r3.status_code == 200
    d3 = r3.json()
    assert len(d3["nodes"]) > 0
    # Must highlight superseded decisions DEC-017 and DEC-024
    assert "DEC-017" in d3["highlight_ids"]
    assert "DEC-024" in d3["highlight_ids"]
    # Verify superseded edge exists
    superseded_edges = [e for e in d3["edges"] if e.get("status") == "superseded"]
    assert len(superseded_edges) > 0

    # 4. Bus Factor (Integration 5: bus-factor top for ledger = kabir)
    r4 = await async_client.post("/api/audits/bus-factor")
    assert r4.status_code == 200
    d4 = r4.json()
    assert len(d4["nodes"]) > 0
    assert len(d4["highlight_ids"]) > 0
    # Find kabir's node
    kabir_node = next((n for n in d4["nodes"] if n["id"] == "kabir"), None)
    assert kabir_node is not None, "Kabir must be present in bus-factor audit"
    expertise = kabir_node["properties"].get("expertise", [])
    ledger_exp = [exp for exp in expertise if exp.get("service") == "ledger"]
    assert len(ledger_exp) > 0, "Kabir must have expertise in ledger"
