/**
 * Typed client for NEXUS API endpoints.
 * Routes through Next.js rewrites /api/nexus/* -> http://localhost:8000/api/*
 */

export interface TopologyNode {
  id: string;
  name: string;
  label: string;
  group: string;
  properties?: Record<string, unknown>;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface TopologyLink {
  id: string;
  source: string | TopologyNode;
  target: string | TopologyNode;
  label: string;
  status: string; // active | superseded
  properties?: Record<string, unknown>;
}

export interface TopologyData {
  nodes: TopologyNode[];
  links: TopologyLink[];
}

export interface AuditResponse {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  highlight_ids: string[];
  cypher: string;
  run_id: string;
}

export interface AskResponse {
  answer: string;
  confidence: number;
  current_sources: string[];
  superseded_sources: string[];
  intent: string;
  trace_id: string;
  cypher_queries: string[];
  warnings: string[];
  run_id: string;
  mode?: string;
  model?: string | null;
  degraded?: boolean;
}

export interface ProvenanceResponse {
  decision_id: string;
  current_source: Record<string, unknown> | null;
  superseded_source: Record<string, unknown> | null;
  path?: Array<Record<string, unknown>>;
  chain?: Array<Record<string, unknown>>;
}

export interface SyncStatus {
  state: "idle" | "running" | "completed" | "cancelled" | "failed";
  processed: number;
  total: number;
  run_id: string;
}

const BASE_URL = "/api/nexus";

export async function fetchTopology(): Promise<TopologyData> {
  const res = await fetch(`${BASE_URL}/graph/topology`);
  if (!res.ok) {
    throw new Error(`Failed to fetch topology: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchTemporalEdges(entity?: string): Promise<Array<Record<string, unknown>>> {
  const url = entity
    ? `${BASE_URL}/graph/temporal/edges?entity=${encodeURIComponent(entity)}`
    : `${BASE_URL}/graph/temporal/edges`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch temporal edges: ${res.statusText}`);
  }
  return res.json();
}

export async function runAudit(
  kind: "who-owns-what" | "decision-trace" | "stale-knowledge" | "bus-factor",
  payload: Record<string, unknown> = {}
): Promise<AuditResponse> {
  const res = await fetch(`${BASE_URL}/audits/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to run audit ${kind}: ${res.statusText}`);
  }
  return res.json();
}

export async function askNexus(question: string): Promise<AskResponse> {
  const res = await fetch(`${BASE_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    throw new Error(`Failed to ask nexus: ${res.statusText}`);
  }
  return res.json();
}

export async function getProvenance(decisionId: string): Promise<ProvenanceResponse> {
  const res = await fetch(`${BASE_URL}/provenance/${encodeURIComponent(decisionId)}`);
  if (!res.ok) {
    throw new Error(`Failed to get provenance for ${decisionId}: ${res.statusText}`);
  }
  return res.json();
}

export async function startSync(intervalMs = 400, reset = false): Promise<{ status: string; run_id: string }> {
  const res = await fetch(`${BASE_URL}/sync/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interval_ms: intervalMs, reset }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Sync failed with status ${res.status}`);
  }
  return res.json();
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${BASE_URL}/sync/status`);
  if (!res.ok) {
    throw new Error(`Failed to get sync status: ${res.statusText}`);
  }
  return res.json();
}

export async function cancelSync(): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/sync/cancel`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to cancel sync: ${res.statusText}`);
  }
  return res.json();
}

export interface SourceEvent {
  id: string;
  kind: string | null;
  ts: string | null;
  ingested_at: string | null;
}

export async function fetchSources(limit = 200): Promise<SourceEvent[]> {
  const res = await fetch(`${BASE_URL}/sources?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch sources: ${res.statusText}`);
  }
  return res.json();
}

export interface Health {
  status: string;
  falkordb: string;
  llm: { mode: "groq" | "claude" | "openai" | "scripted"; provider: string; model: string | null };
}

export async function fetchHealth(): Promise<Health> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) {
    throw new Error(`Failed to fetch health: ${res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Agent Runtime & Memory APIs (Tracks 1 & 2)
// ---------------------------------------------------------------------------

export interface DemoIncident {
  id: string;
  title: string;
  severity: string;
  service_id: string;
  description: string;
  suspected_cause: string;
  reported_by: string;
  created_at: string;
}

export interface AgentStepTrace {
  step_n: number;
  agent: string;
  tool: string;
  args: Record<string, unknown>;
  cypher?: string;
  rows_returned?: number;
  latency_ms?: number;
  touched_entity_ids?: string[];
  output?: Record<string, unknown>;
}

export interface AgentTask {
  id: string;
  run_id: string;
  incident_id: string;
  status: "open" | "claimed" | "completed";
  assigned_to: string;
  handoffs?: Array<{
    from_agent: string;
    to_agent: string;
    reason: string;
    ts: string;
    note?: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface AgentRunResponse {
  run_id: string;
  incident_id: string;
  status: string;
  final_output: string;
  steps: AgentStepTrace[];
  tasks: AgentTask[];
  reused_playbook?: boolean;
  total_latency_ms?: number;
  tenant?: string;
  memory_summary?: {
    episode_id?: string;
    procedure_name?: string;
    facts_recorded?: number;
  };
}

export interface MemoryEpisode {
  id: string;
  incident_id: string;
  summary: string;
  outcome: string;
  entities_touched: string[];
  created_at: string;
}

export interface MemoryFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  valid_at: string;
  invalid_at?: string | null;
  superseded_by?: string | null;
}

export interface MemoryProcedure {
  name: string;
  incident_pattern: string;
  step_sequence: string[];
  success_count: number;
  last_executed: string;
}

export async function fetchDemoIncidents(): Promise<DemoIncident[]> {
  const res = await fetch(`${BASE_URL}/agents/incidents`);
  if (!res.ok) {
    throw new Error(`Failed to fetch demo incidents: ${res.statusText}`);
  }
  const data = await res.json();
  return data.incidents ?? [];
}

export async function triggerAgentRun(
  incidentId: string,
  tenant = "acme",
  incidentData?: Partial<DemoIncident>
): Promise<AgentRunResponse> {
  const res = await fetch(`${BASE_URL}/agents/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenant,
    },
    body: JSON.stringify({
      incident_id: incidentId,
      title: incidentData?.title,
      service_id: incidentData?.service_id,
      description: incidentData?.description,
      dry_run: false,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Agent run failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchAgentTasks(
  tenant = "acme",
  status?: string
): Promise<AgentTask[]> {
  const url = status
    ? `${BASE_URL}/agents/tasks?status=${encodeURIComponent(status)}`
    : `${BASE_URL}/agents/tasks`;
  const res = await fetch(url, {
    headers: { "X-Tenant": tenant },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch agent tasks: ${res.statusText}`);
  }
  const data = await res.json();
  // the API names handoff fields from/to/note; the UI types use from_agent/to_agent/reason
  return (data.tasks ?? []).map((t: Record<string, unknown>) => ({
    ...t,
    handoffs: ((t.handoffs as Array<Record<string, string>> | undefined) ?? []).map((h) => ({
      from_agent: h.from_agent ?? h.from ?? "",
      to_agent: h.to_agent ?? h.to ?? "",
      reason: h.reason ?? h.note ?? "",
      note: h.note,
      ts: h.ts ?? "",
    })),
  })) as AgentTask[];
}

export async function fetchRunTrace(
  runId: string,
  tenant = "acme"
): Promise<AgentRunResponse> {
  const res = await fetch(`${BASE_URL}/agents/runs/${encodeURIComponent(runId)}`, {
    headers: { "X-Tenant": tenant },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch run trace: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchMemoryEpisodes(tenant = "acme"): Promise<MemoryEpisode[]> {
  const res = await fetch(`${BASE_URL}/memory/episodes`, {
    headers: { "X-Tenant": tenant },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch episodes: ${res.statusText}`);
  }
  const data = await res.json();
  return (data.episodes ?? []).map((e: Record<string, unknown>) => ({
    id: String(e.id ?? ""),
    incident_id: String(e.incident_id ?? ""),
    summary: String(e.summary ?? e.goal ?? ""),
    outcome: String(e.outcome ?? ""),
    entities_touched: Array.isArray(e.entities_touched) ? (e.entities_touched as string[]) : [],
    created_at: String(e.created_at ?? e.ts ?? ""),
  })) as MemoryEpisode[];
}

export async function fetchMemoryFacts(tenant = "acme"): Promise<MemoryFact[]> {
  const res = await fetch(`${BASE_URL}/memory/facts`, {
    headers: { "X-Tenant": tenant },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch facts: ${res.statusText}`);
  }
  const data = await res.json();
  return (data.facts ?? []).map((f: Record<string, unknown>) => ({
    ...f,
    confidence: typeof f.confidence === "number" ? f.confidence : 0.9,
  })) as MemoryFact[];
}

export async function fetchMemoryProcedures(tenant = "acme"): Promise<MemoryProcedure[]> {
  const res = await fetch(`${BASE_URL}/memory/procedures`, {
    headers: { "X-Tenant": tenant },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch procedures: ${res.statusText}`);
  }
  const data = await res.json();
  return (data.procedures ?? []).map((p: Record<string, unknown>) => ({
    name: String(p.name ?? `Playbook ${String(p.trigger_pattern ?? p.incident_pattern ?? "").replace(/^incident_/, "").toUpperCase()}`),
    incident_pattern: String(p.incident_pattern ?? p.trigger_pattern ?? ""),
    step_sequence: Array.isArray(p.step_sequence) ? (p.step_sequence as string[]) : Array.isArray(p.tool_sequence) ? (p.tool_sequence as string[]) : [],
    success_count: Number(p.success_count ?? 0),
    last_executed: String(p.last_executed ?? p.last_used ?? ""),
  })) as MemoryProcedure[];
}

export async function resetTenantMemory(tenant = "acme"): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/memory/reset`, {
    method: "POST",
    headers: { "X-Tenant": tenant },
  });
  if (!res.ok) {
    throw new Error(`Failed to reset memory: ${res.statusText}`);
  }
  return res.json();
}

