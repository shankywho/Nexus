# NEXUS — Overnight Build Spec (AntiGravity)

> **AUTONOMY HEADER — read first.**
> You are building this project end-to-end, unattended. **Never stop to ask a question.** When something is ambiguous, pick the most reasonable option, log it in `DECISIONS.md` (format: `## D-### <title>` / Context / Choice / Why / How to undo), and keep going.
> After **every** phase: run the phase's tests, make sure `docker compose up` still boots, then `git commit -m "phase N: <deliverable>"`. **Never leave the repo broken.** If a phase can't be finished, stub it behind a feature flag, write a failing-but-skipped test with `TODO(phase N)`, log it in `DECISIONS.md`, and move on.
> Run with `MOCK_EXTERNALS=true` until real keys exist. The whole demo must work with **zero API keys**.
> **Appendix A is the source plan (written by Gemini). It is verbatim and must not be edited.** This spec is the implementation of that plan. If this spec and Appendix A ever disagree, follow Appendix A and log the conflict in `DECISIONS.md`.

---

## 1. Context

| Item | Value |
|---|---|
| Event | **Graph Hacks: Context for AI Agents** — WeMakeDevs × FalkorDB, online |
| Window | Oct 15, 12:01 AM IST → **Oct 18, 11:59 PM IST** (submission closes) |
| Track | **Track 03 — Company Brain** (prize: M6 Mac Mini) |
| Team | Solo (Shankar Pratap Singh), building with AntiGravity |
| Hard rule | FalkorDB must be the **primary graph DB** and power a **central** part of the product |
| Reuse rule | General libraries, templates and infrastructure may be reused. **The submission and its main FalkorDB implementation must be new work completed during the event.** → Everything under `api/nexus_api/` (ontology, ingest, projector, Cypher audits, provenance, ask agent) is **new code**. The upstream UI fork and Graphiti are reused libraries/templates. |
| AI assistants | Allowed; the author must be able to explain every part → keep code readable and documented |
| Deployment | Live deployment preferred; otherwise full local setup + working demo video |
| Side prize | Best blog post (AirPods) → stretch |

**Track 03 key focus (this is the judging lens — every bullet must be visibly demoed):**

1. Knowledge from docs, tickets, and chats in one graph → *Ingestion Streams (Slack / Jira / Docs)*
2. Who owns what, and who knows what → **[WHO OWNS WHAT]** + **[BUS FACTOR / SME FINDER]**
3. Tracing decisions back to their source → **[DECISION TRACE]**
4. Keeping knowledge current as things change → **[STALE / SUPERSEDED KNOWLEDGE]** + Graphiti bi-temporal invalidation + *Simulate Live Company Sync*
5. Answers with clear sources → **Temporal Conflict Resolution badge** in Ask panel

**Product one-liner:** *NEXUS // Organizational Telemetry & Decision Graph* — a company brain on FalkorDB that knows who owns what, why every decision was made, and which knowledge has gone stale. Each answer cites its current sources and lists the sources it has superseded.

**Chosen build (from Appendix A):** Strategy 3 (FalkorDB Browser + Graphiti) is the base. It also takes three items from the other strategies:
- Strategy 1 step 3 — the pre-loaded "company drama" synthetic dataset
- Strategy 2 — the Graphiti `add_episode()` ingest hook, and `react-force-graph-2d` for the "Live Company Topology" tab
- All "3 Quick Cosmetic Edits"
Not built: Cognee, SurfSense and PipesHub. They stay alternatives in the plan.

**Worked example (the core flow the demo must prove):**
1. Sep 18 2026 — `#eng-backend` Slack thread: Arjun, Priya and Meera argue about moving the **session store** from Postgres to Redis. Decision **DEC-017** is "Move session store to Redis".
2. Sep 19 — Linear **#391** "Migrate session store to Redis" (owner: Arjun).
3. Sep 22 — **ADR-038** "Session store on Redis" accepted.
4. Oct 2 (≈2 weeks later) — Incident **INC-77**: Redis eviction drops sessions. **PR #1184** "Revert session store to Postgres" merged by Priya.
5. Oct 12 — Linear **#409** produces **ADR-042** "Session store stays on Postgres (supersedes ADR-038)". This is decision **DEC-021**, and **DEC-017** becomes `superseded`.
6. A judge asks NEXUS: *"Where do we store sessions and why?"*
   NEXUS answers **Postgres**. The answer cites ADR-042 / Linear #409 / PR #1184 and renders:
   - `✓ CURRENT SOURCE: ADR-042 (2026-10-12) via Linear #409`
   - `✗ SUPERSEDED: #eng-backend Slack Thread (2026-09-18) — Invalidated`

**Money-shot metric (must be provable by `scripts/eval.py`):** On 10 gold questions, compare **NEXUS (graph + temporal)** with a **flat RAG baseline** (BM25 over the same raw texts, no graph). Report:
- `current_answer_accuracy` (target: NEXUS ≥ 0.9, baseline ≤ 0.5)
- `stale_answer_rate` (NEXUS 0.0, baseline ≥ 0.3)
- `answers_with_sources` (NEXUS 1.0)
- `superseded_sources_flagged` (NEXUS 1.0, baseline 0.0)

Mock mode must reproduce these numbers deterministically.

**Positioning constraints:** synthetic company "Acme Payments" only. Use no real company names in fixtures. Make no claims of real Slack/Jira/Linear integrations; the UI says *"Simulated sync"* where the data is simulated.

---

## 2. Tech stack (non-negotiable unless broken; log any swap in DECISIONS.md)

| Concern | Choice |
|---|---|
| Graph DB | **FalkorDB** `falkordb/falkordb:latest` (Docker). Publish **only 6379**; our own UI owns port 3000 |
| Graph layout | FalkorDB multigraph. Separate graphs: `nexus_company` (typed ontology, new code), `nexus_temporal` (Graphiti), `nexus_docs` (GraphRAG-SDK) |
| Temporal engine | **Graphiti** `graphiti-core[falkordb]` with `FalkorDriver(host, port, database="nexus_temporal")` |
| Docs GraphRAG | **FalkorDB GraphRAG-SDK** (Python), graph `nexus_docs` |
| MCP | **FalkorDB-MCPServer** as a compose service (agent tool access to the graph) |
| Backend | Python 3.11, **FastAPI**, uvicorn, pydantic v2, `uv` for deps, `falkordb` Python client |
| Tracing store | SQLite (`var/nexus.db`, stdlib `sqlite3`), `Run` + `Step` tables |
| Frontend | **Fork of `FalkorDB/falkordb-browser`** (Next.js + TypeScript, pinned to tag `v2.3.1`) in `web/`. **Node 22 LTS** (≥ 22.18 so upstream `node --test` works) |
| Topology canvas | `react-force-graph-2d` for the *Live Company Topology* tab (needs dashed red / solid green edges). Upstream canvas stays for the raw Cypher explorer |
| LLM | `LLM_PROVIDER=openai` (Graphiti default) or `gemini`. Mock client when `MOCK_EXTERNALS=true` |
| Tests | pytest + pytest-asyncio + httpx (API); upstream `npm test` + `npm run lint` + `npm run build` (web); 1 Playwright smoke for the 4 audit buttons |
| Lint | ruff + mypy (strict on `nexus_api/`), eslint (upstream config) |
| Orchestration | `docker-compose.yml` with `falkordb`, `api`, `web`, `mcp` |

---

## 3. Phase 0 — Verify integration contracts

Write findings to `docs/CONTRACTS.md` (what you verified, against which file or version, and what differed). Every external service sits behind an adapter in `api/nexus_api/adapters/`, and each adapter has a deterministic mock selected by `MOCK_EXTERNALS`.

**Best-known contracts. These are UNVERIFIED; check them against the source before coding.**

| # | Contract | Assumed shape | Verify in |
|---|---|---|---|
| C1 | Graphiti FalkorDB driver | `from graphiti_core.driver.falkordb_driver import FalkorDriver`; `FalkorDriver(host, port, username=None, password=None, database="nexus_temporal")`; `Graphiti(graph_driver=driver, llm_client=..., embedder=...)`; `await graphiti.build_indices_and_constraints()` | graphiti README + `graphiti_core/driver/falkordb_driver.py` |
| C2 | `add_episode` | `await graphiti.add_episode(name: str, episode_body: str, source: EpisodeType, source_description: str, reference_time: datetime, group_id: str) -> AddEpisodeResults` (has `.episode.uuid`, `.edges`, `.nodes`) | `graphiti_core/graphiti.py` |
| C3 | `search` | `await graphiti.search(query: str, group_ids: list[str], num_results: int = 10) -> list[EntityEdge]`; `EntityEdge` has `uuid, fact, name, source_node_uuid, target_node_uuid, valid_at, invalid_at, expired_at, episodes: list[str], created_at` | `graphiti_core/edges.py` |
| C4 | Graphiti storage schema in FalkorDB | Nodes `:Entity`, `:Episodic`; edges `[:RELATES_TO]` (fact edges, temporal fields), `[:MENTIONS]` (Episodic→Entity). The mock adapter must write **this same schema** | Run C2 live once (if a key exists) or read `graphiti_core/models/` Cypher |
| C5 | falkordb-browser | Next.js App Router in `app/`, NextAuth (`auth.ts`, needs `NEXTAUTH_SECRET`, `NEXTAUTH_URL`), `.env.local.template`, connects to FalkorDB over the Redis protocol, login page takes host/port/user/pass | Repo at tag `v2.3.1` |
| C6 | falkordb-browser canvas | Identify the canvas component, whether it supports per-edge dash/colour, and the node inspector component | `app/` + `components/` search |
| C7 | GraphRAG-SDK | `KnowledgeGraph`, `Ontology.from_sources`, `Source`, `kg.process_sources`, `kg.chat_session().send_message(q)`; model wrappers `LiteModel` | GraphRAG-SDK README |
| C8 | FalkorDB-MCPServer | Run command, env vars (`FALKORDB_HOST`, `FALKORDB_PORT`), transport (stdio/HTTP), exposed tools | Its README |
| C9 | Graphiti telemetry | `GRAPHITI_TELEMETRY_ENABLED=false` disables it | README |

**Rules:**
- Ingest endpoints parse with tolerant pydantic models (`model_config = ConfigDict(extra="allow")`). An unexpected payload returns `202` and is stored raw in `:SourceEvent {raw_json}`. **Never 500 on a bad payload.**
- If C5/C6 shows the upstream canvas can't do dashed or per-status edges, use `react-force-graph-2d` (its `linkLineDash`) for the topology tab. Appendix A already names it.
- If the MCP server (C8) won't run within 30 minutes of effort, comment it out of compose, log the decision, and continue.

**Done when:** `docs/CONTRACTS.md` exists with a ✅/⚠️ per row, `docker compose up falkordb api` boots, and `curl :8000/health` returns `{"status":"ok","falkordb":"up","mock":true}`.

---

## 4. Repo structure

```
nexus/
├── README.md                     # judge-facing (see §15)
├── DECISIONS.md                  # every assumption, D-### numbered
├── MODIFICATIONS.md              # Elastic-2.0 / SSPL "prominent notice of modification" for web/ (dated)
├── docker-compose.yml            # falkordb, api, web, mcp
├── .env.example
├── Makefile                      # setup, up, seed, sync, eval, test, lint, reset
├── docs/
│   ├── CONTRACTS.md              # Phase 0 findings
│   └── architecture.md           # mermaid sources mirrored in README
├── fixtures/company/
│   ├── people.json               # 12 people, 4 teams
│   ├── services.json             # 8 services, 3 projects, ownership
│   ├── events.jsonl              # EXACTLY 50 events (slack, linear, github_pr, notion, adr, incident)
│   ├── docs/ADR-038.md           # session store on Redis
│   ├── docs/ADR-042.md           # supersedes ADR-038
│   ├── docs/RUNBOOK-payments.md
│   └── gold_questions.json       # 10 eval Qs with gold answers + gold source ids
├── scripts/
│   ├── setup.sh                  # uv sync, npm ci, cp .env.example .env
│   ├── seed.py                   # loads people/services + all 50 events instantly
│   ├── replay.py                 # drives POST /api/sync/simulate or raw /api/ingest/event (for demo recording)
│   ├── eval.py                   # prints money-shot table, writes var/eval.json
│   └── reset.py                  # drops all nexus_* graphs + sqlite runs
├── api/
│   ├── pyproject.toml
│   ├── nexus_api/
│   │   ├── main.py               # FastAPI app factory, routers, static /debug
│   │   ├── config.py             # pydantic-settings, reads .env
│   │   ├── models/
│   │   │   ├── events.py         # SourceEventIn (tolerant), typed payloads per kind
│   │   │   ├── ontology.py       # node/edge enums + pydantic node models
│   │   │   └── api.py            # request/response schemas (AskResponse, AuditResult…)
│   │   ├── routes/               # thin: parse → service → respond. NO logic here
│   │   │   ├── health.py  audits.py  ask.py  sync.py  ingest.py
│   │   │   ├── provenance.py  graph.py  events.py (SSE)  runs.py  admin.py
│   │   ├── services/
│   │   │   ├── ingest.py         # pipeline orchestrator (see §9)
│   │   │   ├── projector.py      # event → typed MERGE Cypher on nexus_company
│   │   │   ├── supersession.py   # deterministic decision lifecycle
│   │   │   ├── derive.py         # KNOWS_ABOUT weights, degree centrality
│   │   │   ├── audits.py         # runs the 4 Quick Audit Cypher files
│   │   │   ├── provenance.py     # current vs superseded sources for a decision/answer
│   │   │   ├── ask_agent.py      # router → tools → answer (see §8)
│   │   │   ├── baseline_rag.py   # BM25 flat-RAG baseline for eval
│   │   │   ├── sync_replayer.py  # timed replay of events.jsonl
│   │   │   ├── eventbus.py       # in-proc pub/sub → SSE
│   │   │   └── tracing.py        # Run/Step persistence (sqlite)
│   │   ├── adapters/
│   │   │   ├── falkor.py         # FalkorDB client wrapper (query, params, timeouts) — real only (it's local)
│   │   │   ├── temporal.py       # TemporalGraph interface; GraphitiTemporal + MockTemporal
│   │   │   ├── llm.py            # LLM interface; OpenAI/Gemini + MockLLM
│   │   │   └── docs_rag.py       # GraphRAG-SDK adapter + MockDocsRag
│   │   ├── cypher/
│   │   │   ├── schema.cypher            # indexes
│   │   │   ├── who_owns_what.cypher
│   │   │   ├── decision_trace.cypher
│   │   │   ├── stale_knowledge.cypher
│   │   │   └── bus_factor.cypher
│   │   ├── agents/prompts/
│   │   │   ├── router.md
│   │   │   └── answer.md
│   │   └── static/debug.html     # no-build live trace console
│   └── tests/
│       ├── unit/   integration/   conftest.py
└── web/                          # fork of FalkorDB/falkordb-browser @ v2.3.1 — KEEP LICENSE.txt + all copyright notices
    ├── LICENSE.txt               # untouched
    ├── app/nexus/                # NEW: NEXUS shell route (default landing)
    │   ├── page.tsx              # tabs: Live Company Topology | Ask NEXUS | Cypher Explorer (upstream)
    │   └── layout.tsx
    ├── components/nexus/         # NEW
    │   ├── AuditBar.tsx          # 4 Quick Audit buttons
    │   ├── LiveTopology.tsx      # react-force-graph-2d, status-styled edges
    │   ├── AskPanel.tsx          # chat + ProvenanceBadge
    │   ├── ProvenanceBadge.tsx
    │   ├── SimulateSyncButton.tsx
    │   ├── IngestionStreams.tsx  # left rail: Slack / Jira / Docs counters (SSE)
    │   └── NodeInspector.tsx     # reuse/wrap upstream inspector if feasible
    ├── lib/nexus/api.ts          # typed client for /api/nexus/* (proxied to FastAPI)
    └── next.config.js            # add rewrite /api/nexus/:path* → http://api:8000/api/:path*
```

---

## 5. Environment — `.env.example`

```dotenv
# --- core ---
MOCK_EXTERNALS=true                 # true = zero-key mode (deterministic mocks for Graphiti LLM, ask LLM, GraphRAG-SDK)
NEXUS_ORG_ID=acme                   # Graphiti group_id + tenancy key on every node
LOG_LEVEL=info

# --- FalkorDB ---
FALKORDB_HOST=falkordb
FALKORDB_PORT=6379
FALKORDB_USERNAME=
FALKORDB_PASSWORD=
GRAPH_COMPANY=nexus_company
GRAPH_TEMPORAL=nexus_temporal
GRAPH_DOCS=nexus_docs
QUERY_TIMEOUT_MS=5000

# --- LLM (only when MOCK_EXTERNALS=false) ---
LLM_PROVIDER=openai                 # openai | gemini
OPENAI_API_KEY=
GOOGLE_API_KEY=
LLM_MODEL=gpt-4.1-mini
EMBEDDING_MODEL=text-embedding-3-small
SEMAPHORE_LIMIT=4                   # Graphiti concurrency; keep low to avoid 429s
GRAPHITI_TELEMETRY_ENABLED=false

# --- API ---
API_PORT=8000
ADMIN_TOKEN=change-me               # required header X-Admin-Token on /api/admin/* and DELETE routes
CORS_ORIGINS=http://localhost:3000

# --- web (falkordb-browser fork) ---
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-only-change-me
NEXUS_API_URL=http://api:8000
NEXT_PUBLIC_DEFAULT_FALKOR_HOST=falkordb
NEXT_PUBLIC_DEFAULT_FALKOR_PORT=6379

# --- sync simulation ---
SYNC_DEFAULT_INTERVAL_MS=600        # 50 events × 600ms ≈ 30s replay
```

Auth: all read routes are open (local demo). Routes under `/api/admin/*`, `DELETE /api/sources/*` and `POST /api/sync/simulate?reset=true` require `X-Admin-Token`.

---

## 6. Data model

### 6a. `nexus_company` — typed ontology (NEW work; written only by `projector.py`)

Every node carries `org_id`, `id` (stable business key), `source_event_ids: [str]`, `created_at`, `updated_at`.

| Label | Key props |
|---|---|
| `Person` | `id` (handle, e.g. `arjun`), `name`, `role`, `email_hash` (never raw email) |
| `Team` | `id`, `name` |
| `Service` | `id` (e.g. `session-store`), `name`, `tier` (1–3) |
| `Project` | `id`, `name`, `status` |
| `Decision` | `id` (`DEC-017`), `title`, `summary`, `status` ∈ `proposed|active|superseded`, `decided_at`, `superseded_at`, `superseded_by` |
| `SlackThread` | `id` (`slack:eng-backend:1758172800`), `channel`, `ts`, `summary`, `url` (fake `https://acme.slack.example/...`) |
| `Ticket:JiraTicket` | `id` (`LIN-409`), `system` ∈ `linear|jira`, `title`, `status`, `created_at`, `url` |
| `Document` | `id` (`ADR-042`), `kind` ∈ `adr|notion|runbook`, `title`, `created_at`, `url`, `doc_path` |
| `PullRequest` | `id` (`PR-1184`), `repo`, `number`, `merged_at`, `url` |
| `Incident` | `id` (`INC-77`), `severity`, `started_at`, `summary` |
| `SourceEvent` | `id` (event id), `kind`, `ts`, `raw_json`, `episode_uuid` (Graphiti), `ingested_at` |

| Edge | Pattern | Props |
|---|---|---|
| `MEMBER_OF` | Person→Team | |
| `OWNS` | Team\|Person→Service\|Project | `since` |
| `MAINTAINS` | Person→Service | `since` |
| `AUTHORED` | Person→SlackThread\|Ticket\|Document\|PullRequest | |
| `PARTICIPATED_IN` | Person→SlackThread | `messages` (int) |
| `DECIDED_IN` | Decision→SlackThread\|Document | `status` (mirrors decision) |
| `TRACKED_BY` | Decision→Ticket | `status` |
| `DOCUMENTED_IN` | Decision→Document | `status` |
| `IMPLEMENTED_BY` | Ticket→PullRequest | |
| `AFFECTS` | Decision\|Incident\|PullRequest→Service | |
| `SUPERSEDES` | Decision→Decision | `at`, `reason`, `via` (source id) |
| `REVERSES` | PullRequest→Decision | |
| `TRIGGERED` | Incident→PullRequest\|Decision | |
| `KNOWS_ABOUT` | Person→Service | `weight` (float, derived), `evidence_count` |
| `DERIVED_FROM` | any typed node→SourceEvent | |

**Edge-status rule (drives red-dashed vs green in the UI):** whenever a `Decision.status` becomes `superseded`, set `status='superseded'` on all of its `DECIDED_IN`, `TRACKED_BY` and `DOCUMENTED_IN` edges in the same transaction. Active decisions carry `status='active'`.

**`cypher/schema.cypher`** (idempotent; run at startup):
```cypher
CREATE INDEX FOR (n:Person) ON (n.id)
CREATE INDEX FOR (n:Service) ON (n.id)
CREATE INDEX FOR (n:Decision) ON (n.id)
CREATE INDEX FOR (n:Decision) ON (n.status)
CREATE INDEX FOR (n:Ticket) ON (n.id)
CREATE INDEX FOR (n:Document) ON (n.id)
CREATE INDEX FOR (n:PullRequest) ON (n.id)
CREATE INDEX FOR (n:SlackThread) ON (n.id)
CREATE INDEX FOR (n:SourceEvent) ON (n.id)
CREATE INDEX FOR (n:Team) ON (n.id)
```
(If FalkorDB errors on an existing index, catch and ignore. Log it in CONTRACTS.md.)

**Tenancy:** every Cypher in `nexus_api` filters `org_id = $org_id`. Every Graphiti call passes `group_id=$org_id` / `group_ids=[$org_id]`. Test `test_tenancy_isolation` seeds `org_id=acme` and `org_id=globex` and asserts no cross-org rows from any audit or from ask.

### 6b. `nexus_temporal` — Graphiti-owned

Do not write here directly except from `MockTemporal`. MockTemporal must mirror Graphiti's schema (C4) so the UI and provenance code are identical in both modes. Mock facts come from each fixture event's `facts` array (see §12).

### 6c. `nexus_docs` — GraphRAG-SDK-owned (ADR / Notion / runbook markdown)

### 6d. SQLite tracing (`var/nexus.db`)

```sql
CREATE TABLE runs (id TEXT PRIMARY KEY, kind TEXT, input_json TEXT, status TEXT, started_at TEXT, ended_at TEXT, error TEXT);
CREATE TABLE steps (id TEXT PRIMARY KEY, run_id TEXT REFERENCES runs(id), node TEXT, started_at TEXT, latency_ms INTEGER,
                    status TEXT, input_preview TEXT, output_preview TEXT, graph TEXT, cypher TEXT, hits_json TEXT);
CREATE INDEX steps_run ON steps(run_id);
```
`kind` ∈ `ingest|ask|audit|sync|eval`. One `run_id` (ULID) traces everything.

---

## 7. (Reserved — no relational schema; FalkorDB + SQLite only. Log in DECISIONS.md: "No Postgres: plan is FalkorDB-only; tracing in SQLite.")

---

## 8. Agents / core logic

Prompts live in `api/nexus_api/agents/prompts/*.md` and are the source of truth. All LLM calls: JSON-only output, parsed with pydantic, **one repair retry** (send the validation error back), then **graceful degrade** (return tool results without prose, plus `degraded: true`).

### 8a. Router (`router.md`, temperature 0)
- **Input:** user question.
- **Output:**
```json
{"intents": ["ownership"|"expertise"|"decision"|"staleness"|"general"],
 "entities": ["session store", "Redis"],
 "service_ids": ["session-store"],
 "decision_ids": [],
 "time_scope": "current"|"historical"|"as_of",
 "as_of": null}
```
- **Code-side validation:** keep only `service_ids` / `decision_ids` that exist in `nexus_company` (drop hallucinated ones). `MockLLM` = keyword rules (`own|owner`→ownership, `who knows|expert|bus factor`→expertise, `why|decid`→decision, `still|current|stale|outdated`→staleness).

### 8b. Tools (pure Python, no LLM)
| Tool | Does |
|---|---|
| `audit(name, params)` | runs one of the 4 Cypher files |
| `decision_trace(decision_id \| service_id)` | path Decision→sources, includes SUPERSEDES chain |
| `temporal_search(query)` | `TemporalGraph.search` → edges with `valid_at/invalid_at/episodes` |
| `docs_search(query)` | GraphRAG-SDK over `nexus_docs` (mock: keyword match on fixture docs) |
| `provenance(decision_ids)` | builds `current_sources[]` / `superseded_sources[]` |

### 8c. Answerer (`answer.md`, temperature 0.2)
- **Input:** question + tool results (truncated to 6k tokens).
- **Output:**
```json
{"answer": "Sessions are stored in Postgres. ADR-042 (2026-10-12) reverted the Redis move after INC-77 ...",
 "current_sources": [{"id":"ADR-042","label":"ADR-042","date":"2026-10-12","via":"LIN-409"}],
 "superseded_sources": [{"id":"slack:eng-backend:1758172800","label":"#eng-backend Slack Thread","date":"2026-09-18","reason":"Invalidated by DEC-021"}],
 "path": ["DEC-021","ADR-042","LIN-409","PR-1184"],
 "owners": [{"person":"priya","role":"MAINTAINS session-store"}],
 "confidence": 0.86}
```
- **Code-side validation:** every `id` in `current_sources`, `superseded_sources` and `path` must exist in `nexus_company` or `nexus_temporal`; drop unknowns and log a `hallucinated_id_dropped` step. If `current_sources` is empty after validation, set `confidence ≤ 0.3` and prefix the answer with "Low confidence:".
- **Rule:** a source whose decision is `superseded`, or whose temporal edge has `invalid_at` set, can **never** appear in `current_sources`. This is enforced in code, not left to the prompt.
- `MockLLM` answerer: template = first sentence from the current decision summary + "Supersedes: ..." + owners. Deterministic.

---

## 9. Pipelines & state machines

### 9a. Ingest pipeline (sync, target p95 < 300 ms mock / < 8 s live)

```
POST /api/ingest/event  or  sync_replayer
        │
        ▼
 [validate (tolerant)] ──bad──▶ store raw :SourceEvent, 202, step=rejected_shape
        │
        ▼
 [upsert :SourceEvent]  (idempotent on event.id — repeat ⇒ 200 {"duplicate":true}, no re-ingest)
        │
        ├──────────────▶ [projector: typed MERGE on nexus_company]
        │                         │
        │                         ▼
        │                [supersession: apply lifecycle]
        │                         │
        │                         ▼
        │                [derive: KNOWS_ABOUT + centrality]
        │
        └──────────────▶ [temporal: add_episode(group_id=org)]  → store episode_uuid on SourceEvent
                                  │
                                  ▼
                       [eventbus.publish(graph.delta)] → SSE
```
Projector and temporal run concurrently (`asyncio.gather`). Temporal failure does **not** fail ingest: mark `temporal_status='failed'` on SourceEvent and emit a `step.error` event.

### 9b. Decision lifecycle (deterministic, `supersession.py`)

```
proposed ──(adr accepted | ticket created with decision_ref)──▶ active
active ──(event.supersedes = DEC-x  |  PR.reverses = DEC-x  then new decision accepted)──▶ superseded
active ──(PR.reverses = DEC-x, no replacement yet)──▶ active + flag `contested=true`
superseded ──(never transitions back)
```
On `→ superseded`: set `status`, `superseded_at`, `superseded_by`, create `(:Decision new)-[:SUPERSEDES {at, reason, via}]->(:Decision old)`, flip edge statuses (§6a), and publish `decision.superseded` on the bus.

### 9c. Sync replay (async background task)

`POST /api/sync/simulate {interval_ms?, reset?}` → `run_id`. Replays `events.jsonl` in `ts` order through the **same** ingest pipeline as 9a, one event per `interval_ms`. States: `idle → running → completed | cancelled | failed`. `POST /api/sync/cancel` is available. Only one sync can run at a time; a second request gets `409`.

### 9d. Ask (sync, p95 < 1.5 s mock / < 10 s live)
`router → (tools in parallel) → answerer → validate → provenance → respond`. Each arrow is a `Step`.

---

## 10. HTTP API (FastAPI, `:8000`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{status, falkordb, mock, graphs:{company:n_nodes, temporal:n_nodes, docs:n_nodes}}` |
| POST | `/api/ingest/event` | webhook-style ingest of one SourceEvent (tolerant) |
| POST | `/api/sync/simulate` | start the "Simulate Live Company Sync" replay |
| GET | `/api/sync/status` | `{state, processed, total, run_id}` |
| POST | `/api/sync/cancel` | cancel the replay |
| POST | `/api/audits/who-owns-what` | `{nodes, edges, highlight_ids, cypher, run_id}` |
| POST | `/api/audits/decision-trace` | body `{decision_id? , service_id?}`; default = latest superseded chain |
| POST | `/api/audits/stale-knowledge` | superseded decisions + edges with `status` |
| POST | `/api/audits/bus-factor` | top-N persons by degree centrality per service |
| POST | `/api/ask` | `{question}` → AskResponse (§8c) + `run_id` |
| GET | `/api/provenance/{decision_id}` | current vs superseded sources for one decision |
| GET | `/api/graph/topology` | full `nexus_company` graph as `{nodes, links}` for react-force-graph (with `status`) |
| GET | `/api/graph/temporal/edges?entity=` | Graphiti facts with valid/invalid windows |
| GET | `/api/events/stream` | **SSE** (§11) |
| GET | `/api/runs?kind=&limit=` / `/api/runs/{id}` | trace inspection |
| GET | `/api/sources` | list SourceEvents (privacy listing) |
| DELETE | `/api/sources/{event_id}` | delete event + `DERIVED_FROM`-only nodes + Graphiti episode (`remove_episode` if available, else mark) |
| POST | `/api/admin/reset` | drop all `nexus_*` graphs (admin token) |
| GET | `/debug` | `static/debug.html` |

Every response includes a `run_id`. Every error is `{error:{code,message,run_id}}`.

### The 4 Quick Audit Cypher files (from Appendix A; parameterize with `$org_id`)

`who_owns_what.cypher`
```cypher
MATCH (p:Person {org_id:$org_id})-[r:OWNS|MAINTAINS]->(t)
WHERE t:Service OR t:Project
OPTIONAL MATCH (p)-[:MEMBER_OF]->(team:Team)
RETURN p, r, t, team
```
`decision_trace.cypher`
```cypher
MATCH (d:Decision {org_id:$org_id})
WHERE ($decision_id IS NULL OR d.id = $decision_id)
  AND ($service_id IS NULL OR (d)-[:AFFECTS]->(:Service {id:$service_id}))
OPTIONAL MATCH p1 = (d)-[:DECIDED_IN|DOCUMENTED_IN|TRACKED_BY]->(src)
OPTIONAL MATCH p2 = (d)-[:SUPERSEDES*1..3]->(old:Decision)
OPTIONAL MATCH p3 = (old)-[:DECIDED_IN|DOCUMENTED_IN|TRACKED_BY]->(oldsrc)
OPTIONAL MATCH p4 = (src)-[:IMPLEMENTED_BY]->(pr:PullRequest)
RETURN d, p1, p2, p3, p4
```
`stale_knowledge.cypher`
```cypher
MATCH (d:Decision {org_id:$org_id})-[e:DECIDED_IN|DOCUMENTED_IN|TRACKED_BY]->(s)
RETURN d, e, s, e.status AS status
ORDER BY d.decided_at DESC
```
`bus_factor.cypher` (degree centrality; if the FalkorDB algorithm procedures are available, add a PageRank variant, verify in Phase 0, and log it)
```cypher
MATCH (p:Person {org_id:$org_id})-[r]-()
WITH p, count(r) AS degree
OPTIONAL MATCH (p)-[k:KNOWS_ABOUT]->(s:Service)
RETURN p, degree, collect({service:s.id, weight:k.weight}) AS expertise
ORDER BY degree DESC LIMIT 10
```

---

## 11. Observability (scored — treat it as a feature)

**Event bus → SSE `/api/events/stream`.** Event types:
`ingest.received`, `ingest.projected`, `temporal.episode_added`, `decision.superseded`, `graph.delta` (`{added_nodes, added_edges, updated_edges}` for live canvas updates), `audit.ran`, `ask.step`, `ask.completed`, `sync.progress`, `step.error`.

Every step event includes `{run_id, step_id, node, latency_ms, status, output_preview (≤300 chars), graph, cypher?, hits?: [{id, score}]}`.

**`/debug` (`static/debug.html`, no build step, vanilla JS + EventSource):**
- Left: live event log (colour by type, red for errors)
- Middle: the selected run's steps as a waterfall (latency bars)
- Right: last Cypher executed + row count, and the Graphiti facts with valid/invalid windows
- Top: buttons for Seed, Simulate Sync, Reset, and one per audit. This page doubles as a backup demo console if the web app breaks.

The web app's `IngestionStreams` rail subscribes to the same SSE stream (counters for Slack / Jira / Docs ticking up during sync). `LiveTopology` applies `graph.delta` without a full refetch.

---

## 12. Fixtures, seed, eval

**Company: Acme Payments.** 12 people, 4 teams (`platform`, `payments-core`, `growth`, `sre`), 8 services (`session-store`, `auth-gateway`, `ledger`, `payouts`, `fraud-scorer`, `notifications`, `web-checkout`, `metrics-pipeline`), 3 projects.

**Anchor people:** Arjun (platform, pro-Redis), Priya (platform, maintains `session-store`, pro-Postgres), Meera (sre, on-call for INC-77). The rest are fillers chosen to give a real bus-factor story: `ledger` known only by **Kabir**, so bus factor = 1.

**`events.jsonl` — exactly 50 lines.** Each line follows this format:
```json
{"id":"evt-0007","org_id":"acme","kind":"slack_message|slack_thread|linear_ticket|github_pr|adr|notion_doc|incident",
 "ts":"2026-09-18T10:42:00Z","actor":"arjun","channel":"eng-backend","thread_id":"slack:eng-backend:1758172800",
 "text":"Postgres row locks on sessions are killing p99. Moving sessions to Redis cuts it to <5ms.",
 "refs":{"service_ids":["session-store"],"decision_id":"DEC-017","ticket_id":null,"doc_id":null,"pr_id":null},
 "supersedes":null,"reverses":null,
 "facts":[{"subject":"session-store","predicate":"STORED_IN","object":"Redis","valid_at":"2026-09-18T10:42:00Z","invalid_at":null}]}
```
`facts` is used **only** by MockTemporal. Live mode ignores it, and Graphiti extracts its own facts.

**Mandatory anchor events (must exist with these ids/dates):**
| ts (2026) | id/kind | content |
|---|---|---|
| 09-18 | 6 × slack_message in `slack:eng-backend:1758172800` | Arjun/Priya/Meera argue; closes with "decision: move sessions to Redis" → DEC-017 proposed |
| 09-19 | linear_ticket `LIN-391` | "Migrate session store to Redis", owner arjun, decision_id DEC-017 → DEC-017 active |
| 09-22 | adr `ADR-038` | "Session store on Redis" (docs/ADR-038.md) |
| 09-26 | github_pr `PR-1150` | Redis session store implementation, implements LIN-391 |
| 10-02 | incident `INC-77` | Redis eviction under memory pressure drops 12% of sessions; Meera on-call |
| 10-02 | github_pr `PR-1184` | "Revert session store to Postgres", by priya, `reverses: DEC-017` |
| 10-09 | linear_ticket `LIN-409` | "Ratify session store on Postgres", decision_id DEC-021 |
| 10-12 | adr `ADR-042` | "Session store stays on Postgres (supersedes ADR-038)", `supersedes: DEC-017`; facts invalidate `STORED_IN Redis` (invalid_at 10-02) and assert `STORED_IN Postgres` |

The other ~35 events are realistic filler: payouts retries, fraud-scorer model swap (a **second** supersession chain, DEC-024→DEC-026, so stale-knowledge doesn't show just one), Notion onboarding docs, ledger PRs that are all by Kabir, and growth-team chatter. All of it is plausible. No lorem ipsum.

**`gold_questions.json`** (10 items: `{q, gold_answer_contains:[...], gold_current_source_ids:[...], stale_trap_terms:[...]}`), e.g.:
1. "Where do we store user sessions?" → contains `Postgres`; trap `Redis`
2. "Why did we stop using Redis for sessions?" → `INC-77`, `eviction`
3. "Who owns the session store?" → `priya`
4. "Who is the only person who knows the ledger?" → `kabir`
5. "What is the current fraud scoring model decision?" → DEC-026 content; trap DEC-024 content
6. "Which decisions were superseded this quarter?" → DEC-017, DEC-024
7. "Trace the decision behind PR-1184" → DEC-017, LIN-391, INC-77
8. "Is ADR-038 still valid?" → `no`/`superseded`, `ADR-042`
9. "Who should review a change to auth-gateway?" → its maintainer(s)
10. "What changed about sessions since September?" → Redis→Postgres with dates

**`scripts/eval.py`:** runs every question through `/api/ask` (NEXUS) and through `baseline_rag.answer` (BM25 top-3 raw texts; answer = the top-ranked text). Then it prints:
```
metric                       NEXUS   FLAT-RAG
current_answer_accuracy      1.00    0.40
stale_answer_rate            0.00    0.50
answers_with_sources         1.00    1.00
superseded_sources_flagged   1.00    0.00
p95_latency_ms               ...     ...
```
It writes `var/eval.json` and exits non-zero if NEXUS `current_answer_accuracy < 0.9` in mock mode.

**`scripts/replay.py`:** `--mode simulate` calls `/api/sync/simulate`. `--mode raw --interval 600` POSTs each line to `/api/ingest/event`, which exercises the real webhook route. Used for recording the demo video.

**`scripts/seed.py`:** loads people and services, then ingests all 50 events instantly (interval 0). Supports `--until 2026-09-30` to seed only the "before" state, so the sync visibly invalidates DEC-017 live in the demo.

---

## 13. Privacy & safety

- Synthetic data only. Keep `email_hash` and never raw emails. No real company or person names.
- `DELETE /api/sources/{id}` removes the SourceEvent, any node whose only `DERIVED_FROM` is that event, and the Graphiti episode (or tombstones it if removal isn't supported; log which).
- Logs: never log full event text above 300 chars or any key. Redact `*_KEY`, `*_SECRET`, `*_TOKEN` from settings dumps.
- Retention: `var/` is gitignored, and `make reset` wipes it.
- UI copy: "Simulated sync". Never imply live Slack/Jira/Linear OAuth.
- Licensing: `web/LICENSE.txt` and every upstream copyright notice stay intact (Elastic License 2.0 forbids removing or obscuring them). `MODIFICATIONS.md` states that `web/` is a modified version of FalkorDB Browser, with the date. Keep Graphiti's Apache-2.0 attribution. The repo is public, which covers SSPL §13 if deployed.

---

## 14. Testing requirements (all runnable with `MOCK_EXTERNALS=true` against the compose FalkorDB)

**Unit (`api/tests/unit/`):**
- `test_event_parsing_tolerant` — unknown fields kept; missing optional refs OK; garbage → rejected_shape, no exception
- `test_projector_idempotent` — same event twice gives identical node/edge counts
- `test_supersession_flow` — DEC-017 active → PR-1184 reverses (contested) → ADR-042 supersedes, so status, `SUPERSEDES` edge and edge statuses all flip
- `test_superseded_never_current` — answerer validation strips superseded sources from `current_sources` even if the mock LLM puts them there
- `test_hallucinated_ids_dropped`
- `test_router_mock_intents`
- `test_mock_temporal_schema_matches_graphiti` — MockTemporal writes `:Entity`, `:Episodic`, `[:RELATES_TO {valid_at, invalid_at, episodes}]`
- `test_baseline_rag_deterministic`

**Integration (`api/tests/integration/`), numbered:**
1. `/health` reports `falkordb: up`, `mock: true`
2. Seed `--until 2026-09-30`: ask "Where do we store user sessions?" → answer contains `Redis` (correct for that point in time)
3. Ingest the remaining events → the same question now answers `Postgres`, with `superseded_sources` containing the Sep 18 Slack thread
4. Provenance badge payload for DEC-021 matches §1 exactly (`ADR-042 (2026-10-12) via LIN-409` / `#eng-backend Slack Thread (2026-09-18)`)
5. Each of the 4 audits returns non-empty `nodes` and the correct `highlight_ids` (bus-factor top for `ledger` = kabir)
6. Stale-knowledge returns DEC-017 and DEC-024 edges with `status='superseded'`
7. `/api/sync/simulate` processes 50/50, emits `sync.progress` events over SSE, and a second call while running → 409
8. Duplicate event id → `{"duplicate":true}`, counts unchanged
9. Malformed webhook → 202, stored raw, no 500
10. `DELETE /api/sources/evt-…` removes the derived-only nodes
11. Tenancy isolation (acme vs globex)
12. `scripts/eval.py` exits 0 and meets the §1 targets

**Web:** `npm run lint`, `npm run build`, upstream `npm test` still green, and Playwright `e2e/nexus.spec.ts` clicks each Quick Audit button and asserts the canvas highlight count > 0.

---

## 15. README requirements (judge-facing)

1. **Name + one-liner + 1 hero GIF/screenshot** of the HUD with the provenance badge
2. **Track 03 mapping table:** each of the 5 key-focus bullets → the feature → the file path
3. **Architecture (mermaid):** web (Next.js fork) → FastAPI → FalkorDB (`nexus_company` / `nexus_temporal` / `nexus_docs`) + Graphiti + GraphRAG-SDK + MCP server
4. **Ingest pipeline diagram (mermaid)** from §9a, plus the decision lifecycle state diagram
5. **FalkorDB usage table:** every graph, every Cypher file, and the multigraph tenancy story, each with paths
6. **Quickstart:** `make setup && make up && make seed && open http://localhost:3000`
7. **Zero-key mode** explanation
8. **Eval results** table (pasted from `var/eval.json`)
9. **API summary** (§10 condensed)
10. **Privacy** (§13)
11. **Built on (credits):** FalkorDB Browser (modified, see MODIFICATIONS.md, SSPL/ELv2), Graphiti (Apache-2.0), GraphRAG-SDK, FalkorDB-MCPServer, react-force-graph. **What is new work during the event:** the entire `api/nexus_api/` (ontology, projector, supersession, audits, provenance, ask agent, eval), the `components/nexus/*` UI, and the fixtures
12. **Honest limitations:** simulated connectors, mock-mode facts are hand-authored, and Graphiti live extraction depends on LLM quality

---

## 16. Build order (do not skip phases; do not start stretch early)

| # | Phase | Deliverable | Done when |
|---|---|---|---|
| 0 | Scaffold + contracts | repo tree, compose (falkordb+api), `/health`, `docs/CONTRACTS.md`, `web/` = falkordb-browser @ v2.3.1 copied in (not submoduled) with LICENSE intact, `MODIFICATIONS.md` | `curl :8000/health` ok; `cd web && npm ci && npm run build` green |
| 1 | Ontology + fixtures | `models/ontology.py`, `schema.cypher`, `people.json`, `services.json`, 50-line `events.jsonl`, ADR docs, `gold_questions.json` | `pytest -k fixtures` validates 50 events, anchor ids present, all refs resolve |
| 2 | Ingest + projector + supersession | §9a/9b, MockTemporal, GraphitiTemporal (live path compiles, untested without key) | unit tests 1–3, 6 + integration 2, 3, 8, 9 green |
| 3 | Audits | 4 Cypher files + `/api/audits/*` | integration 5, 6 green |
| 4 | Ask agent + provenance | router, tools, answerer, validation, `/api/ask`, `/api/provenance/*` | integration 4 + unit `superseded_never_current`, `hallucinated_ids_dropped` green |
| 5 | Sync + SSE + tracing + debug | §9c, §11, `/debug` page | integration 7 green; `/debug` shows a live sync |
| 6 | Web reskin (Appendix A "3 Quick Cosmetic Edits" + Strategy 1 step 1–2) | `--radius:0px`, bg `#0a0a0a`, panels `#141414`, borders `1px solid #27272a`, JetBrains Mono, `text-xs tracking-widest uppercase font-mono` headers, amber `#f59e0b` / emerald `#10b981` status, red `#ef4444` superseded; rebrand "NEXUS // Organizational Telemetry & Decision Graph"; rename labels to "Ingestion Streams (Slack / Jira / Docs)", "Decision Provenance Graph", "Ownership Matrix" | `npm run build` green; screenshot saved to `docs/img/hud.png` |
| 7 | Web NEXUS features | `/nexus` default route; `LiveTopology` tab "Live Company Topology" (react-force-graph-2d; red dashed superseded edges, green active); `AuditBar` with the 4 buttons; `AskPanel` + `ProvenanceBadge` (`✓ CURRENT SOURCE …` / `✗ SUPERSEDED … — Invalidated`); `SimulateSyncButton` in navbar; `IngestionStreams` rail; Next rewrite to API; auto-connect to local FalkorDB for the upstream Cypher Explorer tab | Playwright `nexus.spec.ts` green |
| 8 | Eval / money shot | `baseline_rag.py`, `scripts/eval.py`, `scripts/replay.py` | integration 12 green; table printed |
| 9 | GraphRAG-SDK + MCP | `docs_rag.py` live + mock indexing `fixtures/company/docs/*` into `nexus_docs`; `mcp` compose service | `docs_search` returns ADR-042 for "session store"; MCP container healthy (or logged as skipped) |
| 10 | README + lint + all tests + build | §15 README, ruff/mypy/eslint clean, full pytest + web build | `make lint test` and `docker compose up --build` all green from a clean clone |
| 11 | **Stretch** (only after 10) | deploy (single VPS with compose; repo public satisfies SSPL §13); blog post draft `docs/blog.md`; `as_of` time-travel slider on topology | deployed URL in README |

---

## 17. Engineering rules

- Python: type hints everywhere, `mypy --strict` on `nexus_api/`, ruff. TS: upstream strictness; no `any` in `components/nexus/*`.
- **No logic in routes.** Routes parse → call a service → return.
- All Cypher lives in `.cypher` files or named constants with **parameters**. No string-interpolated user input, ever.
- External calls (LLM, Graphiti, GraphRAG-SDK) get a timeout (LLM 30 s, Graphiti add_episode 60 s) and 2 retries with jittered backoff on 429/5xx.
- Ingest is idempotent on `event.id`.
- One `run_id` traces every request through steps, SSE and logs.
- Never commit `.env`, keys or `var/`.
- Keep upstream `web/` changes surgical. New UI goes in `components/nexus/`, `app/nexus/`, `lib/nexus/`, plus theme files (`tailwind.config.js`, `app/globals.css`). List every touched upstream file in `MODIFICATIONS.md`.
- **End-of-run summary** — append to `DECISIONS.md` under `## Overnight run summary`:
  - Done: phases completed with the commit SHAs
  - Assumed: top 10 D-### entries the human must check first
  - Unverified contracts: rows still ⚠️ in CONTRACTS.md
  - Demo commands: exact copy-paste sequence (`make up`, `python scripts/seed.py --until 2026-09-30`, open `/nexus`, click Simulate Sync, ask the session question, click each audit)

---

## Appendix A — Source plan (Gemini). VERBATIM. DO NOT EDIT.

To pull this off so it looks like a custom-engineered, non-generic system while writing almost zero backend or frontend logic from scratch, the best strategy is a "Two-Repo Transplant"—or a single-repo reskin of an existing full-stack workspace.

Since this is the FalkorDB hackathon, the judges will check two things first: 1) Does it actually use FalkorDB? and 2) Does it visually demonstrate the 5 bullet points in the prompt?

Strategy 1: The "Zero-Code" Single-Repo Fork (Fastest)

If you want a single repository that already has a full Next.js/React frontend, a FastAPI backend, an interactive 2D/3D Graph Visualizer, and native FalkorDB support already wired up:

Base Repo: topoteretes/cognee (specifically including cognee-frontend)

⚬ Why it’s a cheat code: Most people treat Cognee as just a Python library, but the repo actually contains a full Next.js frontend dashboard (cognee-frontend/) and a FastAPI server (cognee/api/) out of the box.
⚬ What’s already built for you:
  ⚬ Interactive graph visualization panel showing nodes and edges.
  ⚬ Dataset/document upload & ingestion pipeline.
  ⚬ Chat / query interface with GraphRAG retrieval.
  ⚬ Native FalkorDB provider (GRAPH_DATABASE_PROVIDER="falkordb" in .env).
⚬ How to make it look completely custom in 2 hours:
  1. Reskin the Next.js UI: Strip out the default purple/soft styling in cognee-frontend/src/app/globals.css and Tailwind config. Apply a sharp, high-contrast industrial brutalist / tactical telemetry HUD theme (monospace fonts like JetBrains Mono, 1px solid #27272a borders, zero border-radius, dark zinc #09090b background, amber/emerald status indicators).
  2. Rename the Ontology Labels in UI: Change generic labels like "Datasets" and "Cognify" to "Ingestion Streams (Slack / Jira / Docs)", "Decision Provenance Graph", and "Ownership Matrix".
  3. Pre-load a killer synthetic dataset: Seed a JSON file containing realistic company drama (e.g., 3 engineers arguing in Slack over switching from Postgres to Redis, a Linear ticket created from it, an ADR markdown doc, and a subsequent PR reversing the decision 2 weeks later). When judges test or watch your demo, the graph immediately lights up with real company entities (Person, Team, Decision, Ticket, Document).

Strategy 2: The "Frankenstein" Power Combo (Most Impressive & Non-Generic)

If you want a full-blown enterprise app with 40+ connectors (Slack, Jira, GitHub, Notion), source citations, and temporal decision tracking that looks like a Series-A startup product:

Repo A (Frontend + Connectors + Citations): pipeshub-ai/pipeshub-ai OR onyx-dot-app/onyx

Repo B (FalkorDB Temporal Engine): getzep/graphiti

⚬ Why this combination wins:
  ⚬ PipesHub AI gives you a complete enterprise UI: connector toggles for Slack/Jira/GitHub/Drive, user/team permission management, and inline clickable source citations right out of the box.
  ⚬ Graphiti (pip install "graphiti-core[falkordb]") has a built-in FastAPI service (server/) and uses FalkorDB to store bi-temporal edges (valid_at, invalid_at) and source Episode UUIDs.
⚬ How to stitch them together with minimal effort:
  1. Clone PipesHub AI (or SurfSense: MODSetter/SurfSense, which has an even cleaner Next.js + FastAPI codebase that is super easy to modify).
  2. In the FastAPI chat/ingestion route, add a 15-line hook that forwards ingested text chunks to graphiti.add_episode() backed by a Dockerized falkordb/falkordb:latest container.
  3. Embed react-force-graph-2d (or copy the graph canvas component from FalkorDB/falkordb-browser) into a main tab called "Live Company Topology".

Strategy 3: Official FalkorDB UI + Backend Boilerplate (Safest for Sponsor Points)

If you want the judges from FalkorDB to immediately recognize deep usage of their ecosystem without writing it yourself:

⚬ Backend + Chat UI: FalkorDB/GraphRAG-SDK + FalkorDB/FalkorDB-MCPServer
⚬ Frontend UI to copy: FalkorDB/falkordb-browser (Open-source Next.js/React dashboard built by FalkorDB).
⚬ How to disguise and elevate it:
  ⚬ Fork falkordb-browser so you already have a working canvas, Cypher execution engine, and node inspector.
  ⚬ Strip out the database-admin branding and rebrand it as "NEXUS // Organizational Telemetry & Decision Graph".
  ⚬ Add 4 pre-wired "Quick Audit" buttons on the top bar that directly map to the hackathon problem statement:
    1. [WHO OWNS WHAT] \rightarrow Runs a pre-set Cypher query highlighting (:Person)-[:OWNS|MAINTAINS]->(:Service|:Project).
    2. [DECISION TRACE] \rightarrow Highlights a path from a (:Decision) node back to the originating (:SlackThread) and (:JiraTicket).
    3. [STALE / SUPERSEDED KNOWLEDGE] \rightarrow Filters the graph to show red dashed edges for outdated decisions (status: 'superseded') vs. green active edges.
    4. [BUS FACTOR / SME FINDER] \rightarrow Highlights nodes with the highest degree centrality to show "who knows what".

Comparison: Which One Should You Clone Right Now?

Option	Repositories to Clone	Stack	Effort to Rebrand	Why Judges Will Love It
1. Cognee Full-Stack	topoteretes/cognee	Next.js + FastAPI + FalkorDB	Very Low (1 repo, docker-compose up)	Already has an official "Company Brain" workflow & native FalkorDB driver.
2. SurfSense + Graphiti	MODSetter/SurfSense + getzep/graphiti	Next.js + FastAPI + FalkorDB	Low-Medium (Swap CSS + add 1 route)	Looks like a polished product with citations, connectors, and true temporal graph invalidation.
3. FalkorDB Browser + Graphiti	FalkorDB/falkordb-browser + getzep/graphiti	Next.js/React + FastAPI + FalkorDB	Low (UI restyle + seed script)	Maximum sponsor points—uses FalkorDB's canvas + Graphiti's temporal episodes.

3 Quick Cosmetic Edits So Nobody Spots the Boilerplate

1. Change the Color Palette & Layout Density: Most AI repos use generic Shadcn white/indigo with rounded corners (rounded-xl). Change the global radius variable --radius: 0px, switch to a #0a0a0a background with #141414 panels, and use uppercase tracked-out headers (text-xs tracking-widest uppercase font-mono). It will immediately look custom-built.
2. Hardcode a "Temporal Conflict Resolution" Badge in the Chat UI: When an agent answers a question in the UI, render a sleek provenance box underneath showing:
  ⚬ ✓ CURRENT SOURCE: ADR-042 (2026-10-12) via Linear #409
  ⚬ ✗ SUPERSEDED: #eng-backend Slack Thread (2026-09-18) — Invalidated
    (Graphiti returns these exact valid_at/invalid_at timestamps automatically, so you just display the JSON fields in the frontend.)
3. Seed Data Over Live OAuth: Don't waste time configuring live Slack/Jira OAuth apps for judges to log into. Build a "Simulate Live Company Sync" button in the navbar that replays 50 realistic Slack messages, GitHub PRs, and Notion docs into FalkorDB in real time so judges can watch the graph evolve and invalidate old decisions live on screen.

Which of the three stacks (cognee, SurfSense + graphiti, or falkordb-browser + graphiti) do you want to pull down? I can give you the exact folder structure to edit, the docker-compose.yml uniting them, and the synthetic company dataset script to load right into FalkorDB.
