"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchHealth, fetchTopology, runAudit, TopologyData, TopologyNode, type Health } from "@/lib/nexus/api";

import { AuditBar, AuditKind } from "@/components/nexus/AuditBar";
import { LiveTopology } from "@/components/nexus/LiveTopology";
import { OfficeFloor } from "@/components/nexus/OfficeFloor";
import { AskPanel } from "@/components/nexus/AskPanel";
import { AgentPanel } from "@/components/nexus/AgentPanel";
import { NodeInspector } from "@/components/nexus/NodeInspector";
import { SimulateSyncButton } from "@/components/nexus/SimulateSyncButton";
import { MergedFooter } from "@/components/nexus/MergedFooter";
import {
  PixelRobot,
  PixelLightbulb,
  PixelInfo,
  PixelClose,
  PixelChevronDown,
  PixelChevronUp,
} from "@/components/nexus/PixelIcons";
import { useIngestStream } from "@/lib/nexus/useIngestStream";
import { useAgentStream } from "@/lib/nexus/useAgentStream";
import { useSystemStatus } from "@/lib/nexus/useSystemStatus";

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
  const agentStream = useAgentStream();
  const [tenant, setTenant] = useState<string>("acme");
  const [sidebarTab, setSidebarTab] = useState<"agents" | "ask">("agents");
  const [llm, setLlm] = useState<Health["llm"] | null>(null);
  const [showTrackInfo, setShowTrackInfo] = useState(false);
  const [ledgerCollapsed, setLedgerCollapsed] = useState(false);

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

  const clearAudit = useCallback(() => {
    setHighlightIds([]);
    setActiveAudit(null);
    setAuditCypher(null);
  }, []);

  const handleRunAudit = async (kind: AuditKind) => {
    if (activeAudit === kind) {
      clearAudit();
      return;
    }
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

  // Keyboard shortcut: Esc clears audits, inspector, and info popover
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearAudit();
        setInspected(null);
        setShowTrackInfo(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearAudit]);

  const decisions = useMemo(() => topology.nodes.filter((n) => n.group === "Decision"), [topology.nodes]);
  const dead = useMemo(() => decisions.filter((n) => String(n.properties?.status) === "superseded").length, [decisions]);
  const openIncidents = useMemo(
    () => topology.nodes.filter((n) => n.group === "Incident" || n.group === "incident"),
    [topology.nodes]
  );

  const combinedHighlights = useMemo(() => {
    return Array.from(new Set([...highlightIds, ...agentStream.touchedIds]));
  }, [highlightIds, agentStream.touchedIds]);

  // Unified system status hook
  const systemStatus = useSystemStatus({
    online,
    llm,
    streamLive: live,
    isStreaming: Boolean(event && Date.now() - lastLoad.current < 2000),
    podRunning: agentStream.isRunning,
    podDone: Boolean(agentStream.completedRun && agentStream.completedRun.status === "completed"),
    podError: agentStream.completedRun?.status === "failed" ? "Agent run failed" : null,
  });

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "var(--header-h) 1fr var(--footer-h)",
        height: "100dvh",
        overflow: "hidden",
        background: "var(--nx-bg)",
      }}
    >
      {/* 56px Single-Row Header */}
      <header
        className="flex items-center justify-between gap-4 px-4 shrink-0"
        style={{
          height: "var(--header-h)",
          borderBottom: "var(--bd)",
          background: "var(--nx-panel)",
          flexWrap: "nowrap",
          position: "relative",
          zIndex: 20,
        }}
      >
        {/* Left: Brand, Subtitle, Popover, Compound status */}
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="flex items-baseline gap-2">
            <h1 className="nx-display text-sm" style={{ color: "var(--nx-accent)", margin: 0, letterSpacing: ".08em" }}>
              NEXUS
            </h1>
            <span className="nx-mono text-xs hidden md:inline" style={{ color: "var(--nx-muted)" }}>
              company brain
            </span>
          </div>

          {/* Track ⓘ Popover Button */}
          <div className="relative">
            <button
              type="button"
              className="nx-btn"
              style={{ height: 26, width: 26, padding: 0, color: showTrackInfo ? "var(--nx-accent)" : "var(--nx-muted)" }}
              onClick={() => setShowTrackInfo((s) => !s)}
              title="Track Qualifications (WeMakeDevs x FalkorDB)"
              aria-label="View track qualifications"
              aria-expanded={showTrackInfo}
            >
              <PixelInfo size={14} />
            </button>

            {showTrackInfo && (
              <div
                className="absolute top-8 left-0 z-50 nx-panel p-3 shadow-2xl"
                style={{ width: 330, border: "var(--bd)", background: "var(--nx-panel)" }}
                role="dialog"
                aria-label="Track Qualifications"
              >
                <div className="flex items-center justify-between pb-2 mb-2" style={{ borderBottom: "1px solid var(--nx-line)" }}>
                  <span className="nx-display text-xs" style={{ color: "var(--nx-accent)" }}>
                    TRACK QUALIFICATIONS
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTrackInfo(false)}
                    className="nx-btn"
                    style={{ height: 20, width: 20, padding: 0 }}
                    aria-label="Close"
                  >
                    <PixelClose size={12} />
                  </button>
                </div>
                <div className="nx-mono text-xs flex flex-col gap-2.5">
                  <div>
                    <div className="font-bold" style={{ color: "var(--nx-accent)" }}>Track 1: Agents That Act</div>
                    <div style={{ color: "var(--nx-muted)", marginTop: 2 }}>
                      Autonomous 3-agent pod (Scout, Planner, Scribe) taking live multi-step triage actions.
                    </div>
                  </div>
                  <div>
                    <div className="font-bold" style={{ color: "var(--nx-info)" }}>Track 2: Memory & Coordination</div>
                    <div style={{ color: "var(--nx-muted)", marginTop: 2 }}>
                      Episodic & semantic memory graph, shared tasks, and tenant isolation (Acme vs Globex).
                    </div>
                  </div>
                  <div>
                    <div className="font-bold" style={{ color: "var(--nx-ok)" }}>Track 3: Company Brain</div>
                    <div style={{ color: "var(--nx-muted)", marginTop: 2 }}>
                      Living knowledge graph of teams, systems, decisions, and temporal superseding.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Compound Status Chip: graph · claude · stream */}
          <div
            className="nx-chip flex items-center gap-2"
            style={{ height: 28, padding: "0 10px", background: "var(--nx-panel-2)" }}
            role="status"
            aria-label="System status"
          >
            <span className="flex items-center gap-1.5" title={systemStatus.graph.tooltip}>
              <span className={`nx-dot ${systemStatus.graph.dotClass}`} />
              <span className="nx-mono text-[11px]">{systemStatus.graph.label}</span>
            </span>
            <span style={{ color: "var(--nx-line)" }}>·</span>
            <span className="flex items-center gap-1.5" title={systemStatus.claude.tooltip}>
              <span className={`nx-dot ${systemStatus.claude.dotClass}`} />
              <span className="nx-mono text-[11px]">{systemStatus.claude.label}</span>
            </span>
            <span style={{ color: "var(--nx-line)" }}>·</span>
            <span className="flex items-center gap-1.5" title={systemStatus.stream.tooltip}>
              <span className={`nx-dot ${systemStatus.stream.dotClass}`} />
              <span className="nx-mono text-[11px]">{systemStatus.stream.label}</span>
            </span>
          </div>
        </div>

        {/* Right: Tenant Select, View Segmented Control, Replay Sync */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Tenant Switcher (max-width: 220px) */}
          <label
            className="nx-chip cursor-pointer flex items-center gap-1.5"
            style={{ height: 32, padding: "0 8px", maxWidth: 220 }}
            title="Track 2 Tenant Isolation: Switch between Acme and Globex memory graphs"
          >
            <span className="nx-dot" style={{ background: tenant === "globex" ? "var(--nx-warn)" : "var(--nx-ok)" }} />
            <select
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              className="bg-transparent nx-mono cursor-pointer text-xs"
              style={{
                border: "none",
                color: "var(--nx-text)",
                outline: "none",
                padding: 0,
                maxWidth: 180,
              }}
              data-testid="tenant-select"
            >
              <option value="acme" style={{ background: "var(--nx-panel)", color: "var(--nx-text)" }}>
                Acme Payments
              </option>
              <option value="globex" style={{ background: "var(--nx-panel)", color: "var(--nx-text)" }}>
                Globex Corp (Isolated)
              </option>
            </select>
          </label>

          {/* Segmented Office | Graph control */}
          <div className="nx-seg" role="group" aria-label="View Mode">
            <button
              type="button"
              className="nx-btn"
              data-testid="view-office"
              aria-pressed={view === "office"}
              onClick={() => setView("office")}
            >
              OFFICE
            </button>
            <button
              type="button"
              className="nx-btn"
              data-testid="view-graph"
              aria-pressed={view === "graph"}
              onClick={() => setView("graph")}
            >
              GRAPH
            </button>
          </div>

          {/* Yellow Replay Sync CTA */}
          <SimulateSyncButton onSyncCompleted={handleSync} />
        </div>
      </header>

      {/* Main Body: Floor Panel (1fr) + Side Panel (420px / 360px) */}
      <div
        className="nexus-main-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) var(--side-w)",
          gap: "var(--s4)",
          padding: "var(--s4)",
          minHeight: 0,
          height: "100%",
        }}
      >
        {/* FLOOR / GRAPH PANEL */}
        <main className="nx-panel flex flex-col min-h-0 min-w-0" aria-label="Office floor and topology">
          {/* 44px Panel Toolbar with Merged Audits on Left and Stats on Right */}
          <header className="nx-panel-head" style={{ height: "var(--toolbar-h)", minHeight: "var(--toolbar-h)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <AuditBar activeAudit={activeAudit} loadingAudit={loadingAudit} onRunAudit={handleRunAudit} />
              {activeAudit && (
                <div className="flex items-center gap-2">
                  <span className="nx-chip text-xs">
                    {combinedHighlights.length} hit{combinedHighlights.length !== 1 ? "s" : ""}
                  </span>
                  {auditCypher && (
                    <code className="nx-mono truncate hidden xl:inline text-xs" style={{ color: "var(--nx-info)", maxWidth: 360 }} title={auditCypher}>
                      {auditCypher.replace(/\s+/g, " ")}
                    </code>
                  )}
                  <button
                    type="button"
                    className="nx-btn"
                    style={{ height: 26, padding: "0 6px", fontSize: 10 }}
                    onClick={clearAudit}
                  >
                    CLEAR
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="nx-chip text-xs">{topology.nodes.length} things</span>
              <span className="nx-chip text-xs">{topology.links.length} links</span>
              <span className="nx-chip text-xs" style={{ color: dead > 0 ? "var(--nx-warn)" : "var(--nx-muted)" }}>
                <span className={`nx-dot ${dead > 0 ? "is-busy" : "is-muted"}`} />
                {dead} replaced
              </span>
            </div>
          </header>

          {/* Interactive Canvas Area */}
          <div className="relative flex-1 min-h-0">
            {view === "office" ? (
              <OfficeFloor
                data={topology}
                highlightIds={combinedHighlights}
                onNodeClick={setInspected}
                event={event}
                latestStep={agentStream.latestStep}
                latestHandoff={agentStream.latestHandoff}
                activeAgent={agentStream.activeAgent}
              />
            ) : (
              <LiveTopology data={topology} highlightIds={combinedHighlights} onNodeClick={setInspected} />
            )}

            {online === false && (
              <p
                role="alert"
                className="absolute inset-0 flex items-center justify-center text-center p-8 nx-mono text-sm"
                style={{ background: "rgba(10, 15, 20, 0.88)", color: "var(--nx-bad)" }}
              >
                The API is not answering. Start it on port 8000, then reload.
              </p>
            )}
            {online && topology.nodes.length === 0 && (
              <p
                className="absolute inset-0 flex items-center justify-center text-center p-8 nx-mono text-sm"
                style={{ background: "rgba(10, 15, 20, 0.88)", color: "var(--nx-muted)" }}
              >
                The graph is empty. Seed it with scripts/seed.py or replay the company sync.
              </p>
            )}

            <NodeInspector node={inspected} onClose={() => setInspected(null)} />
          </div>
        </main>

        {/* SIDE PANEL */}
        <aside
          className="nx-panel flex flex-col min-h-0"
          aria-label="Agent Pod and Company Brain"
          style={{ overflow: "hidden" }}
        >
          {/* Tabs bar: AGENT POD | ASK BRAIN */}
          <header className="nx-panel-head" style={{ height: "var(--toolbar-h)", minHeight: "var(--toolbar-h)" }}>
            <div className="nx-seg" role="tablist">
              <button
                type="button"
                onClick={() => setSidebarTab("agents")}
                className="nx-btn flex items-center gap-1.5"
                aria-pressed={sidebarTab === "agents"}
                data-testid="tab-sidebar-agents"
              >
                <PixelRobot size={14} />
                <span>AGENT POD</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("ask")}
                className="nx-btn flex items-center gap-1.5"
                aria-pressed={sidebarTab === "ask"}
                data-testid="tab-sidebar-ask"
              >
                <PixelLightbulb size={14} />
                <span>ASK BRAIN</span>
              </button>
            </div>

            {/* Status indicator in tab row */}
            {sidebarTab === "agents" ? (
              <span className="nx-chip text-[11px]" title={systemStatus.pod.tooltip}>
                <span className={`nx-dot ${systemStatus.pod.dotClass}`} />
                <span>{systemStatus.pod.label}</span>
              </span>
            ) : (
              <span className="nx-chip text-[11px]">
                <span className="nx-dot" />
                <span>sources shown</span>
              </span>
            )}
          </header>

          {/* Active Tab Content Area (Scrolls) */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {sidebarTab === "agents" ? (
              <AgentPanel
                tenant={tenant}
                agentStream={agentStream}
                onHighlightEntities={setHighlightIds}
                onClearHighlights={() => setHighlightIds([])}
              />
            ) : (
              <AskPanel />
            )}
          </div>

          {/* Decision Ledger Drawer: 240px tall, collapsible to 36px header */}
          <section
            aria-label="Decision ledger"
            className="flex flex-col min-h-0 shrink-0"
            style={{
              borderTop: "var(--bd)",
              background: "var(--nx-panel)",
              height: ledgerCollapsed ? 36 : 240,
              transition: "height 0.15s steps(4)",
            }}
          >
            <header
              className="flex items-center justify-between px-3 cursor-pointer select-none shrink-0"
              style={{
                height: 36,
                background: "var(--nx-panel-2)",
                borderBottom: ledgerCollapsed ? "none" : "1px solid var(--nx-line)",
              }}
              onClick={() => setLedgerCollapsed((c) => !c)}
            >
              <div className="flex items-center gap-2">
                <span className="nx-display text-xs" style={{ color: "var(--nx-text)" }}>
                  DECISION LEDGER
                </span>
                <span className="nx-chip text-[10px]" style={{ height: 20, padding: "0 6px" }}>
                  {decisions.length - dead} live
                </span>
              </div>
              <button
                type="button"
                className="nx-btn"
                style={{ height: 22, width: 22, padding: 0 }}
                aria-label={ledgerCollapsed ? "Expand Decision Ledger" : "Collapse Decision Ledger"}
              >
                {ledgerCollapsed ? <PixelChevronUp size={12} /> : <PixelChevronDown size={12} />}
              </button>
            </header>

            {!ledgerCollapsed && (
              <div className="flex-1 min-h-0 overflow-y-auto p-2 nx-mono text-xs">
                {decisions.length === 0 ? (
                  <p className="p-3 text-center" style={{ color: "var(--nx-muted)" }}>
                    Replay the company sync to populate decisions.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {[...decisions]
                      .sort((a, b) => String(b.properties?.decided_at ?? "").localeCompare(String(a.properties?.decided_at ?? "")))
                      .map((d) => {
                        const old = String(d.properties?.status) === "superseded";
                        const title = String(d.properties?.summary ?? d.properties?.title ?? d.label ?? d.id);
                        const date = String(d.properties?.decided_at ?? "").slice(5, 10);
                        const supersededBy = d.properties?.superseded_by ? String(d.properties.superseded_by) : null;

                        return (
                          <li key={d.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setInspected(d);
                                setHighlightIds([d.id, ...(supersededBy ? [supersededBy] : [])]);
                              }}
                              className="flex items-center justify-between gap-2 w-full px-2 py-1 text-left nx-hover"
                              style={{
                                background: "var(--nx-panel-2)",
                                border: "1px solid var(--nx-line)",
                                cursor: "pointer",
                                opacity: old ? 0.75 : 1,
                              }}
                              title={title}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 truncate">
                                <span className="font-bold shrink-0" style={{ color: "var(--nx-accent)" }}>
                                  {d.id}
                                </span>
                                <span className="truncate" style={{ textDecoration: old ? "line-through" : "none" }}>
                                  {title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span style={{ color: "var(--nx-muted)" }}>{date}</span>
                                {old ? (
                                  <span
                                    className="nx-chip text-[10px]"
                                    style={{ height: 18, padding: "0 4px", color: "var(--nx-warn)", borderColor: "var(--nx-warn)" }}
                                  >
                                    REPLACED{supersededBy ? ` → ${supersededBy}` : ""}
                                  </span>
                                ) : (
                                  <span
                                    className="nx-chip text-[10px]"
                                    style={{ height: 18, padding: "0 4px", color: "var(--nx-ok)", borderColor: "var(--nx-ok)" }}
                                  >
                                    LIVE
                                  </span>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* 36px Merged Footer */}
      <MergedFooter
        live={live}
        refreshKey={syncTick + (event?.seq ?? 0)}
        liveDecisionsCount={decisions.length - dead}
        deadDecisionsCount={dead}
        hasIncidents={openIncidents.length > 0}
      />
    </div>
  );
}
