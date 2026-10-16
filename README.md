# NEXUS

**Organizational telemetry and decision graph.** NEXUS ingests Slack, Linear, GitHub, incidents and ADRs into FalkorDB, tracks which decisions superseded which, and answers questions with provenance, so engineers do not act on stale decisions.

![NEXUS office floor view](docs/img/office-floor.png)

*Office view: teams are rooms, people sit at desks with a note on what they own, services are server racks, decisions are wall boards. Superseded decisions are stamped REPLACED. The Graph toggle switches to a clustered decision graph (see [docs/img/decision-graph.png](docs/img/decision-graph.png)).*

## Why

Flat vector search over team history returns superseded answers. A migration to Redis from last quarter ranks as high as the incident and ADR that reversed it. NEXUS models decisions as a bi-temporal graph. Superseded decisions stay queryable but are flagged, so answers use current state and cite both.

## Features

- **Multi-graph store:** `nexus_company` (entities and decisions), `nexus_temporal` (bi-temporal facts), `nexus_docs` (ADRs and runbooks), isolated per `org_id`.
- **Event ingest:** idempotent projection of source events into typed nodes with provenance back-links.
- **Supersession engine:** detects reversals and sets `invalid_at` on older decisions.
- **Four audits:** who owns what, decision trace, stale knowledge, bus factor.
- **Ask agent:** routes a question, runs multi-hop Cypher, validates against the graph, and returns current and superseded sources.
- **HUD:** Next.js dashboard with an office floor-plan view and a live force-graph topology (superseded edges dashed red, active edges green), audit bar, ask panel and live sync via SSE.
- **Live floor:** while events stream in, the actor reacts (halo, hop, a note saying what they are doing), an envelope flies to the service or decision it concerns, incidents ring the rack and flash a "!", replaced boards get stamped and new boards pop onto the wall. Motion is switched off for `prefers-reduced-motion`.
- **Claude answers:** set `ANTHROPIC_API_KEY` and questions are answered by Claude from graph context, then checked against the graph so invented ids are dropped. Without a key, offline answers are built from the graph.
- **Zero-key mode:** `MOCK_EXTERNALS=true` runs everything offline with deterministic extractors.

## Repository layout

```
.
├── api/            FastAPI service (nexus_api/), unit and integration tests
├── web/            Next.js office HUD (/nexus)
├── fixtures/       Synthetic Acme Payments data: events, people, services, docs, gold questions
├── scripts/        Seed, replay, evaluate and reset tooling
├── docs/           Architecture, API, data model, queries, 3-minute demo script
├── .github/        CI workflow
├── docker-compose.yml
├── Makefile
├── DECISIONS.md    Engineering & UI redesign decisions
└── MODIFICATIONS.md  History note on the removed upstream FalkorDB Browser code
```

## Quickstart

Requires Docker with Compose. Nothing else is needed to run the demo.

```bash
cp .env.example .env     # defaults run offline; add ANTHROPIC_API_KEY to use Claude
make up                  # builds and starts FalkorDB, API, web and the MCP server
make demo                # loads the company as of Sep 30
open http://localhost:3000
```

Demo flow:

1. Note `DEC-017` (sessions in Redis) shown as a live board.
2. Run **Bus factor** from the audit bar.
3. Click **Replay company sync**. As `INC-77` and `PR-1184` stream in, people react, envelopes fly, and `DEC-017` is stamped replaced while `DEC-021` appears.
4. Ask *"Where do we store user sessions?"*. The answer cites `ADR-042` as current and `ADR-038` as superseded.

Port in use? Set `NEXUS_FALKORDB_PORT`, `NEXUS_API_PORT`, `NEXUS_WEB_PORT` or `NEXUS_MCP_PORT` before `make up`.

| Service | URL |
|---|---|
| Landing page | http://localhost:3000 |
| Office | http://localhost:3000/nexus |
| API and OpenAPI docs | http://localhost:8000/docs |
| FalkorDB | `localhost:6379` |
| MCP server | http://localhost:8080 |

## Run with Claude

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env     # your key; .env is git-ignored
docker compose up -d api                         # restart the API so it reads the key
make demo
```

The header chip changes from "offline answers" to "Claude live", and each answer shows a Claude badge. The model gets the decisions, owners, incidents and best-matching events read from FalkorDB, and every id in its reply is checked against the graph. If the key is wrong or the call fails, the app falls back to offline answers and marks the answer `degraded`. See [docs/DEMO.md](docs/DEMO.md) for a recording script.

## Development

```bash
make setup    # local development: create .env, uv sync, npm ci
make test     # api and web unit tests, no services needed
make lint     # ruff, mypy, eslint
make eval     # NEXUS vs flat BM25 benchmark, run inside the API container
make reset    # wipe graphs and run history
make logs     # follow container logs
```

API unit tests need no services: `cd api && uv run pytest tests/unit`. Integration tests need a FalkorDB on `FALKORDB_PORT` and **reset its graphs**, so point them at a scratch instance. Live Graphiti extraction (`MOCK_EXTERNALS=false`) needs the optional extra: `uv sync --extra live`.

## Configuration

All settings are environment variables. See [`.env.example`](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `MOCK_EXTERNALS` | `true` | Offline mode. Set `false` to use a live LLM. |
| `NEXUS_ORG_ID` | `acme` | Tenant id stored on every node. |
| `FALKORDB_HOST` / `FALKORDB_PORT` | `localhost` / `6379` | Graph database. |
| `ANTHROPIC_API_KEY` | empty | Turns on Claude answers. Restart the API after setting it. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model used for answers. |
| `OPENAI_API_KEY` / `GOOGLE_API_KEY` | empty | Only for the optional OpenAI provider and live graph extraction (`MOCK_EXTERNALS=false`). |
| `ADMIN_TOKEN` | `change-me` | Required as `X-Admin-Token` on reset, source deletion and `reset=true` replays. **Change it outside local development.** |
| `INGEST_TOKEN` | empty | When set, `POST /api/ingest/event` requires it as `X-Ingest-Token`. |
| `NEXUS_API_URL` | `http://localhost:8000` | API address the web app proxies to. Set at build time in Docker. |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed browser origins. |

## Benchmark

`make eval` runs the 12 gold questions in `fixtures/company/gold_questions.json` against NEXUS and a flat BM25 RAG baseline. The questions are built to catch systems that ignore supersession.

| Metric | NEXUS (Graph-Temporal) | FLAT-RAG (BM25 Top-3 Raw) | Evaluation Significance |
|---|---|---|---|
| **`current_answer_accuracy`** | **1.00** | **0.08** | Flat RAG retrieves raw chunks asserting superseded facts; NEXUS retrieves current state. |
| **`stale_answer_rate`** | **0.00** | **0.42** | **42% of Flat RAG answers advocate dead/superseded architectures** (e.g., advising Redis for sessions). NEXUS has 0.00 stale answers. |
| **`answers_with_sources`** | **1.00** | **1.00** | Both systems return source citations. |
| **`superseded_sources_flagged`**| **1.00** | **0.00** | **NEXUS explicitly warns the engineer that past sources are superseded**; Flat RAG cannot distinguish active from invalid. |
| **`p95_latency_ms`** | **17 ms** | **0.2 ms** | NEXUS reads the graph and its fact edges in under 20 ms; both are well within interactive limits. |

### Track 2 High-Concurrency Memory Benchmark

Benchmarked using `uv run --project api python scripts/loadtest.py --workers 10 --operations 100` natively against FalkorDB:

| Metric | Result | Description |
|---|---|---|
| **Throughput** | **2,720.7 ops/sec** | Concurrent reads, task claims, handoffs, and episode writes |
| **Session Latency (p50)** | **25.11 ms** | Median multi-step agent session time |
| **Session Latency (p95)** | **31.33 ms** | 95th percentile under concurrent worker contention |
| **Atomic Claim Race Conditions** | **0 double-claims** | Atomic `MATCH ... WHERE status = 'open' SET status = 'claimed'` guarantees single ownership |

## Documentation

| Doc | Contents |
|---|---|
| [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) | **Multi-Track Architecture & Proof:** Full breakdown of all 3 tracks, Mermaid diagrams, MCP tools, and Rule 3 proof |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | **Graph Data Model:** Node labels, edge types, and properties across `nexus_company`, `nexus_temporal`, `nexus_docs`, and `nexus_memory_<tenant>` |
| [docs/QUERIES.md](docs/QUERIES.md) | **Cypher & Graph Algorithms:** Every query and algorithm (`algo.pageRank`, `algo.betweenness`, BFS) the product depends on |
| [docs/DEMO.md](docs/DEMO.md) | **Three-minute demo video script** walking through the live story across all 3 tracks |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagram, ingest sequence, supersession lifecycle, graph schema, code layout |
| [docs/API.md](docs/API.md) | Endpoint reference |
| [DECISIONS.md](DECISIONS.md) | Comprehensive engineering and design decision log |

## Hackathon tracks

NEXUS qualifies for and enters **all three tracks** of **Graph Hacks: Context for AI Agents** (WeMakeDevs x FalkorDB):

- **Track 01: Agents That Act on Connected Data** — Multi-hop reasoning over service dependencies (`:Service-[:DEPENDS_ON]->:Service`), graph algorithms (`algo.pageRank`, `algo.betweenness`, BFS blast radius), tool selection through MCP (`mcp` Python SDK + `falkordb/mcpserver`), and explainable telemetry traces (`:AgentRun ➔ :ToolCall`).
- **Track 02: Agent Memory and Coordination** — Native FalkorDB episodic, semantic (with bi-temporal invalidation), and procedural playbooks; shared state and zero-race atomic task handoffs between Scout ➔ Planner ➔ Scribe; high concurrency (>2,700 ops/sec); and hard tenant isolation (`nexus_memory_acme` vs `nexus_memory_globex`).
- **Track 03: Company Brain** — Multi-source telemetry (Slack, Jira, GitHub, ADRs) unified into a bi-temporal decision graph resolving who owns what and reversing stale decisions with 0% stale rate.

### Rule 3 Compliance (FalkorDB Must Do Real Work)
```bash
# Verify Rule 3 by simulating a graph outage:
uv run --project api python scripts/demo_agents.py --graph-off
```
Result: The entire agent reasoning loop fails immediately (`ConnectionError: Connection refused`). If FalkorDB is removed, the product cannot function.


## AI assistance disclosure

Per Hackathon Rules 11–13: AI coding assistants (Google DeepMind AntiGravity / Claude Code) were used during development for scaffolding, architecture drafting, documentation, and test orchestration. All graph models, Cypher queries, business logic, and code were verified and are maintained by the author.

## Privacy and security

- All fixture data is synthetic.
- People nodes store `email_hash`, not plaintext email.
- `DELETE /api/sources/{event_id}` erases a source event and nodes derived only from it, and tombstones matching temporal facts.
- API keys and bearer tokens are masked in logs and stored run previews.
- The default `ADMIN_TOKEN` is a development placeholder. There is no user login: put the app behind your own auth proxy before exposing it.

## Limitations

1. **Simulated connectors.** Events arrive as webhook-style payloads or JSONL replay, not live Slack or Linear OAuth.
2. **Fact extraction.** In mock mode, temporal facts are mapped deterministically. In live mode, quality depends on the configured LLM.
3. **Docs search.** Without embedder keys, `nexus_docs` search uses graph metadata, section nodes and keyword scoring.

## Built on

- `web/` started as a fork of [FalkorDB Browser](https://github.com/FalkorDB/falkordb-browser) v2.3.1 (ELv2 / SSPL). The upstream code has since been removed; see [MODIFICATIONS.md](MODIFICATIONS.md). The upstream [LICENSE](web/LICENSE.txt) is kept.
- UI design language (chunky pixel panels, one pixel display face for signs) is inspired by [Munder Difflin](https://github.com/HarnessMD/munder-difflin) (MIT), used with the author's permission. The floor motion (walk-in, screen scroll, work halo, envelopes on an arc with an arrival ring) follows the timings of its office scene; the implementation is our own SVG code and no art assets were copied. Fonts: Press Start 2P and Atkinson Hyperlegible (SIL OFL) via `@fontsource`.
- [FalkorDB](https://github.com/FalkorDB/FalkorDB), [Graphiti](https://github.com/getzep/graphiti) (Apache-2.0), [GraphRAG-SDK](https://github.com/FalkorDB/GraphRAG-SDK), [react-force-graph](https://github.com/vasturiano/react-force-graph).
