"""Sync replayer service: manages async replay of events.jsonl with SSE progress."""

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.services.eventbus import get_eventbus
from nexus_api.services.ingest import ingest_source_event
from nexus_api.services.tracing import get_tracing_store

logger = logging.getLogger(__name__)


def summarize_event(ev: dict[str, Any]) -> dict[str, Any]:
    """The part of a source event the UI needs to animate it: who did what, to which entities."""
    refs = ev.get("refs") or {}
    return {
        "id": ev.get("id"),
        "kind": ev.get("kind"),
        "actor": ev.get("actor"),
        "channel": ev.get("channel"),
        "ts": ev.get("ts"),
        "text": str(ev.get("text") or "")[:140],
        "refs": {k: v for k, v in refs.items() if v},
        "supersedes": ev.get("supersedes"),
    }


class SyncReplayer:
    """Manages playback of fixtures/company/events.jsonl with real-time SSE progress."""

    def __init__(self) -> None:
        self.state: str = "idle"  # idle | running | completed | cancelled | failed
        self.processed: int = 0
        self.total: int = 0
        self.run_id: str = ""
        self._task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

    def get_status(self) -> dict[str, Any]:
        """Return current status of replay."""
        return {
            "state": self.state,
            "processed": self.processed,
            "total": self.total,
            "run_id": self.run_id,
        }

    async def start(self, interval_ms: int = 600, reset: bool = False) -> str:
        """Start async simulation. Raises ValueError if already running."""
        async with self._lock:
            if self.state == "running":
                raise ValueError("A sync replay is already running")

            if reset:
                falkor = get_falkor_client()
                falkor.reset_nexus_graphs()
                from scripts.seed import ensure_schema_indexes, seed_people_and_services
                ensure_schema_indexes()
                seed_people_and_services()

            tracing = get_tracing_store()
            self.run_id = tracing.start_run(kind="sync", input_data={"interval_ms": interval_ms, "reset": reset})
            self.state = "running"
            self.processed = 0

            # Count total events in events.jsonl
            base_dir = Path(__file__).resolve().parent.parent.parent.parent
            events_file = base_dir / "fixtures/company/events.jsonl"
            lines: list[dict[str, Any]] = []
            if events_file.exists():
                with open(events_file, encoding="utf-8") as f:
                    for line in f:
                        if line.strip():
                            lines.append(json.loads(line))
            self.total = len(lines)

            self._task = asyncio.create_task(self._replay_loop(lines, interval_ms))
            return self.run_id

    async def cancel(self) -> bool:
        """Cancel running replay."""
        async with self._lock:
            if self.state != "running" or self._task is None:
                return False
            self._task.cancel()
            self.state = "cancelled"
            tracing = get_tracing_store()
            if self.run_id:
                tracing.end_run(self.run_id, status="cancelled")
            eventbus = get_eventbus()
            await eventbus.publish("sync.progress", self.get_status())
            return True

    async def _replay_loop(self, events: list[dict[str, Any]], interval_ms: int) -> None:
        eventbus = get_eventbus()
        tracing = get_tracing_store()

        try:
            for ev in events:
                if self.state != "running":
                    break

                await ingest_source_event(ev)
                self.processed += 1

                progress_data = self.get_status()
                progress_data["current_event_id"] = ev.get("id")
                progress_data["event"] = summarize_event(ev)
                await eventbus.publish("sync.progress", progress_data)

                if interval_ms > 0:
                    await asyncio.sleep(interval_ms / 1000.0)

            self.state = "completed"
            tracing.end_run(self.run_id, status="completed")
            await eventbus.publish("sync.progress", self.get_status())

        except asyncio.CancelledError:
            self.state = "cancelled"
            tracing.end_run(self.run_id, status="cancelled")
        except Exception as exc:
            logger.error("Sync replay failed: %s", exc)
            self.state = "failed"
            tracing.end_run(self.run_id, status="failed", error=str(exc))
            await eventbus.publish("step.error", {"error": str(exc), "run_id": self.run_id})


_replayer_instance: SyncReplayer | None = None


def get_sync_replayer() -> SyncReplayer:
    """Get singleton SyncReplayer instance."""
    global _replayer_instance
    if _replayer_instance is None:
        _replayer_instance = SyncReplayer()
    return _replayer_instance
