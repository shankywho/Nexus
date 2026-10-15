#!/usr/bin/env python3
"""Seed script for NEXUS: loads people, services, and events into FalkorDB."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Add api directory to sys.path so nexus_api can be imported
api_dir = Path(__file__).resolve().parent.parent / "api"
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

from nexus_api.adapters.docs_rag import get_docs_rag
from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings
from nexus_api.services.ingest import ingest_source_event


def ensure_schema_indexes() -> None:
    """Apply indexes from cypher/schema.cypher idempotently."""
    settings = get_settings()
    falkor = get_falkor_client()
    schema_file = api_dir / "nexus_api/cypher/schema.cypher"
    if schema_file.exists():
        with open(schema_file, encoding="utf-8") as f:
            for line in f:
                stmt = line.strip()
                if stmt and not stmt.startswith("//"):
                    try:
                        falkor.query(settings.GRAPH_COMPANY, stmt)
                    except Exception:
                        pass  # index already exists or syntax variation


def seed_people_and_services() -> None:
    """Load fixtures/company/people.json and services.json into nexus_company."""
    settings = get_settings()
    falkor = get_falkor_client()
    org_id = settings.NEXUS_ORG_ID
    graph_name = settings.GRAPH_COMPANY
    base_dir = api_dir.parent

    # 1. People & Teams
    people_file = base_dir / "fixtures/company/people.json"
    with open(people_file, encoding="utf-8") as f:
        pdata = json.load(f)

    for team in pdata["teams"]:
        falkor.query(
            graph_name,
            "MERGE (t:Team {id: $id, org_id: $org_id}) SET t.name = $name",
            {"id": team["id"], "name": team["name"], "org_id": org_id},
        )

    for person in pdata["people"]:
        falkor.query(
            graph_name,
            """
            MERGE (p:Person {id: $id, org_id: $org_id})
            SET p.name = $name,
                p.role = $role,
                p.email_hash = $email_hash
            WITH p
            MATCH (t:Team {id: $team_id, org_id: $org_id})
            MERGE (p)-[:MEMBER_OF {org_id: $org_id}]->(t)
            """,
            {
                "id": person["id"],
                "name": person["name"],
                "role": person["role"],
                "email_hash": person["email_hash"],
                "team_id": person["team_id"],
                "org_id": org_id,
            },
        )

    # 2. Services & Projects
    services_file = base_dir / "fixtures/company/services.json"
    with open(services_file, encoding="utf-8") as f:
        sdata = json.load(f)

    for s in sdata["services"]:
        falkor.query(
            graph_name,
            """
            MERGE (srv:Service {id: $id, org_id: $org_id})
            SET srv.name = $name,
                srv.tier = $tier,
                srv.description = $desc
            WITH srv
            MATCH (t:Team {id: $team_id, org_id: $org_id})
            MERGE (t)-[:OWNS {org_id: $org_id}]->(srv)
            """,
            {
                "id": s["id"],
                "name": s["name"],
                "tier": s.get("tier", 1),
                "desc": s.get("description", ""),
                "team_id": s["team_id"],
                "org_id": org_id,
            },
        )
        for m_id in s.get("maintainer_ids", []):
            falkor.query(
                graph_name,
                """
                MATCH (p:Person {id: $m_id, org_id: $org_id})
                MATCH (srv:Service {id: $s_id, org_id: $org_id})
                MERGE (p)-[:MAINTAINS {org_id: $org_id}]->(srv)
                """,
                {"m_id": m_id, "s_id": s["id"], "org_id": org_id},
            )

    for p in sdata["projects"]:
        falkor.query(
            graph_name,
            """
            MERGE (prj:Project {id: $id, org_id: $org_id})
            SET prj.name = $name,
                prj.status = $status
            WITH prj
            MATCH (t:Team {id: $team_id, org_id: $org_id})
            MERGE (t)-[:OWNS {org_id: $org_id}]->(prj)
            """,
            {
                "id": p["id"],
                "name": p["name"],
                "status": p.get("status", "active"),
                "team_id": p["team_id"],
                "org_id": org_id,
            },
        )
        if "owner_id" in p:
            falkor.query(
                graph_name,
                """
                MATCH (person:Person {id: $owner_id, org_id: $org_id})
                MATCH (prj:Project {id: $prj_id, org_id: $org_id})
                MERGE (person)-[:OWNS {org_id: $org_id}]->(prj)
                """,
                {"owner_id": p["owner_id"], "prj_id": p["id"], "org_id": org_id},
            )


async def seed_events(until: str | None = None) -> int:
    """Ingest events from fixtures/company/events.jsonl up to until timestamp."""
    base_dir = api_dir.parent
    events_file = base_dir / "fixtures/company/events.jsonl"
    count = 0
    with open(events_file, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            ev = json.loads(line)
            ts = ev.get("ts", "")
            if until and ts > until:
                continue
            await ingest_source_event(ev)
            count += 1
    return count


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed NEXUS database")
    parser.add_argument("--until", type=str, default=None, help="Only ingest events up to ISO timestamp (e.g. 2026-09-30)")
    parser.add_argument("--reset", action="store_true", help="Reset database before seeding")
    args = parser.parse_args()

    if args.reset:
        falkor = get_falkor_client()
        falkor.reset_nexus_graphs()
        print("Reset all nexus_* graphs.")

    ensure_schema_indexes()
    seed_people_and_services()
    print("Seeded teams, people, services, and projects.")

    doc_count = get_docs_rag().index_documents()
    print(f"Indexed {doc_count} documents into nexus_docs.")

    count = await seed_events(until=args.until)
    print(f"Ingested {count} events (until={args.until or 'ALL'}).")


if __name__ == "__main__":
    asyncio.run(main())
