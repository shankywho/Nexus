"""Unit tests for tolerant parsing, idempotency, supersession, router, temporal schema."""

import pytest

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.adapters.temporal import MockTemporal
from nexus_api.agents.router import route_question
from nexus_api.config import get_settings
from nexus_api.models.events import SourceEventIn
from nexus_api.services.ingest import ingest_source_event


def test_event_parsing_tolerant() -> None:
    """Verify unknown fields are preserved and missing optional refs are fine."""
    payload = {
        "id": "evt-custom-99",
        "org_id": "acme",
        "kind": "slack_message",
        "actor": "arjun",
        "text": "Testing tolerant parser with extra metadata",
        "unknown_extra_metadata": {"foo": "bar", "score": 42},
        "refs": {"service_ids": ["session-store"]},
    }
    event = SourceEventIn.model_validate(payload)
    assert event.id == "evt-custom-99"
    assert getattr(event, "unknown_extra_metadata", None) == {"foo": "bar", "score": 42}
    assert event.refs.service_ids == ["session-store"]
    assert event.refs.decision_id is None


@pytest.mark.asyncio
async def test_garbage_payload_returns_202_accepted() -> None:
    """Garbage payload produces 202 rejected_shape without raising 500."""
    garbage = {}  # completely empty garbage
    result, code = await ingest_source_event(garbage)
    assert code == 202
    assert result.status == "accepted"
    assert result.step == "rejected_shape"


@pytest.mark.asyncio
async def test_projector_idempotent() -> None:
    """Same event twice produces duplicate=True on the second run and node count unchanged."""
    falkor = get_falkor_client()
    settings = get_settings()
    event_payload = {
        "id": "evt-idempotent-test",
        "org_id": "acme",
        "kind": "slack_message",
        "actor": "arjun",
        "text": "Idempotency test event",
        "refs": {"service_ids": ["session-store"]},
    }

    # First ingest
    res1, code1 = await ingest_source_event(event_payload)
    assert code1 == 200
    assert res1.duplicate is False

    count_after_first = falkor.count_nodes(settings.GRAPH_COMPANY)

    # Second ingest of exact same event
    res2, code2 = await ingest_source_event(event_payload)
    assert code2 == 200
    assert res2.duplicate is True
    assert res2.step == "duplicate_skipped"

    count_after_second = falkor.count_nodes(settings.GRAPH_COMPANY)
    assert count_after_first == count_after_second


@pytest.mark.asyncio
async def test_supersession_flow() -> None:
    """DEC-017 active -> PR-1184 reverses (contested) -> ADR-042 supersedes, so status and edge statuses all flip."""
    falkor = get_falkor_client()
    settings = get_settings()

    # 1. Propose and activate DEC-TEST-01
    evt1 = {
        "id": "evt-sup-1",
        "org_id": "acme",
        "kind": "linear_ticket",
        "ts": "2026-09-19T00:00:00Z",
        "actor": "arjun",
        "text": "Activate DEC-TEST-01",
        "refs": {
            "service_ids": ["session-store"],
            "decision_id": "DEC-TEST-01",
            "ticket_id": "LIN-TEST-1",
        },
    }
    await ingest_source_event(evt1)

    # Verify DEC-TEST-01 is active
    q1 = falkor.query(
        settings.GRAPH_COMPANY,
        "MATCH (d:Decision {id: 'DEC-TEST-01'}) RETURN d.status",
    )
    assert q1.result_set[0][0] == "active"

    # 2. PR reverses DEC-TEST-01
    evt2 = {
        "id": "evt-sup-2",
        "org_id": "acme",
        "kind": "github_pr",
        "ts": "2026-10-02T00:00:00Z",
        "actor": "priya",
        "text": "Reverses DEC-TEST-01",
        "refs": {
            "service_ids": ["session-store"],
            "decision_id": "DEC-TEST-01",
            "pr_id": "PR-TEST-1",
        },
        "reverses": "DEC-TEST-01",
    }
    await ingest_source_event(evt2)

    # Verify contested
    q2 = falkor.query(
        settings.GRAPH_COMPANY,
        "MATCH (d:Decision {id: 'DEC-TEST-01'}) RETURN d.contested",
    )
    assert q2.result_set[0][0] is True

    # 3. New ADR-TEST-2 supersedes DEC-TEST-01 with DEC-TEST-02
    evt3 = {
        "id": "evt-sup-3",
        "org_id": "acme",
        "kind": "adr",
        "ts": "2026-10-12T00:00:00Z",
        "actor": "priya",
        "text": "Ratify DEC-TEST-02 superseding DEC-TEST-01",
        "refs": {
            "service_ids": ["session-store"],
            "decision_id": "DEC-TEST-02",
            "doc_id": "ADR-TEST-2",
        },
        "supersedes": "DEC-TEST-01",
    }
    await ingest_source_event(evt3)

    # Verify DEC-TEST-01 is now superseded and DEC-TEST-02 is active
    q3 = falkor.query(
        settings.GRAPH_COMPANY,
        "MATCH (old:Decision {id: 'DEC-TEST-01'}), (new:Decision {id: 'DEC-TEST-02'}) RETURN old.status, new.status",
    )
    assert q3.result_set[0][0] == "superseded"
    assert q3.result_set[0][1] == "active"

    # Verify SUPERSEDES edge exists
    q4 = falkor.query(
        settings.GRAPH_COMPANY,
        "MATCH (new:Decision {id: 'DEC-TEST-02'})-[s:SUPERSEDES]->(old:Decision {id: 'DEC-TEST-01'}) RETURN s.at",
    )
    assert len(q4.result_set) == 1


def test_router_mock_intents() -> None:
    """Verify keyword rules map to expected intents."""
    r1 = route_question("Who owns the session store?")
    assert "ownership" in r1.intents
    assert "session-store" in r1.service_ids

    r2 = route_question("Who knows the ledger and what is the bus factor?")
    assert "expertise" in r2.intents
    assert "ledger" in r2.service_ids

    r3 = route_question("Why did we decide on Redis?")
    assert "decision" in r3.intents

    r4 = route_question("Is ADR-038 still valid or is it outdated and stale?")
    assert "staleness" in r4.intents


@pytest.mark.asyncio
async def test_mock_temporal_schema_matches_graphiti() -> None:
    """Verify MockTemporal creates :Entity, :Episodic, [:RELATES_TO {valid_at, invalid_at}], and [:MENTIONS]."""
    settings = get_settings()
    falkor = get_falkor_client()
    mock_temp = MockTemporal()

    ep_uuid = await mock_temp.add_episode(
        name="Test Episode",
        body="Temporal schema validation test",
        source_description="unit test",
        reference_time="2026-09-18T10:00:00Z",
        group_id="test_org",
        facts=[
            {
                "subject": "service-x",
                "predicate": "STORED_IN",
                "object": "db-y",
                "valid_at": "2026-09-18T10:00:00Z",
                "invalid_at": None,
            }
        ],
    )
    assert ep_uuid.startswith("ep_")

    # Verify Episodic node
    q_ep = falkor.query(
        settings.GRAPH_TEMPORAL,
        "MATCH (ep:Episodic {uuid: $uuid}) RETURN ep.name",
        {"uuid": ep_uuid},
    )
    assert len(q_ep.result_set) == 1

    # Verify Entity nodes and MENTIONS
    q_mentions = falkor.query(
        settings.GRAPH_TEMPORAL,
        "MATCH (ep:Episodic {uuid: $uuid})-[:MENTIONS]->(e:Entity) RETURN count(e)",
        {"uuid": ep_uuid},
    )
    assert q_mentions.result_set[0][0] >= 2

    # Verify RELATES_TO edge
    q_rel = falkor.query(
        settings.GRAPH_TEMPORAL,
        "MATCH (s:Entity {name: 'service-x'})-[r:RELATES_TO]->(o:Entity {name: 'db-y'}) RETURN r.valid_at, r.invalid_at",
    )
    assert len(q_rel.result_set) == 1
    assert q_rel.result_set[0][0] == "2026-09-18T10:00:00Z"
    assert q_rel.result_set[0][1] is None
