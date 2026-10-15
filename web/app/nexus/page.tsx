"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchHealth, fetchTopology, runAudit, TopologyData, TopologyNode, type Health } from "@/lib/nexus/api";
import { AuditBar, AuditKind } from "@/components/nexus/AuditBar";
import { LiveTopology } from "@/components/nexus/LiveTopology";
import { OfficeFloor } from "@/components/nexus/OfficeFloor";
import { IngestionStreams } from "@/components/nexus/IngestionStreams";
import { AskPanel } from "@/components/nexus/AskPanel";
import { NodeInspector } from "@/components/nexus/NodeInspector";
import { SimulateSyncButton } from "@/components/nexus/SimulateSyncButton";
import { useIngestStream } from "@/lib/nexus/useIngestStream";

const EMPTY: TopologyData = { nodes: [], links: [] };

export default function NexusDashboard() {
  const [topology, setTopology] = useState<TopologyData>(EMPTY);
  const [online, setOnline] = useState<boolean | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [activeAudit, setActiveAudit] = useState<AuditKind | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditCypher, setAuditCypher] = useState<string | null>(null);
  const [inspected, setInspected] = useState<TopologyNode | null>(null);
  const [view, setView] = useState<"office" | "graph">("office");
  const [syncTick, setSyncTick] = useState(0);
  const { live, event } = useIngestStream();
  const [llm, setLlm] = useState<Health["llm"] | null>(null);

  const loadTopology = useCallback(async () => {
    try {
      const data = await fetchTopology();
      setTopology(data);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    loadTopology();
    fetchHealth()
      .then((h) => setLlm(h.llm))
      .catch(() => setLlm(null));
  }, [loadTopology]);

  // refresh the graph while events stream in, at most about once a second, so boards flip as it happens
  const lastLoad = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!event || pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      lastLoad.current = Date.now();
      loadTopology();
    }, Math.max(0, 1000 - (Date.now() - lastLoad.current)));
  }, [event, loadTopology]);
  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  const handleSync = useCallback(() => {
    loadTopology();
    setSyncTick((t) => t + 1);
  }, [loadTopology]);

  const handleRunAudit = async (kind: AuditKind) => {
    setActiveAudit(kind);
    setLoadingAudit(true);
    setAuditCypher(null);
    try {
      const res = await runAudit(kind);
      setHighlightIds(res.highlight_ids || []);
      setAuditCypher(res.cypher || null);
    } catch (err) {
      console.error("Audit failed:", err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const clearAudit = () => {
    setHighlightIds([]);
    setActiveAudit(null);
    setAuditCypher(null);
  };

  const decisions = topology.nodes.filter((n) => n.group === "Decision");
  const dead = decisions.filter((n) => String(n.properties?.status) === "superseded").length;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between gap-4 px-5 py-3 shrink-0" style={{ borderBottom: "4px solid var(--nx-ink)", background: "var(--nx-panel)" }}>
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="nx-display" style={{ fontSize: 14, color: "var(--nx-lemon)", margin: 0 }}>NEXUS</h1>
          <span style={{ color: "var(--nx-dim)" }}>Company brain for Acme Payments</span>
          <span className="nx-chip">
            <span className={`nx-dot ${online === false ? "is-bad" : ""}`} />
            {online === false ? "api offline" : online ? "graph online" : "connecting"}
          </span>
          {llm && (
            <span className="nx-chip" data-testid="llm-chip" title={llm.mode === "scripted" ? "Set ANTHROPIC_API_KEY in .env and restart the API to answer with Claude" : `Answers come from ${llm.model ?? llm.provider}`}>
              <span className={`nx-dot ${llm.mode === "scripted" ? "is-busy" : ""}`} />
              {llm.mode === "scripted" ? "offline answers" : `${llm.mode === "claude" ? "Claude" : "OpenAI"} live`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2" role="group" aria-label="View">
            {(["office", "graph"] as const).map((v) => (
              <button key={v} type="button" className="nx-btn" data-testid={`view-${v}`} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "office" ? "Office" : "Graph"}
              </button>
            ))}
          </div>
          <SimulateSyncButton onSyncCompleted={handleSync} />
        </div>
      </header>

      <div className="flex items-center justify-between gap-4 px-5 py-3 shrink-0" style={{ background: "var(--nx-bg)" }}>
        <AuditBar activeAudit={activeAudit} loadingAudit={loadingAudit} onRunAudit={handleRunAudit} />
        <div className="flex items-center gap-3 min-w-0">
          {activeAudit && (
            <>
              <span className="nx-chip">
                {highlightIds.length} highlighted
              </span>
              {auditCypher && (
                <code className="nx-mono truncate" style={{ color: "var(--nx-sky)", maxWidth: 520 }} title={auditCypher}>
                  {auditCypher.replace(/\s+/g, " ")}
                </code>
              )}
              <button type="button" className="nx-btn" onClick={clearAudit}>
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 grid gap-3 px-3 pb-2" style={{ gridTemplateColumns: "minmax(0, 1fr) clamp(320px, 24vw, 380px)" }}>
        <main className="nx-panel flex flex-col min-h-0 min-w-0" aria-label="Office floor">
          <header className="nx-panel-head">
            <span className="nx-display">{view === "office" ? "Acme Payments · floor 1" : "Decision graph"}</span>
            <span className="flex gap-2">
              <span className="nx-chip">{topology.nodes.length} things</span>
              <span className="nx-chip">{topology.links.length} links</span>
              <span className="nx-chip">
                <span className="nx-dot is-bad" />
                {dead} of {decisions.length} decisions replaced
              </span>
            </span>
          </header>
          <div className="relative flex-1 min-h-0">
            {view === "office" ? (
              <OfficeFloor data={topology} highlightIds={highlightIds} onNodeClick={setInspected} event={event} />
            ) : (
              <LiveTopology data={topology} highlightIds={highlightIds} onNodeClick={setInspected} />
            )}
            {online === false && (
              <p role="alert" className="absolute inset-0 flex items-center justify-center text-center p-8" style={{ background: "rgba(7,12,16,.85)" }}>
                The API is not answering. Start it on port 8000, then reload.
              </p>
            )}
            {online && topology.nodes.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-center p-8" style={{ background: "rgba(7,12,16,.85)" }}>
                The graph is empty. Seed it with scripts/seed.py or replay the company sync.
              </p>
            )}
            <NodeInspector node={inspected} onClose={() => setInspected(null)} />
          </div>
        </main>

        <aside className="nx-panel flex flex-col min-h-0" aria-label="Ask the company brain">
          <header className="nx-panel-head">
            <span className="nx-display">Ask the brain</span>
            <span className="nx-chip">
              <span className="nx-dot" />
              sources shown
            </span>
          </header>
          <div className="flex-1 min-h-0">
            <AskPanel />
          </div>
          <section aria-label="Decision ledger" style={{ borderTop: "4px solid var(--nx-ink)", maxHeight: 168 }} className="flex flex-col min-h-0">
            <header className="nx-panel-head">
              <span className="nx-display">Decision ledger</span>
              <span className="nx-chip">{decisions.length - dead} live</span>
            </header>
            <ul className="nx-scroll nx-mono px-3 py-2" style={{ listStyle: "none", margin: 0 }}>
              {[...decisions]
                .sort((a, b) => String(b.properties?.decided_at).localeCompare(String(a.properties?.decided_at)))
                .map((d) => {
                  const old = String(d.properties?.status) === "superseded";
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setInspected(d)}
                        className="flex w-full justify-between gap-3 text-left" title={String(d.properties?.summary ?? "")}
                        style={{ background: "none", border: 0, color: old ? "var(--nx-dim)" : "var(--nx-cream)", cursor: "pointer", padding: "2px 0", font: "inherit", whiteSpace: "nowrap", textDecoration: old ? "line-through" : "none" }}
                      >
                        <span>{d.id}</span>
                        <span style={{ textDecoration: "none", color: old ? "var(--nx-coral)" : "var(--nx-mint)" }}>
                          {old ? `replaced by ${String(d.properties?.superseded_by ?? "?")}` : "live"}
                        </span>
                        <span style={{ color: "var(--nx-dim)", textDecoration: "none" }}>{String(d.properties?.decided_at ?? "").slice(5, 10)}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        </aside>
      </div>

      <IngestionStreams live={live} refreshKey={syncTick + (event?.seq ?? 0)} />

      <footer className="flex items-center justify-between gap-6 px-5 py-2 shrink-0" style={{ background: "var(--nx-bg)", color: "var(--nx-dim)", fontSize: 13 }}>
        <span className="flex items-center gap-5">
          <span className="flex items-center gap-2"><i style={{ width: 14, height: 10, background: "#f6efd6", boxShadow: "0 0 0 2px var(--nx-ink)" }} />Live decision</span>
          <span className="flex items-center gap-2"><i style={{ width: 14, height: 10, background: "#c4bea6", boxShadow: "0 0 0 2px var(--nx-coral)" }} />Replaced decision</span>
          <span className="flex items-center gap-2"><i style={{ width: 10, height: 10, background: "var(--nx-coral)" }} />Open incident</span>
        </span>
        <span>Click any desk, rack or board for details</span>
      </footer>
    </div>
  );
}
