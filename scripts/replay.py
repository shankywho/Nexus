#!/usr/bin/env python3
"""Replay script for NEXUS: replays events.jsonl via simulate API or raw webhook ingest."""

import argparse
import os
import json
import sys
import time
from pathlib import Path
import httpx

base_dir = Path(__file__).resolve().parent.parent
events_file = base_dir / "fixtures/company/events.jsonl"


def replay_simulate(api_url: str, interval_ms: int, reset: bool) -> None:
    """Start simulation via /api/sync/simulate endpoint."""
    print(f"Triggering sync simulation at {api_url}/api/sync/simulate (interval={interval_ms}ms, reset={reset})...")
    with httpx.Client(base_url=api_url, timeout=30.0) as client:
        res = client.post(
            "/api/sync/simulate",
            json={"interval_ms": interval_ms, "reset": reset},
            headers={"X-Admin-Token": os.environ.get("ADMIN_TOKEN", "change-me")},
        )
        if res.status_code == 409:
            print("Sync simulation is already running.")
            return
        res.raise_for_status()
        data = res.json()
        run_id = data.get("run_id")
        print(f"Sync simulation started: run_id={run_id}")

        # Poll status until done
        while True:
            time.sleep(1.0)
            status_res = client.get("/api/sync/status")
            status_res.raise_for_status()
            st = status_res.json()
            state = st.get("state")
            processed = st.get("processed", 0)
            total = st.get("total", 0)
            print(f"Status: {state} [{processed}/{total}]", end="\r", flush=True)
            if state in ("completed", "failed", "cancelled"):
                print(f"\nSimulation finished with state: {state}")
                break


def replay_raw(api_url: str, interval_ms: int) -> None:
    """POST each event directly to /api/ingest/event webhook endpoint."""
    if not events_file.exists():
        print(f"Events file not found: {events_file}")
        sys.exit(1)

    print(f"Replaying raw events to {api_url}/api/ingest/event (interval={interval_ms}ms)...")
    delay = interval_ms / 1000.0

    lines: list[dict] = []
    with open(events_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                lines.append(json.loads(line))

    with httpx.Client(base_url=api_url, timeout=30.0) as client:
        for idx, ev in enumerate(lines, 1):
            res = client.post("/api/ingest/event", json=ev)
            res.raise_for_status()
            ev_id = ev.get("id")
            kind = ev.get("kind")
            print(f"[{idx}/{len(lines)}] Ingested {ev_id} ({kind}) -> {res.status_code}", flush=True)
            if delay > 0 and idx < len(lines):
                time.sleep(delay)

    print("\nRaw replay completed successfully.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay events for NEXUS")
    parser.add_argument("--mode", choices=["simulate", "raw"], default="simulate", help="Replay mode")
    parser.add_argument("--interval", type=int, default=600, help="Interval in milliseconds")
    parser.add_argument("--api-url", default="http://localhost:8000", help="NEXUS API base URL")
    parser.add_argument("--reset", action="store_true", help="Reset graphs before simulate replay")
    args = parser.parse_args()

    if args.mode == "simulate":
        replay_simulate(args.api_url, args.interval, args.reset)
    else:
        replay_raw(args.api_url, args.interval)


if __name__ == "__main__":
    main()
