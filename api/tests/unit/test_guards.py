"""Request guards and input limits. None of these reach FalkorDB."""

import pytest
from httpx import AsyncClient

from nexus_api.config import get_settings


@pytest.mark.asyncio
async def test_admin_routes_reject_missing_and_wrong_token(async_client: AsyncClient) -> None:
    for headers in ({}, {"X-Admin-Token": "nope"}):
        assert (await async_client.post("/api/admin/reset", headers=headers)).status_code == 403
        assert (await async_client.delete("/api/sources/evt-0001", headers=headers)).status_code == 403
        res = await async_client.post("/api/sync/simulate", json={"interval_ms": 5, "reset": True}, headers=headers)
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_ingest_requires_token_only_when_configured(
    async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "INGEST_TOKEN", "s3cret")
    assert (await async_client.post("/api/ingest/event", json={"id": "x"})).status_code == 401
    bad = await async_client.post("/api/ingest/event", json={"id": "x"}, headers={"X-Ingest-Token": "no"})
    assert bad.status_code == 401


@pytest.mark.asyncio
async def test_input_limits(async_client: AsyncClient) -> None:
    assert (await async_client.post("/api/ask", json={"question": "x"})).status_code == 422
    assert (await async_client.post("/api/ask", json={"question": "q" * 501})).status_code == 422
    assert (await async_client.get("/api/sources?limit=0")).status_code == 422
    assert (await async_client.get("/api/sources?limit=5000")).status_code == 422
