"""Pytest fixtures for NEXUS tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from nexus_api.main import app


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def async_client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
