"""Integration test for /health endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_reports_up_and_mock(async_client: AsyncClient) -> None:
    """Verify /health reports falkordb: up and mock: true."""
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["falkordb"] == "up"
    assert data["mock"] is True
    assert "graphs" in data
    assert "company" in data["graphs"]
    assert "temporal" in data["graphs"]
    assert "docs" in data["graphs"]
