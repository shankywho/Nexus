"""Integration test 4: Provenance badge payload for DEC-021."""

import pytest
from httpx import AsyncClient
from scripts.seed import ensure_schema_indexes, seed_events, seed_people_and_services

from nexus_api.adapters.falkor import get_falkor_client


@pytest.mark.asyncio
async def test_integration_4_provenance_badge_payload(
    async_client: AsyncClient,
) -> None:
    """Provenance badge payload for DEC-021 matches §1 exactly."""
    falkor = get_falkor_client()
    falkor.reset_nexus_graphs()
    ensure_schema_indexes()
    seed_people_and_services()
    await seed_events()

    # Query provenance for DEC-021
    res = await async_client.get("/api/provenance/DEC-021")
    assert res.status_code == 200
    data = res.json()

    assert data["decision_id"] == "DEC-021"
    assert data["status"] == "active"

    # Verify CURRENT SOURCE: ADR-042 via LIN-409
    current = data["current_sources"]
    assert len(current) > 0
    adr_source = next((s for s in current if "ADR-042" in s["id"]), None)
    assert adr_source is not None, "ADR-042 must be in current_sources"
    assert "2026-10-12" in (adr_source.get("date") or "")

    # Verify SUPERSEDED: #eng-backend Slack Thread (2026-09-18)
    superseded = data["superseded_sources"]
    assert len(superseded) > 0
    slack_source = next(
        (
            s
            for s in superseded
            if "slack" in s["id"].lower() or "1758172800" in s["id"]
        ),
        None,
    )
    assert slack_source is not None, "Sep 18 Slack thread must be in superseded_sources"
    assert "Invalidated" in (slack_source.get("reason") or "")
