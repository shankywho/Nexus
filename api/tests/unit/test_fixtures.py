"""Unit test validating fixtures integrity."""

import json
from pathlib import Path


def test_fixtures_complete_and_valid() -> None:
    """Validate people.json, services.json, events.jsonl, docs, and gold_questions.json."""
    base_dir = Path(__file__).resolve().parent.parent.parent.parent

    # 1. People
    people_path = base_dir / "fixtures/company/people.json"
    assert people_path.exists(), "people.json must exist"
    with open(people_path, encoding="utf-8") as f:
        people_data = json.load(f)
    people = people_data["people"]
    teams = people_data["teams"]
    assert len(people) == 12, "Must have exactly 12 people"
    assert len(teams) == 4, "Must have exactly 4 teams"
    person_ids = {p["id"] for p in people}
    team_ids = {t["id"] for t in teams}
    for p in people:
        assert p["team_id"] in team_ids, (
            f"Person {p['id']} has invalid team {p['team_id']}"
        )
        assert "email_hash" in p and len(p["email_hash"]) >= 32, (
            f"Person {p['id']} missing email_hash"
        )
        assert "@" not in p["email_hash"], (
            f"Email hash for {p['id']} must not contain raw email"
        )

    # Verify anchor people
    for anchor in ["arjun", "priya", "meera", "kabir"]:
        assert anchor in person_ids, f"Anchor person {anchor} must exist"

    # 2. Services
    services_path = base_dir / "fixtures/company/services.json"
    assert services_path.exists(), "services.json must exist"
    with open(services_path, encoding="utf-8") as f:
        services_data = json.load(f)
    services = services_data["services"]
    projects = services_data["projects"]
    assert len(services) == 8, "Must have exactly 8 services"
    assert len(projects) == 3, "Must have exactly 3 projects"
    service_ids = {s["id"] for s in services}
    assert "session-store" in service_ids
    assert "ledger" in service_ids
    assert "auth-gateway" in service_ids

    # 3. Events (EXACTLY 50)
    events_path = base_dir / "fixtures/company/events.jsonl"
    assert events_path.exists(), "events.jsonl must exist"
    events = []
    with open(events_path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                events.append(json.loads(line))

    assert len(events) == 50, f"Expected exactly 50 events, got {len(events)}"

    event_ids = {e["id"] for e in events}
    assert len(event_ids) == 50, "All event IDs must be unique"

    # Validate anchor events
    anchor_event_ids = [
        "evt-0001",
        "evt-0007",
        "evt-0008",
        "evt-0009",
        "evt-0010",
        "evt-0011",
        "evt-0012",
        "evt-0013",
    ]
    for aid in anchor_event_ids:
        assert aid in event_ids, f"Anchor event {aid} missing"

    # Check anchor IDs in content
    all_refs = [e.get("refs", {}) for e in events]
    all_decisions = {r.get("decision_id") for r in all_refs if r.get("decision_id")}
    all_tickets = {r.get("ticket_id") for r in all_refs if r.get("ticket_id")}
    all_docs = {r.get("doc_id") for r in all_refs if r.get("doc_id")}
    all_prs = {r.get("pr_id") for r in all_refs if r.get("pr_id")}

    assert "DEC-017" in all_decisions, "DEC-017 must be referenced"
    assert "DEC-021" in all_decisions, "DEC-021 must be referenced"
    assert "DEC-024" in all_decisions, "DEC-024 must be referenced"
    assert "DEC-026" in all_decisions, "DEC-026 must be referenced"
    assert "LIN-391" in all_tickets, "LIN-391 ticket must be referenced"
    assert "LIN-409" in all_tickets, "LIN-409 ticket must be referenced"
    assert "ADR-038" in all_docs, "ADR-038 must be referenced"
    assert "ADR-042" in all_docs, "ADR-042 must be referenced"
    assert "PR-1150" in all_prs, "PR-1150 must be referenced"
    assert "PR-1184" in all_prs, "PR-1184 must be referenced"

    # Validate actors and service references resolve
    for ev in events:
        actor = ev.get("actor")
        assert actor in person_ids, f"Event {ev['id']} has unknown actor {actor}"
        for s_id in ev.get("refs", {}).get("service_ids", []):
            assert s_id in service_ids, (
                f"Event {ev['id']} references unknown service {s_id}"
            )

    # 4. Docs
    docs_dir = base_dir / "fixtures/company/docs"
    assert (docs_dir / "ADR-038.md").exists()
    assert (docs_dir / "ADR-042.md").exists()
    assert (docs_dir / "RUNBOOK-payments.md").exists()

    # 5. Gold Questions
    gq_path = base_dir / "fixtures/company/gold_questions.json"
    assert gq_path.exists()
    with open(gq_path, encoding="utf-8") as f:
        gq = json.load(f)
    assert len(gq) == 10, "Must have exactly 10 gold questions"
    for item in gq:
        assert "q" in item and len(item["q"]) > 5
        assert "gold_answer_contains" in item and len(item["gold_answer_contains"]) > 0
        assert "gold_current_source_ids" in item
        assert "stale_trap_terms" in item
