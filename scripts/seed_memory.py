#!/usr/bin/env python3
"""Fill the agent memory graphs with sample history so the UI is not empty.

Run after seed.py. Acme gets three past incidents; Globex gets two of its own.
INC-83 and INC-84 are left to run live.
"""

import sys
from pathlib import Path

api_dir = Path(__file__).resolve().parent.parent / "api"
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

from nexus_api.memory.store import get_memory_store

SEQUENCE = [
    "blast_radius", "who_owns", "criticality_rank", "find_implicated_decisions",
    "decision_trace", "recall", "flag_decision_for_review", "page_owner",
    "open_ticket", "remember",
]

ACME = [
    ("INC-71", "ledger", "payouts", "Resolve INC-71 payout batch delays on ledger",
     "Blast radius mapped (5 nodes), maintainers paged, action ticket created, DEC-012 flagged.",
     [("ledger", "STABILIZED_AFTER", "INC-71"), ("payouts", "DEPENDS_ON_RUNBOOK", "ledger-failover")]),
    ("INC-77", "session-store", "auth-gateway", "Resolve INC-77 Redis memory exhaustion on session-store",
     "Blast radius mapped (6 nodes), maintainers paged, action ticket created, DEC-017 flagged.",
     [("session-store", "STABILIZED_AFTER", "INC-77"), ("session-store", "EVICTION_POLICY", "allkeys-lru")]),
    ("INC-79", "fraud-scorer", "ledger", "Resolve INC-79 scoring timeouts on fraud-scorer",
     "Blast radius mapped (4 nodes), maintainers paged, action ticket created, DEC-024 flagged.",
     [("fraud-scorer", "STABILIZED_AFTER", "INC-79")]),
]

GLOBEX = [
    ("GLX-INC-12", "power-grid", "seismic-monitor", "Resolve GLX-INC-12 telemetry gap on power-grid",
     "Blast radius mapped (3 nodes), Hank paged, GLX-DEC-001 confirmed.",
     [("power-grid", "STABILIZED_AFTER", "GLX-INC-12")]),
    ("GLX-INC-15", "seismic-monitor", "power-grid", "Resolve GLX-INC-15 false shutdown alert",
     "Blast radius mapped (3 nodes), Homer paged, threshold reviewed.",
     [("seismic-monitor", "STABILIZED_AFTER", "GLX-INC-15")]),
]


def fill(tenant: str, rows: list, owner: str) -> None:
    store = get_memory_store(tenant=tenant)
    store.reset()
    for inc, svc, dep, goal, outcome, facts in rows:
        store.record_episode(inc, goal, outcome, [svc, dep, inc])
        for subj, pred, obj in facts:
            store.save_fact(subj, pred, obj)
        task = store.create_task(f"Triage {inc}", f"{svc} incident", inc, "Scout")
        store.claim_task_atomic(task, "Scout")
        store.handoff_task(task, "Scout", "Planner", f"Blast radius for {svc} mapped")
        store.handoff_task(task, "Planner", "Scribe", f"{owner} paged, ticket opened")
        store.complete_task(task, f"Triage complete for {inc}.")
    store.register_procedure(f"{tenant}-incident-triage", SEQUENCE)
    print(f"{tenant}: {len(rows)} episodes, {len(store.list_facts())} facts")


if __name__ == "__main__":
    fill("acme", ACME, "on-call owner")
    fill("globex", GLOBEX, "on-call owner")
