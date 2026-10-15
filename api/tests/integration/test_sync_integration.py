"""Integration tests for Phase 5: sync simulation, SSE events, runs tracing, and debug."""

import asyncio

import pytest
from httpx import AsyncClient
from scripts.seed import ensure_schema_indexes, seed_people_and_services

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.services.eventbus import get_eventbus
from nexus_api.services.sync_replayer import get_sync_replayer


@pytest.mark.asyncio
async def test_integration_7_sync_simulation_and_sse(async_client: AsyncClient) -> None:
    """Integration 7: /api/sync/simulate processes 50/50, emits sync.progress, second call -> 409."""
    falkor = get_falkor_client()
    falkor.reset_nexus_graphs()
    ensure_schema_indexes()
    seed_people_and_services()

    replayer = get_sync_replayer()
    eventbus = get_eventbus()

    # Track received SSE events from eventbus
    received_events: list[dict] = []

    async def listener() -> None:
        try:
            async for sse_msg in eventbus.subscribe():
                if "sync.progress" in sse_msg:
                    received_events.append({"raw": sse_msg})
        except asyncio.CancelledError:
            pass

    listen_task = asyncio.create_task(listener())

    # Start simulation with very fast interval (5ms) so test runs in ~500ms
    r1 = await async_client.post("/api/sync/simulate", json={"interval_ms": 5, "reset": False})
    assert r1.status_code == 200
    data1 = r1.json()
    assert data1["status"] == "started"
    run_id = data1["run_id"]
    assert run_id != ""

    # Second call while running -> 409 Conflict
    r2 = await async_client.post("/api/sync/simulate", json={"interval_ms": 5, "reset": False})
    assert r2.status_code == 409
    assert "already running" in r2.json()["detail"]

    # Wait for completion
    for _ in range(100):
        await asyncio.sleep(0.05)
        status = replayer.get_status()
        if status["state"] in ("completed", "failed", "cancelled"):
            break

    listen_task.cancel()
    await asyncio.gather(listen_task, return_exceptions=True)

    final_status = replayer.get_status()
    assert final_status["state"] == "completed"
    assert final_status["total"] == 50
    assert final_status["processed"] == 50

    # Verify status API returns completed
    r_status = await async_client.get("/api/sync/status")
    assert r_status.status_code == 200
    st_json = r_status.json()
    assert st_json["state"] == "completed"
    assert st_json["processed"] == 50
    assert st_json["total"] == 50

    # Verify we received sync.progress SSE messages
    assert len(received_events) > 0

    # Verify run tracing persisted
    r_run = await async_client.get(f"/api/runs/{run_id}")
    assert r_run.status_code == 200
    run_json = r_run.json()
    assert run_json["id"] == run_id
    assert run_json["status"] == "completed"


@pytest.mark.asyncio
async def test_debug_and_topology_endpoints(async_client: AsyncClient) -> None:
    """Verify /debug HTML page and /api/graph/topology endpoint."""
    # Debug console page
    r_debug = await async_client.get("/debug")
    assert r_debug.status_code == 200
    assert "NEXUS // Telemetry & Observability Console" in r_debug.text

    # Graph topology endpoint
    r_topo = await async_client.get("/api/graph/topology")
    assert r_topo.status_code == 200
    topo = r_topo.json()
    assert "nodes" in topo
    assert "links" in topo
    assert len(topo["nodes"]) > 0

    # Runs listing endpoint
    r_runs = await async_client.get("/api/runs")
    assert r_runs.status_code == 200
    runs = r_runs.json()
    assert isinstance(runs, list)
