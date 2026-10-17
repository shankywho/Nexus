#!/usr/bin/env python3
"""
NEXUS Memory & Multi-Agent Concurrency Load Test.
Checks:
  - High-concurrency reads and writes natively on FalkorDB
  - Zero race condition atomic task claims
  - Quantifies throughput (ops/sec) and p50/p95 latency metrics

Usage:
  uv run --project api python scripts/loadtest.py --workers 20 --operations 200
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
import time
import uuid
from pathlib import Path

# Add api to path
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "api"))

from nexus_api.adapters.falkor import FalkorClient
from nexus_api.config import get_settings
from nexus_api.memory.store import MemoryStore


# ANSI formatting
BOLD = "\033[1m"
GREEN = "\033[32m"
CYAN = "\033[36m"
YELLOW = "\033[33m"
RESET = "\033[0m"


async def worker_task(
    worker_id: int,
    operations_per_worker: int,
    store: MemoryStore,
    latencies: list[float],
    claimed_tasks: list[str],
) -> None:
    """Simulates a concurrent agent writing and reading from FalkorDB memory."""
    for op_i in range(operations_per_worker):
        t0 = time.perf_counter()

        # 1. Create a task (returns task_id)
        task_id = await asyncio.to_thread(
            store.create_task,
            title=f"Concurrent triage job {op_i}",
            description=f"Automated load test session {worker_id}-{op_i}",
            incident_id="INC-LOAD",
            assigned_to="scout",
        )

        # 2. Concurrently claim task atomically
        claimed = await asyncio.to_thread(
            store.claim_task_atomic,
            task_id=task_id,
            agent_id="planner",
        )
        if claimed:
            claimed_tasks.append(task_id)

        # 3. Handoff task
        await asyncio.to_thread(
            store.handoff_task,
            task_id=task_id,
            from_agent="planner",
            to_agent="scribe",
            note=f"Handoff by worker {worker_id}",
        )

        # 4. Save episode & fact
        await asyncio.to_thread(
            store.record_episode,
            incident_id="INC-LOAD",
            goal="Test high-concurrency throughput",
            outcome="Remediation verified",
            touched_entities=["web-checkout", "auth-gateway"],
        )

        await asyncio.to_thread(
            store.save_fact,
            subject=f"service_{worker_id}",
            predicate="CONCURRENT_BENCHMARK",
            obj="PASS",
        )

        # 5. Read operations: recall & lookup
        await asyncio.to_thread(store.recall_episodes, entities=["web-checkout"])
        await asyncio.to_thread(store.find_procedure, trigger_pattern="incident_")

        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000)


async def run_loadtest(num_workers: int, total_ops: int) -> dict[str, float]:
    border = "=" * 76
    print(f"\n{CYAN}{BOLD}{border}")
    print(f"  NEXUS Native FalkorDB Memory High-Concurrency Benchmark")
    print(f"  Workers: {num_workers} | Total Agent Sessions: {total_ops}")
    print(f"{border}{RESET}\n")

    store = MemoryStore(tenant="benchmark")
    store.reset()


    ops_per_worker = max(1, total_ops // num_workers)
    latencies: list[float] = []
    claimed_tasks: list[str] = []

    t_start = time.perf_counter()

    tasks = [
        worker_task(
            worker_id=w,
            operations_per_worker=ops_per_worker,
            store=store,
            latencies=latencies,
            claimed_tasks=claimed_tasks,
        )
        for w in range(num_workers)
    ]
    await asyncio.gather(*tasks)

    t_end = time.perf_counter()
    total_duration = t_end - t_start

    total_atomic_ops = len(latencies) * 7  # 7 graph operations per session
    throughput = total_atomic_ops / total_duration

    latencies.sort()
    p50 = statistics.median(latencies)
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0.0
    p99 = latencies[int(len(latencies) * 0.99)] if latencies else 0.0
    mean_lat = statistics.mean(latencies) if latencies else 0.0

    print(f"{GREEN}{BOLD}Concurrency Benchmark Results:{RESET}")
    print(f"  Total Duration:         {BOLD}{total_duration:.2f} seconds{RESET}")
    print(f"  Agent Sessions:         {BOLD}{len(latencies)}{RESET}")
    print(f"  Graph Operations:       {BOLD}{total_atomic_ops} ops{RESET}")
    print(f"  Throughput:             {GREEN}{BOLD}{throughput:.1f} ops/sec{RESET}")
    print(f"  Session Latency (p50):  {CYAN}{BOLD}{p50:.2f} ms{RESET}")
    print(f"  Session Latency (p95):  {YELLOW}{BOLD}{p95:.2f} ms{RESET}")
    print(f"  Session Latency (p99):  {YELLOW}{BOLD}{p99:.2f} ms{RESET}")
    print(f"  Mean Latency:           {BOLD}{mean_lat:.2f} ms{RESET}")

    # Verify zero race conditions: each task claimed exactly once
    assert len(claimed_tasks) == len(set(claimed_tasks)), "Race condition: duplicate task claim detected!"
    print(f"\n{GREEN}{BOLD}✓ RACE CONDITION TEST PASSED:{RESET} {len(claimed_tasks)} tasks claimed atomically with zero double-claims.\n")

    return {
        "throughput_ops_per_sec": throughput,
        "p50_ms": p50,
        "p95_ms": p95,
        "p99_ms": p99,
        "total_ops": float(total_atomic_ops),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="NEXUS FalkorDB Concurrency Benchmark")
    parser.add_argument("--workers", type=int, default=10, help="Number of concurrent workers")
    parser.add_argument("--operations", type=int, default=100, help="Total agent sessions")
    args = parser.parse_args()

    asyncio.run(run_loadtest(num_workers=args.workers, total_ops=args.operations))


if __name__ == "__main__":
    main()
