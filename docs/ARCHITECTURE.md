# Architecture

## System Architecture

```mermaid
flowchart TD
    subgraph UI ["Frontend // Office HUD (Next.js 16)"]
        Office["Office floor + graph view\n(SVG, react-force-graph-2d)"]
        AuditBar["4 Audits\n(Who owns what, Decision trace,\nStale knowledge, Bus factor)"]
        AskHUD["Ask Panel &\nProvenance Badge"]
        SimulateBtn["Simulate Sync\n(SSE Real-Time Stream)"]
    end

    subgraph API ["Backend // FastAPI Orchestration Engine (Python 3.11)"]
        Router["Agent Router & Validator"]
        IngestEngine["Event Ingest & Projector"]
        SupersedeEngine["Supersession & Invalidation Engine"]
        AuditService["Audits Service"]
        ProvenanceEngine["Multi-Hop Provenance Engine"]
        SyncReplayer["Async Sync Replayer (409 Guarded)"]
        DocsRAG["Docs GraphRAG Adapter"]
    end

    subgraph Multigraph ["Primary Database // FalkorDB Multigraph Engine"]
        CompanyGraph[("nexus_company\n(Typed Entities & Decisions)")]
        TemporalGraph[("nexus_temporal\n(Graphiti Episodic Facts)")]
        DocsGraph[("nexus_docs\n(GraphRAG-SDK ADRs & Runbooks)")]
    end

    subgraph External ["Services & Protocols"]
        MCP["FalkorDB MCP Server\n(:8080 HTTP JSON-RPC)"]
        TraceDB[("SQLite var/nexus.db\n(Telemetry Runs & Steps)")]
    end

    UI -->|HTTP / REST & SSE| API
    API -->|Redis Protocol :6379| CompanyGraph
    API -->|Redis Protocol :6379| TemporalGraph
    API -->|Redis Protocol :6379| DocsGraph
    API -->|Read / Write Runs| TraceDB
    MCP -.->|Inspect Graphs| Multigraph
```

---

## Ingest Pipeline & Decision Supersession Lifecycle

### Ingestion & Graph Projection Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor Source as Event Webhook / Replayer
    participant Ingest as /api/ingest/event
    participant Dedupe as Deduplication Check
    participant Company as FalkorDB (nexus_company)
    participant Temporal as Temporal Adapter (nexus_temporal)
    participant Supersede as Supersession Engine
    participant EventBus as SSE EventBus

    Source->>Ingest: POST {id, kind, source, text, ts, ...}
    Ingest->>Dedupe: Check SourceEvent existence in nexus_company
    alt Duplicate Event
        Dedupe-->>Ingest: Return {duplicate: true, stored: false}
        Ingest-->>Source: 200 OK (idempotent, counts unchanged)
    else New Event
        Ingest->>Company: MERGE SourceEvent node
        Ingest->>Company: Project typed nodes (Decision, Incident, PR, Ticket)
        Ingest->>Temporal: Add episode & project bi-temporal RELATES_TO facts
        Ingest->>Supersede: Evaluate invalidation & supersession rules
        Supersede->>Company: Mark older Decision {status: "superseded"}
        Supersede->>Company: MERGE (newDec)-[:SUPERSEDES]->(oldDec)
        Supersede->>Temporal: Update older fact {invalid_at: event.ts}
        Ingest->>EventBus: Broadcast sync.progress & topology invalidations
        Ingest-->>Source: 200 OK {status: "ingested"}
    end
```

### Decision Supersession Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> Proposed: Slack Discussion / RFC
    Proposed --> Accepted: PR Merged & ADR Ratified (e.g. DEC-017 / ADR-038)
    
    state Active_Store {
        Accepted --> Under_Stress: High Load / Production Drift
        Under_Stress --> Incident_Triggered: Memory Pressure / Outage (INC-77)
    }

    Incident_Triggered --> Emergency_Revert: Emergency Patch PR (PR-1184)
    Emergency_Revert --> Superseded: New ADR Ratified (DEC-021 / ADR-042)
    
    Superseded --> Archived: Invalidate Graph Edges (valid_at -> invalid_at)
    Archived --> [*]
```

---

---

## FalkorDB Multigraph

NEXUS uses **FalkorDB** as its primary graph engine. Tenant isolation is enforced with an `org_id` property across three graphs:

| Graph | Purpose | Node types | Edge types | Source |
|---|---|---|---|---|
| `nexus_company` | Organization ontology, current topology, decisions. | `Person`, `Team`, `Service`, `Project`, `Decision`, `Incident`, `PR`, `LinearTicket`, `SourceEvent` | `OWNS`, `MAINTAINS`, `MEMBER_OF`, `SUPERSEDES`, `RESOLVES`, `TRIGGERED`, `DERIVED_FROM` | [`schema.cypher`](../api/nexus_api/cypher/schema.cypher) |
| `nexus_temporal` | Episodic memory and bi-temporal facts (`valid_at`, `invalid_at`, `expired_at`). | `Entity`, `Episodic` | `RELATES_TO {valid_at, invalid_at}`, `MENTIONS` | [`temporal.py`](../api/nexus_api/adapters/temporal.py) |
| `nexus_docs` | ADRs and runbooks indexed via GraphRAG-SDK. | `Document`, `Section` | `SECTION_OF`, `SUPERSEDES`, `DOCUMENTS` | [`docs_rag.py`](../api/nexus_api/adapters/docs_rag.py) |

Run and step telemetry is stored in SQLite (`var/nexus.db`, git-ignored). See [DECISIONS.md](DECISIONS.md) D-001.

## Quick Audits

Each audit is a single Cypher query in [`api/nexus_api/cypher/`](../api/nexus_api/cypher) and returns `nodes`, `edges`, `highlight_ids`, the executed `cypher`, and a `run_id`.

| Audit | Endpoint | Query | Answers |
|---|---|---|---|
| Who owns what | `POST /api/audits/who-owns-what` | `who_owns_what.cypher` | People mapped to the services and projects they own or maintain. |
| Decision trace | `POST /api/audits/decision-trace` | `decision_trace.cypher` | A decision, its sources, and the decisions it supersedes (up to 3 hops). |
| Stale knowledge | `POST /api/audits/stale-knowledge` | `stale_knowledge.cypher` | Decision-to-source edges with their active or superseded status. |
| Bus factor | `POST /api/audits/bus-factor` | `bus_factor.cypher` | People ranked by connection degree, with their service expertise. |

## Code Layout (`api/nexus_api/`)

| Path | Responsibility |
|---|---|
| `main.py`, `config.py` | App factory, router wiring, environment settings. |
| `routes/` | Thin HTTP handlers; no business logic. |
| `services/` | Ingest, projection, supersession, audits, provenance, ask agent, sync replay, tracing, event bus. |
| `adapters/` | FalkorDB, temporal graph, docs RAG, and LLM clients. Mock and live modes sit behind the same interface. |
| `agents/` | Question router and prompt templates. |
| `models/` | Pydantic models for the ontology, events, and API payloads. |
| `cypher/` | All Cypher kept as `.cypher` files. |

## How a question is answered

1. The router extracts intents and entities.
2. With `GROQ_API_KEY` (or `ANTHROPIC_API_KEY`) set, `services/graph_context.py` reads decisions, owners, incidents and the best-matching source events from `nexus_company`, and the model writes a structured answer from that context only (`agents/prompts/answer.md`).
3. `validate_and_filter_sources` drops any id that is not a node in the graph and moves superseded sources out of the current list.
4. Without a key, scripted answers cover the original demo questions and `graph_fallback` builds an answer from the decisions that affect the service or topic in the question.

