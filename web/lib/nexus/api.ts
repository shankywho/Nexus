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
