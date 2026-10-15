"""Unit tests for Phase 4: ask agent, superseded filtering, and hallucination dropping."""

import pytest
from scripts.seed import ensure_schema_indexes, seed_events, seed_people_and_services

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.models.api import SourceRef
from nexus_api.services.ask_agent import validate_and_filter_sources


@pytest.mark.asyncio
async def test_superseded_never_current() -> None:
    """Verify answerer validation strips superseded sources from current_sources even if put there."""
    falkor = get_falkor_client()
    falkor.reset_nexus_graphs()
    ensure_schema_indexes()
    seed_people_and_services()
    await seed_events()  # DEC-017 is superseded by DEC-021

    # Deliberately place a superseded source in current_sources
    rogue_current = [
        SourceRef(id="ADR-038", label="ADR-038 (Superseded)", date="2026-09-22"),
        SourceRef(id="ADR-042", label="ADR-042 (Active)", date="2026-10-12"),
    ]
    superseded = [
        SourceRef(
            id="slack:eng-backend:1758172800",
            label="#eng-backend Slack Thread",
            date="2026-09-18",
        )
    ]

    clean_curr, clean_super, _clean_path, _dropped = validate_and_filter_sources(
        current_sources=rogue_current,
        superseded_sources=superseded,
        path=["DEC-021", "ADR-042"],
        org_id="acme",
    )

    curr_ids = [s.id for s in clean_curr]
    assert "ADR-042" in curr_ids
    assert "ADR-038" not in curr_ids, "ADR-038 must NOT be in current_sources"
    super_ids = [s.id for s in clean_super]
    assert "ADR-038" in super_ids, "ADR-038 must be relocated to superseded_sources"


@pytest.mark.asyncio
async def test_hallucinated_ids_dropped() -> None:
    """Verify unknown hallucinated IDs are dropped from sources and paths."""
    falkor = get_falkor_client()
    falkor.reset_nexus_graphs()
    ensure_schema_indexes()
    seed_people_and_services()

    # Sources containing hallucinated IDs
    sources = [
        SourceRef(id="ADR-042", label="ADR-042", date="2026-10-12"),
        SourceRef(id="FAKE-DOC-9999", label="Hallucinated Document", date="2026-10-12"),
    ]
    path = ["session-store", "FAKE-ENTITY-8888"]

    clean_curr, _clean_super, clean_path, dropped = validate_and_filter_sources(
        current_sources=sources,
        superseded_sources=[],
        path=path,
        org_id="acme",
    )

    curr_ids = [s.id for s in clean_curr]
    assert "ADR-042" in curr_ids
    assert "FAKE-DOC-9999" not in curr_ids
    assert "FAKE-ENTITY-8888" not in clean_path
    assert "FAKE-DOC-9999" in dropped or "FAKE-ENTITY-8888" in dropped
