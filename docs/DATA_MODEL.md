# NEXUS Graph Data Model

NEXUS uses **FalkorDB** as its unified graph context engine. Data is organized into tenant-isolated multi-graphs within a single FalkorDB instance:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FalkorDB Instance                               │
├───────────────────┬───────────────────┬────────────────────────────────┤
│   nexus_company   │  nexus_temporal   │   nexus_memory_<tenant>        │
│ (Entities & State)│ (Episodic Facts)  │ (Agent Memory, Tasks & Traces) │
├───────────────────┴───────────────────┴────────────────────────────────┤
│                              nexus_docs                                │
│                     (ADRs & Runbook Chunks / RAG)                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Company Graph (`nexus_company`)

Stores organizational structure, systems, decisions, incidents, and structural dependencies.

### Nodes

| Label | Key Properties | Purpose |
| :--- | :--- | :--- |
| `Person` | `id`, `name`, `role`, `email_hash`, `org_id` | Engineers, architects, and owners |
| `Team` | `id`, `name`, `org_id` | Engineering teams (Platform, Payments, Growth, SRE) |
| `Service` | `id`, `name`, `tier`, `description`, `org_id` | Microservices and infrastructure |
| `Project` | `id`, `name`, `status`, `org_id` | Organizational initiatives |
| `Decision` | `id`, `title`, `status` (*active*, *superseded*), `summary`, `decided_at`, `org_id` | Architectural decisions and state |
| `Incident` | `id`, `title`, `severity`, `suspected_cause`, `created_at`, `org_id` | Production incidents (e.g. INC-77, INC-83) |
| `PullRequest` | `id`, `title`, `author_id`, `merged_at`, `org_id` | GitHub PRs implementing or reverting changes |
| `Ticket` | `id`, `title`, `status`, `assignee_id`, `org_id` | Linear/Jira tracking tickets |
| `Document` | `id`, `title`, `path`, `status`, `org_id` | ADRs and system documentation |
| `SlackThread`| `id`, `channel`, `author_id`, `ts`, `org_id` | Communication channel threads |
| `SourceEvent`| `id`, `kind`, `source`, `raw_payload`, `ts`, `org_id` | Ingested immutable source event record |

### Relationships

| Relationship | Source ➔ Target | Purpose |
| :--- | :--- | :--- |
| `[:MEMBER_OF]` | `(:Person) ➔ (:Team)` | Team membership |
| `[:OWNS]` | `(:Team) ➔ (:Service \| :Project)` | Team service ownership |
| `[:MAINTAINS]` | `(:Person) ➔ (:Service)` | Primary maintainer / on-call expertise |
| `[:DEPENDS_ON]` | `(:Service) ➔ (:Service)` | Service-to-service runtime dependency |
| `[:SUPERSEDES]` | `(:Decision) ➔ (:Decision)` | Decision invalidation / reversal lifecycle |
| `[:TRIGGERED]` | `(:Incident) ➔ (:PullRequest)` | Incident remediation link |
| `[:DOCUMENTED_IN]` | `(:Decision) ➔ (:Document)` | Decision to ADR link |
| `[:IMPLEMENTED_BY]`| `(:Decision) ➔ (:PullRequest)` | Decision implementation PR |
| `[:AFFECTS]` | `(:Decision \| :Incident) ➔ (:Service)` | Blast radius / service impact |
| `[:KNOWS_ABOUT]` | `(:Person) ➔ (:Service \| :Decision)` | Domain expertise linkage |

---

## 2. Temporal Fact Graph (`nexus_temporal`)

Stores bi-temporal episodic knowledge where facts have validity intervals.

### Nodes
- `Episodic`: `uuid`, `name`, `body`, `source_description`, `reference_time`, `created_at`, `group_id`
- `Entity`: `name`, `group_id`

### Relationships
- `[:MENTIONS]`: `(:Episodic) ➔ (:Entity)`
- `[:RELATES_TO]`: `(:Entity) ➔ (:Entity)`
  - Properties: `uuid`, `name` (predicate), `fact` (statement), `valid_at` (ISO timestamp), `invalid_at` (ISO timestamp or null), `episodes` (list of UUIDs)

---

## 3. Agent Memory & Coordination Graph (`nexus_memory_<tenant>`)

Provides native FalkorDB agent memory, multi-agent task handoffs, and audit traces for Track 1 & Track 2.

### Nodes

| Label | Key Properties | Purpose |
| :--- | :--- | :--- |
| `User` | `id`, `name`, `tenant_id` | Human operator initiating tasks or queries |
| `Conversation`| `id`, `user_id`, `created_at`, `updated_at` | Multi-turn chat session container |
| `Turn` | `id`, `role`, `content`, `ts` | Turn in conversation history |
| `Episode` | `id`, `incident_id`, `goal`, `outcome`, `ts` | Episodic memory record of an incident resolution run |
| `Fact` | `id`, `subject`, `predicate`, `object`, `valid_at`, `invalid_at`, `status` | Learned semantic fact (with supersession) |
| `Procedure` | `id`, `trigger_pattern`, `tool_sequence`, `success_count`, `last_used` | Procedural memory playbook reused for incident triage |
| `Task` | `id`, `title`, `status` (*open*, *claimed*, *completed*), `assigned_to`, `created_at` | Shared state for agent handoffs |
| `AgentRun` | `id`, `trigger`, `status`, `started_at`, `completed_at` | Top-level execution trace |
| `ToolCall` | `id`, `step_number`, `tool`, `args`, `cypher`, `rows_count`, `latency_ms` | Explainable tool invocation audit node |
| `Action` | `id`, `kind` (*ticket*, *page*, *flag_decision*), `target`, `status` | Action taken by the agent on connected data |

### Relationships

| Relationship | Source ➔ Target | Purpose |
| :--- | :--- | :--- |
| `[:HAS_TURN]` | `(:Conversation) ➔ (:Turn)` | Conversation turn hierarchy |
| `[:TOUCHED]` | `(:ToolCall) ➔ (:Entity \| :Service \| :Decision)` | Explainability link: which entities were inspected |
| `[:STEP]` | `(:AgentRun) ➔ (:ToolCall)` | Sequential execution flow |
| `[:HANDOFF]` | `(:Task) ➔ (:Task)` or `(:Agent) ➔ (:Agent)` | Agent-to-agent task delegation |
| `[:PRODUCED]` | `(:AgentRun) ➔ (:Episode \| :Action \| :Procedure)` | Knowledge and outcome artifacts |
| `[:SUPERSEDES]` | `(:Fact) ➔ (:Fact)` | Semantic memory contradiction resolution |

---

## 4. Documentation RAG Graph (`nexus_docs`)

Stores ADRs, RFCs, and runbooks indexed via GraphRAG-SDK.

### Nodes
- `Document`: `id`, `title`, `path`, `status`, `summary`
- `Section`: `id`, `title`, `content`, `heading_level`

### Relationships
- `[:SECTION_OF]`: `(:Section) ➔ (:Document)`
- `[:SUPERSEDES]`: `(:Document) ➔ (:Document)`
- `[:DOCUMENTS]`: `(:Document) ➔ (:Service)`
