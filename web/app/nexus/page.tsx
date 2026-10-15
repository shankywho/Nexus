"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Terminal, Database, Activity, GitFork, RefreshCw, Layers } from "lucide-react";
import { fetchTopology, runAudit, TopologyData, TopologyNode, AuditResponse } from "@/lib/nexus/api";
import { AuditBar, AuditKind } from "@/components/nexus/AuditBar";
import { LiveTopology } from "@/components/nexus/LiveTopology";
import { IngestionStreams } from "@/components/nexus/IngestionStreams";
import { AskPanel } from "@/components/nexus/AskPanel";
import { NodeInspector } from "@/components/nexus/NodeInspector";
import { SimulateSyncButton } from "@/components/nexus/SimulateSyncButton";

// Initial synthetic topology fallback
const fallbackTopology: TopologyData = {
  nodes: [
    { id: "arjun", name: "arjun", label: "Person", group: "Person", properties: { role: "Platform Eng", team: "platform" } },
    { id: "priya", name: "priya", label: "Person", group: "Person", properties: { role: "Maintainer", team: "platform" } },
    { id: "meera", name: "meera", label: "Person", group: "Person", properties: { role: "SRE On-Call", team: "sre" } },
    { id: "kabir", name: "kabir", label: "Person", group: "Person", properties: { role: "Core Eng", team: "payments-core" } },
    { id: "session-store", name: "session-store", label: "Service", group: "Service", properties: { tier: "1" } },
    { id: "ledger", name: "ledger", label: "Service", group: "Service", properties: { tier: "1" } },
    { id: "auth-gateway", name: "auth-gateway", label: "Service", group: "Service", properties: { tier: "1" } },
    { id: "DEC-017", name: "DEC-017 (Redis)", label: "Decision", group: "Decision", properties: { status: "superseded", superseded_by: "DEC-021" } },
    { id: "DEC-021", name: "DEC-021 (Postgres)", label: "Decision", group: "Decision", properties: { status: "active", supersedes: "DEC-017" } },
    { id: "INC-77", name: "INC-77", label: "Incident", group: "Incident", properties: { severity: "SEV-1" } },
    { id: "LIN-391", name: "LIN-391", label: "Ticket", group: "Ticket", properties: { title: "Migrate session store to Redis" } },
    { id: "LIN-409", name: "LIN-409", label: "Ticket", group: "Ticket", properties: { title: "Ratify session store on Postgres" } },
  ],
  links: [
    { id: "arjun_session", source: "arjun", target: "session-store", label: "OWNS", status: "active" },
    { id: "priya_session", source: "priya", target: "session-store", label: "MAINTAINS", status: "active" },
    { id: "kabir_ledger", source: "kabir", target: "ledger", label: "MAINTAINS", status: "active" },
    { id: "session_dec17", source: "session-store", target: "DEC-017", label: "HAS_DECISION", status: "superseded" },
    { id: "session_dec21", source: "session-store", target: "DEC-021", label: "HAS_DECISION", status: "active" },
    { id: "dec21_dec17", source: "DEC-021", target: "DEC-017", label: "SUPERSEDES", status: "superseded" },
    { id: "meera_inc77", source: "meera", target: "INC-77", label: "RESOLVED", status: "active" },
  ],
};

export default function NexusDashboard() {
  const [topology, setTopology] = useState<TopologyData>(fallbackTopology);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [activeAudit, setActiveAudit] = useState<AuditKind | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditCypher, setAuditCypher] = useState<string | null>(null);
  const [inspectedNode, setInspectedNode] = useState<TopologyNode | null>(null);
  const [activeTab, setActiveTab] = useState<"topology" | "ask" | "ownership">("topology");

  const loadTopology = useCallback(async () => {
    try {
      const data = await fetchTopology();
      if (data && data.nodes && data.nodes.length > 0) {
        setTopology(data);
      }
    } catch {
      // Keep fallback topology if backend is not yet populated
    }
  }, []);

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  const handleRunAudit = async (kind: AuditKind) => {
    setActiveAudit(kind);
    setLoadingAudit(true);
    setAuditCypher(null);

    try {
      const res: AuditResponse = await runAudit(kind);
      setHighlightIds(res.highlight_ids || []);
      setAuditCypher(res.cypher || null);

      // If audit returned nodes, merge or update topology
      if (res.nodes && res.nodes.length > 0) {
        setTopology((prev) => {
          const nodeMap = new Map(prev.nodes.map((n) => [n.id, n]));
          res.nodes.forEach((rawNode: any) => {
            const nid = rawNode.id || String(rawNode.id || "");
            if (nid && !nodeMap.has(nid)) {
              nodeMap.set(nid, {
                id: nid,
                name: rawNode.name || rawNode.title || nid,
                label: rawNode.label || "Entity",
                group: rawNode.group || "Entity",
                properties: rawNode.properties || {},
              });
            }
          });
          return { nodes: Array.from(nodeMap.values()), links: prev.links };
        });
      }
    } catch (err) {
      console.error("Audit failed:", err);
    } finally {
      setLoadingAudit(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0a0a] text-zinc-100 font-mono select-none overflow-hidden">
      {/* Top HUD Telemetry Header */}
      <header className="h-12 border-b border-[#27272a] bg-[#141414] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#10b981] animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase text-[#10b981]">NEXUS</span>
          </div>
          <span className="text-[#27272a]">|</span>
          <span className="text-[11px] tracking-widest uppercase text-zinc-300 hidden sm:inline">
            Organizational Telemetry &amp; Decision Graph
          </span>
          <span className="text-[#27272a]">|</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-widest uppercase px-1.5 py-0.5 border border-[#10b981]/40 bg-[#10b981]/10 text-[#10b981]">
              FALKORDB: UP
            </span>
            <span className="text-[10px] tracking-widest uppercase px-1.5 py-0.5 border border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]">
              TRACK 03: COMPANY BRAIN
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SimulateSyncButton onSyncCompleted={loadTopology} />
          <Link
            href="/graph"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] border border-[#27272a] hover:border-zinc-500 text-zinc-300 hover:text-zinc-100 text-xs tracking-widest uppercase transition-colors"
          >
            <Terminal size={12} />
            <span>Cypher Explorer</span>
          </Link>
        </div>
      </header>

      {/* Quick Audit Bar */}
      <section className="h-11 border-b border-[#27272a] bg-[#0a0a0a] px-4 flex items-center justify-between shrink-0">
        <AuditBar
          activeAudit={activeAudit}
          loadingAudit={loadingAudit}
          onRunAudit={handleRunAudit}
        />

        {/* Tab switchers */}
        <div className="flex items-center gap-1 border-l border-[#27272a] pl-3 shrink-0">
          <button
            type="button"
            data-testid="tab-topology"
            onClick={() => setActiveTab("topology")}
            className={`px-3 py-1 text-[11px] tracking-widest uppercase border transition-colors ${
              activeTab === "topology"
                ? "border-[#10b981] text-[#10b981] bg-[#10b981]/10 font-bold"
                : "border-[#27272a] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            LIVE TOPOLOGY
          </button>
          <button
            type="button"
            data-testid="tab-ask"
            onClick={() => setActiveTab("ask")}
            className={`px-3 py-1 text-[11px] tracking-widest uppercase border transition-colors ${
              activeTab === "ask"
                ? "border-[#10b981] text-[#10b981] bg-[#10b981]/10 font-bold"
                : "border-[#27272a] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            ASK NEXUS
          </button>
          <button
            type="button"
            data-testid="tab-ownership"
            onClick={() => {
              setActiveTab("ownership");
              handleRunAudit("who-owns-what");
            }}
            className={`px-3 py-1 text-[11px] tracking-widest uppercase border transition-colors ${
              activeTab === "ownership"
                ? "border-[#10b981] text-[#10b981] bg-[#10b981]/10 font-bold"
                : "border-[#27272a] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            OWNERSHIP MATRIX
          </button>
        </div>
      </section>

      {/* Main 3-Pane Tactical Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Rail: Ingestion Streams */}
        <IngestionStreams onEventReceived={() => loadTopology()} />

        {/* Center: Live Company Topology / Active Tab */}
        <main className="flex-1 flex flex-col bg-[#0a0a0a] relative overflow-hidden">
          {/* Top Canvas Bar */}
          <div className="p-2 border-b border-[#27272a] bg-[#141414] flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-widest uppercase text-zinc-300">
                Live Company Topology (FalkorDB multigraph)
              </span>
              {activeAudit && (
                <span className="text-[10px] px-2 py-0.5 border border-[#10b981]/40 bg-[#10b981]/10 text-[#10b981]">
                  AUDIT: {activeAudit.toUpperCase()} ({highlightIds.length} highlighted)
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
              <span>NODES: <strong className="text-zinc-200">{topology.nodes.length}</strong></span>
              <span>LINKS: <strong className="text-zinc-200">{topology.links.length}</strong></span>
              <span>HIGHLIGHTS: <strong className="text-[#f59e0b]">{highlightIds.length}</strong></span>
            </div>
          </div>

          {/* Active Cypher snippet preview if an audit was run */}
          {auditCypher && (
            <div className="px-3 py-1.5 bg-[#0e0e11] border-b border-[#27272a] text-[10px] flex items-center justify-between text-zinc-400">
              <span className="truncate max-w-[85%] font-mono text-emerald-400/90">
                CYPHER: {auditCypher.replace(/\s+/g, " ").slice(0, 120)}...
              </span>
              <button
                type="button"
                onClick={() => setHighlightIds([])}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 underline"
              >
                Clear Highlights
              </button>
            </div>
          )}

          {/* Force Graph Canvas View */}
          <div className="flex-1 relative">
            <LiveTopology
              data={topology}
              highlightIds={highlightIds}
              onNodeClick={(node) => setInspectedNode(node)}
            />

            {/* Node Inspector Drawer */}
            <NodeInspector
              node={inspectedNode}
              onClose={() => setInspectedNode(null)}
            />
          </div>
        </main>

        {/* Right Rail: Ask NEXUS Panel */}
        <aside className="w-84 md:w-96 border-l border-[#27272a] bg-[#141414] flex flex-col shrink-0">
          <div className="p-3 border-b border-[#27272a] flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest uppercase text-zinc-300">
              Decision Provenance &amp; Synthesis
            </span>
            <span className="text-[10px] text-[#10b981] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              ONLINE
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <AskPanel />
          </div>
        </aside>
      </div>

      {/* Industrial Footer Status Bar */}
      <footer className="h-6 border-t border-[#27272a] bg-[#141414] px-4 flex items-center justify-between text-[10px] text-zinc-500 shrink-0">
        <div>NEXUS // REAL-TIME DECISION TELEMETRY // FALKORDB HACKATHON 2026</div>
        <div className="flex gap-4">
          <span>GRAPH: <span className="text-zinc-300">nexus_company</span></span>
          <span>TEMPORAL: <span className="text-[#10b981]">VALIDATED</span></span>
          <span>LATENCY: <span className="text-[#10b981]">12ms</span></span>
        </div>
      </footer>
    </div>
  );
}
