# API Reference

Base URL: `http://localhost:8000`. Interactive docs: `/docs` (OpenAPI). All routes are defined in [`api/nexus_api/routes/`](../api/nexus_api/routes).

| Method | Path | Description |
|---|---|---|
| `GET` | `/health`, `/api/health` | Liveness, FalkorDB status, graph counts and `llm.mode` (`claude`, `openai` or `scripted`). |
| `POST` | `/api/ingest/event` | Ingest one event (Slack, Linear, GitHub, incident, ADR). Idempotent on event id. |
| `POST` | `/api/audits/who-owns-what` | Ownership audit. |
| `POST` | `/api/audits/decision-trace` | Decision lineage. Optional body: `{decision_id, service_id}`. |
| `POST` | `/api/audits/stale-knowledge` | Active versus superseded decision sources. |
| `POST` | `/api/audits/bus-factor` | Bus factor and expertise audit. |
| `POST` | `/api/ask` | Body `{question, as_of?}`. Returns `answer`, `current_sources`, `superseded_sources`, `path`, `owners`, `confidence`, `degraded`, `run_id`, `mode` (which engine answered) and `model`. |
| `GET` | `/api/provenance/{decision_id}` | Multi-hop lineage for a decision. |
| `GET` | `/api/graph/topology` | Nodes and edges for the topology view. |
| `GET` | `/api/graph/temporal/edges` | Bi-temporal fact edges. |
| `POST` | `/api/sync/simulate` | Replay `fixtures/company/events.jsonl`. Returns 409 if a run is active. |
| `GET` | `/api/sync/status` | State and progress of the active or latest run. |
| `POST` | `/api/sync/cancel` | Cancel the active run. |
| `GET` | `/api/events/stream` | Server-Sent Events for sync progress. |
| `GET` | `/api/sources` | List ingested source events. |
| `DELETE` | `/api/sources/{event_id}` | Erase a source event and any nodes derived only from it. |
| `GET` | `/api/runs`, `/api/runs/{run_id}` | Run history and step-level trace. |
| `POST` | `/api/admin/reset` | Reset graphs and run history. |
| `GET` | `/debug` | Static debug console (telemetry waterfall and Cypher). |
