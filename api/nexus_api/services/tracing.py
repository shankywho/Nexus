"""SQLite tracing store for NEXUS runs and steps."""

import json
import sqlite3
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from nexus_api.config import get_settings


class TracingStore:
    """Manages run and step telemetry persistence in SQLite."""

    def __init__(self, db_path: str | None = None) -> None:
        if db_path is None:
            settings = get_settings()
            db_path = settings.DB_PATH
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    kind TEXT,
                    input_json TEXT,
                    status TEXT,
                    started_at TEXT,
                    ended_at TEXT,
                    error TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS steps (
                    id TEXT PRIMARY KEY,
                    run_id TEXT,
                    node TEXT,
                    started_at TEXT,
                    latency_ms INTEGER,
                    status TEXT,
                    input_preview TEXT,
                    output_preview TEXT,
                    graph TEXT,
                    cypher TEXT,
                    hits_json TEXT,
                    FOREIGN KEY (run_id) REFERENCES runs(id)
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS steps_run ON steps(run_id)")
            conn.commit()

    def start_run(self, kind: str, input_data: Any = None) -> str:
        """Start a new trace run."""
        run_id = f"run_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
        started_at = datetime.now(UTC).isoformat()
        input_json = json.dumps(input_data) if input_data is not None else ""

        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO runs (id, kind, input_json, status, started_at) VALUES (?, ?, ?, ?, ?)",
                (run_id, kind, input_json, "running", started_at),
            )
            conn.commit()
        return run_id

    def end_run(
        self, run_id: str, status: str = "completed", error: str | None = None
    ) -> None:
        """Mark a trace run as completed or failed."""
        ended_at = datetime.now(UTC).isoformat()
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE runs SET status = ?, ended_at = ?, error = ? WHERE id = ?",
                (status, ended_at, error, run_id),
            )
            conn.commit()

    def record_step(
        self,
        run_id: str,
        node: str,
        latency_ms: int,
        status: str = "ok",
        input_preview: str = "",
        output_preview: str = "",
        graph: str = "",
        cypher: str = "",
        hits: list[Any] | None = None,
    ) -> str:
        """Record a single step within a run."""
        step_id = f"step_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
        started_at = datetime.now(UTC).isoformat()
        hits_json = json.dumps(hits) if hits is not None else ""

        # Limit preview strings to 300 chars per spec
        in_prev = input_preview[:300] if input_preview else ""
        out_prev = output_preview[:300] if output_preview else ""

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO steps (
                    id, run_id, node, started_at, latency_ms, status,
                    input_preview, output_preview, graph, cypher, hits_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    step_id,
                    run_id,
                    node,
                    started_at,
                    latency_ms,
                    status,
                    in_prev,
                    out_prev,
                    graph,
                    cypher,
                    hits_json,
                ),
            )
            conn.commit()
        return step_id

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        """Retrieve run details and all its steps."""
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
            if not row:
                return None
            run_dict = dict(row)
            step_rows = conn.execute(
                "SELECT * FROM steps WHERE run_id = ? ORDER BY started_at ASC",
                (run_id,),
            ).fetchall()
            run_dict["steps"] = [dict(s) for s in step_rows]
            return run_dict

    def list_runs(
        self, kind: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        """List recent runs."""
        with self._get_connection() as conn:
            if kind:
                rows = conn.execute(
                    "SELECT * FROM runs WHERE kind = ? ORDER BY started_at DESC LIMIT ?",
                    (kind, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM runs ORDER BY started_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [dict(r) for r in rows]

    def reset_runs(self) -> None:
        """Clear all runs and steps."""
        with self._get_connection() as conn:
            conn.execute("DELETE FROM steps")
            conn.execute("DELETE FROM runs")
            conn.commit()


_tracing_instance: TracingStore | None = None


def get_tracing_store() -> TracingStore:
    """Get singleton TracingStore instance."""
    global _tracing_instance
    if _tracing_instance is None:
        _tracing_instance = TracingStore()
    return _tracing_instance
