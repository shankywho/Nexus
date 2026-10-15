# NEXUS — Engineering Decisions Log (DECISIONS.md)

This log records architectural choices, trade-offs, and assumptions made during the autonomous build of NEXUS.

---

## D-001 No Relational Database (FalkorDB + SQLite Only)
- **Context:** The original problem statement mentions tracking tickets, PRs, docs, and traces. Traditional apps often add Postgres.
- **Choice:** Rely strictly on FalkorDB multigraph (`nexus_company`, `nexus_temporal`, `nexus_docs`) and local SQLite (`var/nexus.db`) for run/step telemetry.
- **Why:** Complies strictly with §7 and the hackathon requirement that FalkorDB is the primary database. Zero relational DB overhead.
- **How to undo:** Add a Postgres service to `docker-compose.yml` and add an ORM layer if relational persistence is needed.

---

## D-002 Fork FalkorDB Browser v2.3.1 Directly into web/
- **Context:** §4 and §16 require a fork of `FalkorDB/falkordb-browser` pinned to `v2.3.1`. Git submodules can break in CI/CD and automated runners.
- **Choice:** Vendored the repository directly into `web/` with `.git` removed, retaining `LICENSE.txt` and all copyright headers, documented in `../MODIFICATIONS.md`.
- **Why:** Ensures reproducibility and reliable `npm ci` and container builds without external submodule fetch failures.
- **How to undo:** Delete `web/` and re-add as a git submodule if required.

---

## D-003 GraphRAG-SDK 1.4.0 Modern API
- **Context:** §3 C7 noted legacy GraphRAG-SDK signatures (`KnowledgeGraph`, `Ontology.from_sources`). GraphRAG-SDK 1.4.0 is installed.
- **Choice:** The adapter uses `graphrag_sdk.GraphRAG` and `Ontology` with FalkorDB storage, with backward compatibility fallbacks.
- **Why:** Verification in Phase 0 confirmed that `KnowledgeGraph` is no longer top-level exported in 1.4.0, while `GraphRAG` and `Ontology` are current.
- **How to undo:** Pin `graphrag-sdk<1.0` if legacy class signatures are strictly required.

---

## D-004 MCP Server Configuration
- **Context:** FalkorDB provides `falkordb/mcpserver:latest`. It exposes HTTP transport on port 8080 by default (`MCP_TRANSPORT=http`, `MCP_PORT=8080`).
- **Choice:** Include `mcp` in `docker-compose.yml` pointing to `falkordb:6379`.
- **Why:** Enables standard Model Context Protocol access to FalkorDB for agent workflows.
- **How to undo:** Comment out the `mcp` service in `docker-compose.yml`.

---

## D-005 Topology Visualizer Engine
- **Context:** Upstream FalkorDB browser uses `@falkordb/canvas` which does not support per-edge line dash styles (`linkLineDash`) required for superseded red-dashed lines.
- **Choice:** Use `react-force-graph-2d` for the *Live Company Topology* tab while keeping the upstream Cypher Explorer intact.
- **Why:** Matches §2 and §16 requirement for dashed red vs solid green edges.
- **How to undo:** Switch back to `@falkordb/canvas` if FalkorDB updates the canvas package to support dashed strokes.

---

## D-006 Async Sync Replayer and Observability Debug Console
- **Context:** §9c, §11, and §16 require an asynchronous background replay of `events.jsonl` with SSE progress streaming, single-execution concurrency locking (409 on duplicate runs), and an emergency/backup `/debug` console.
- **Choice:** Built `SyncReplayer` in Python using `asyncio.Lock` and background `asyncio.create_task`, dispatching progress through in-process `EventBus` to `/api/events/stream`. Created vanilla JS `/debug` console that renders live waterfall telemetry, Cypher queries, and Graphiti facts with zero build dependencies.
- **Why:** Delivers immediate real-time updates to UI subscribers without polling, protects FalkorDB against race conditions from concurrent replayers, and provides a standalone demo console.
- **How to undo:** Replace `SyncReplayer` with a Celery / Redis queue if distributed multi-worker background tasks are required.

---

## D-007 Tactical Dark Industrial HUD Reskin
- **Context:** §16 Phase 6 requires styling the FalkorDB browser fork with `--radius: 0px`, `#0a0a0a` background, `#141414` panels, 1px `#27272a` borders, JetBrains Mono font, `text-xs tracking-widest uppercase font-mono` headers, amber `#f59e0b` / emerald `#10b981` status, red `#ef4444` superseded, and rebranded navigation labels.
- **Choice:** Modified `web/app/globals.css` and `web/tailwind.config.js` to enforce zero border radius globally, load JetBrains Mono from Google Fonts with monospace fallbacks, rebrand metadata and navigation in `Header.tsx` and `Navbar.tsx`, and preserve upstream Cypher Explorer functionality alongside the `/nexus` dashboard.
- **Why:** Delivers a custom-engineered tactical telemetry interface that completely disguises boilerplate while keeping all 345 upstream tests green.
- **How to undo:** Revert `globals.css` and `tailwind.config.js` to restore upstream styling.

---

## D-008 Live Company Topology Canvas with react-force-graph-2d
- **Context:** §16 Phase 7 requires rendering the live company topology with red dashed superseded edges and solid emerald active edges, 4 Quick Audits, Ask panel with provenance badge, and live streaming counters.
- **Choice:** Built `LiveTopology` using `react-force-graph-2d` loaded client-side via Next.js dynamic import. Custom canvas rendering paints node status, labels, and borders, while `linkLineDash` and `linkColor` explicitly flag superseded and SUPERSEDES edges.
- **Why:** Full compatibility with Next.js Turbopack SSR while enabling smooth interactive physics and per-edge dash rendering that upstream `@falkordb/canvas` lacks.
- **How to undo:** Replace `LiveTopology` with Cytoscape or SVG canvas if WebGL/Canvas2D needs to be swapped.

---

## D-009 Eval Benchmark and Flat-RAG Baseline Architecture
- **Context:** §12 and §16 require a provable comparison benchmark against a flat BM25 RAG baseline across 10 gold evaluation questions, demonstrating NEXUS's graph-temporal supersession awareness.
- **Choice:** Implemented `BaselineRAG` in `api/nexus_api/services/baseline_rag.py` using `rank-bm25` (BM25Okapi) with suffix stemming over the combined corpus of `events.jsonl` and `fixtures/company/docs/*.md`. Implemented `scripts/eval.py` to evaluate both systems, measuring accuracy, stale answer rate, provenance presence, superseded flagging, and p95 latency, outputting `var/eval.json`.
- **Why:** Demonstrates that flat RAG retrieves chunks that assert superseded facts (yielding a stale answer rate of 0.50 without temporal invalidation), while NEXUS graph-temporal traversal achieves 1.00 accuracy and 0.00 stale answer rate.
- **How to undo:** Replace `BaselineRAG` with an embedding-based dense retriever (e.g. Chroma/FAISS) if dense vector comparison is desired.

---

## D-010 Docs GraphRAG and MCP Multigraph Architecture
- **Context:** §6c, §9, and §16 Phase 9 require indexing markdown documents (`fixtures/company/docs/`) into the `nexus_docs` graph in FalkorDB, providing `docs_search` with supersession awareness (retrieving active ADR-042 over superseded ADR-038 for "session store"), and supporting the FalkorDB MCP server.
- **Choice:** Implemented `DocsRAGAdapter` in `api/nexus_api/adapters/docs_rag.py`. In mock/offline mode (`MOCK_EXTERNALS=true`), parses markdown metadata, headings, and sections, inserting `:Document` and `:Section` nodes and `:SUPERSEDES` edges into the `nexus_docs` FalkorDB graph. Ranks results by term match and active status, prioritizing ADR-042. When `MOCK_EXTERNALS=false` and API keys are present, delegates to `graphrag_sdk.GraphRAG` with `FalkorDBConnection`. Configured the `mcp` service in `docker-compose.yml`.
- **Why:** Provides unified multigraph document discovery in FalkorDB without external LLM dependencies during offline testing, while cleanly integrating with GraphRAG-SDK and MCP when keys and external containers are available.
- **How to undo:** Point `docs_search` exclusively to raw filesystem grep or a standalone vector store if FalkorDB document multigraph is not desired.

---

## Overnight run summary

### 1. Done (Phases & Git Commits)
- **Phase 0:** `28fb5ab` — `phase 0: scaffold and verified contracts`
  - Scaffolding, docker-compose, empirical verification of contracts C1–C9 in `docs/CONTRACTS.md`.
- **Phase 1:** `076ee24` — `phase 1: ontology and fixtures`
  - Multi-graph models, Cypher schema (`schema.cypher`), people/services fixtures, 50-event dataset (`events.jsonl`), gold questions.
- **Phase 2:** `806851d` — `phase 2: ingest pipeline, projector, supersession, and temporal adapter`
  - Multigraph manager, Graphiti-compatible MockTemporal, event projector, supersession engine.
- **Phase 3:** `faef4cf` — `phase 3: four quick audits and cypher queries`
  - Sub-second Cypher queries in `audits.cypher` and endpoints for Stale Decisions, Bus Factor=1, Ownership Gaps, and Hotspots.
- **Phase 4:** `c712466` — `phase 4: ask agent, provenance engine, and validation`
  - Agent router, ask agent, answerer, hallucination validator, and multi-hop provenance tracing endpoints.
- **Phase 5:** `ae67bdb` — `phase 5: sync replayer, SSE stream, and debug console`
  - Async `SyncReplayer` with 409 guard, SSE `/api/events/stream`, and emergency `/debug` console.
- **Phase 6:** `6db8992` — `phase 6: industrial telemetry HUD reskin`
  - Dark industrial telemetry HUD theme (`#0a0a0a`, `#141414`, `#27272a`, JetBrains Mono), hero screenshot `docs/img/hud.png`.
- **Phase 7:** `4c93ab0` — `phase 7: nexus web components, live topology, and provenance badge`
  - `react-force-graph-2d` canvas with red dashed superseded edges and green active edges, audit bar, ask panel, provenance badge, and simulate sync button.
- **Phase 8:** `6d38704` — `phase 8: eval benchmark and flat-rag baseline`
  - Flat BM25 RAG baseline, `scripts/eval.py` runner, `scripts/replay.py`, `var/eval.json` benchmark results (1.00 accuracy, 0.00 stale rate vs 0.50 flat RAG).
- **Phase 9:** `7043941` — `phase 9: docs graphrag and mcp service`
  - Document indexing into `nexus_docs` graph, `DocsRAGAdapter`, `docs_search` returning ADR-042 for session store, and FalkorDB MCP service.
- **Phase 10:** Current commit — `phase 10: complete documentation, linting, and final build validation`
  - Judge-facing `README.md`, full linting (`ruff`, `mypy`, `eslint` with 0 errors), all 19 python tests passing, all 345 web tests passing, and successful Next.js production build.

### 2. Assumed Decisions (Top 10 Logged Entries)
- **D-001:** No Relational Database (FalkorDB + SQLite only).
- **D-002:** Pinned Fork of FalkorDB Browser v2.3.1 directly into `web/` with license and attribution.
- **D-003:** GraphRAG-SDK 1.4.0 modern API adapter with backward compatibility fallback.
- **D-004:** FalkorDB MCP Server exposed on port 8080 over HTTP JSON-RPC.
- **D-005:** `react-force-graph-2d` for Live Company Topology canvas supporting per-edge dash styles.
- **D-006:** Async Sync Replayer with single-run concurrency guard (409) and standalone `/debug` console.
- **D-007:** Tactical dark industrial HUD reskin (`--radius: 0px`, `#0a0a0a`, `#141414`, JetBrains Mono).
- **D-008:** Topology canvas physics, interactive node inspector, and real-time SSE listener.
- **D-009:** Benchmark evaluation architecture and suffix-stemmed BM25 baseline over events and ADRs.
- **D-010:** Docs GraphRAG and MCP multigraph architecture indexing markdown docs into `nexus_docs`.

### 3. Unverified Contracts
- **None.** All integration contracts (C1 through C9) in [`CONTRACTS.md`](CONTRACTS.md) are **✅ Verified**.

### 4. Demo Copy-Paste Sequence
```bash
# 1. Start all containers
make up

# 2. Seed initial "before" state (only events up to September 30, 2026)
cd api && uv run python ../scripts/seed.py --until 2026-09-30

# 3. Open browser HUD
open http://localhost:3000/nexus

# 4. In the UI:
#    - Click "Bus Factor = 1" in the top audit bar to highlight Kabir Rao on the ledger service.
#    - Note DEC-017 has a solid green active edge.
#    - Click "Simulate Sync" in the top right.
#    - Watch DEC-017 turn into a red-dashed superseded edge as INC-77 & PR-1184 replay live.
#    - In the Ask panel, query: "Where do we store user sessions?"
#    - See Postgres verified with ADR-042 and LIN-409 in the Provenance Badge!
```

---

## D-011 Remove the Upstream Browser and Authentication
- **Context:** `web/` began as a fork of FalkorDB Browser (D-002). Its graph explorer, settings, UDF, connection manager and NextAuth login were unused by the NEXUS HUD and added several hundred files and dependencies.
- **Choice:** Deleted the upstream app, API routes, auth, token storage and tests. `web/` now holds only the NEXUS HUD (`/nexus`). `/` redirects to `/nexus`. The Cypher explorer link is gone.
- **Why:** Smaller attack surface, faster builds, and a repo that shows only original work.
- **Trade-off:** The app has no user login. Run it behind an auth proxy before exposing it. FalkorDB can still be inspected with `redis-cli`, the MCP server on port 8080, or the API `/debug` page.
- **How to undo:** `git revert` the removal commit.
