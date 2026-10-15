# NEXUS API

FastAPI service that ingests events into FalkorDB, tracks decision supersession, runs audits and answers questions with provenance. Architecture: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Endpoints: [../docs/API.md](../docs/API.md).

## Run

```bash
uv sync
uv run uvicorn nexus_api.main:app --reload --port 8000
```

Needs FalkorDB on `FALKORDB_HOST:FALKORDB_PORT` (`docker compose up -d falkordb` from the repo root). Configuration is read from environment variables; see [../.env.example](../.env.example).

## Test and check

```bash
uv run pytest tests/unit          # no services needed
uv run pytest tests/integration   # needs FalkorDB
uv run ruff check .
uv run mypy nexus_api
```

## Layout

```
nexus_api/
├── main.py, config.py   app factory, settings
├── routes/              HTTP handlers
├── services/            business logic
├── adapters/            FalkorDB, temporal, docs RAG, LLM
├── agents/              question router and prompts
├── models/              Pydantic models
└── cypher/              Cypher queries
```
