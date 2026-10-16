"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  triggerAgentRun,
  fetchAgentTasks,
  fetchMemoryEpisodes,
  fetchMemoryFacts,
  fetchMemoryProcedures,
  fetchDemoIncidents,
  type AgentStepTrace,
  type AgentTask,
  type MemoryEpisode,
  type MemoryFact,
  type MemoryProcedure,
  type DemoIncident,
  type AgentRunResponse,
} from "@/lib/nexus/api";
import type { UseAgentStreamReturn } from "@/lib/nexus/useAgentStream";
import { PixelZap } from "./PixelIcons";

interface AgentPanelProps {
  tenant: string;
  agentStream: UseAgentStreamReturn;
  onHighlightEntities: (ids: string[]) => void;
  onClearHighlights: () => void;
}

type PanelTab = "trace" | "memory" | "tasks";
type MemorySubTab = "episodes" | "facts" | "procedures";

export function AgentPanel({
  tenant,
  agentStream,
  onHighlightEntities,
  onClearHighlights,
}: AgentPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("trace");
  const [memorySubTab, setMemorySubTab] = useState<MemorySubTab>("episodes");
  const [incidents, setIncidents] = useState<DemoIncident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>("INC-83");
  const [loadingRun, setLoadingRun] = useState(false);
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);

  // Tenant-scoped memory state
  const [episodes, setEpisodes] = useState<MemoryEpisode[]>([]);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [procedures, setProcedures] = useState<MemoryProcedure[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [lastRunResponse, setLastRunResponse] = useState<AgentRunResponse | null>(null);

  // Load demo incidents
  useEffect(() => {
    fetchDemoIncidents()
      .then((res) => {
        setIncidents(res);
        if (res.length > 0) {
          setSelectedIncidentId((cur) => cur || res[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch memory data whenever tenant or tab changes
  const refreshMemory = useCallback(async () => {
    setLoadingMemory(true);
    try {
      const [ep, fa, pr, tk] = await Promise.all([
        fetchMemoryEpisodes(tenant).catch(() => []),
        fetchMemoryFacts(tenant).catch(() => []),
        fetchMemoryProcedures(tenant).catch(() => []),
        fetchAgentTasks(tenant).catch(() => []),
      ]);
      setEpisodes(ep);
      setFacts(fa);
      setProcedures(pr);
      setTasks(tk);
    } finally {
      setLoadingMemory(false);
    }
  }, [tenant]);

  useEffect(() => {
    refreshMemory();
  }, [refreshMemory, tenant]);

  // When agent run completes via SSE, refresh memory and tasks
  useEffect(() => {
    if (agentStream.completedRun) {
      refreshMemory();
    }
  }, [agentStream.completedRun, refreshMemory]);

  // Run the autonomous agent triage team
  const handleRunAgent = async (incidentIdToRun = selectedIncidentId) => {
    setLoadingRun(true);
    agentStream.clearRun();
    onClearHighlights();

    try {
      const res = await triggerAgentRun(incidentIdToRun, tenant);
      setLastRunResponse(res);
      // Highlight all touched nodes across the investigation
      const allTouched = new Set<string>();
      res.steps.forEach((s) => s.touched_entity_ids?.forEach((id) => allTouched.add(id)));
      if (allTouched.size > 0) {
        onHighlightEntities(Array.from(allTouched));
      }
      refreshMemory();
    } catch (err) {
      console.error("Agent run failed:", err);
    } finally {
      setLoadingRun(false);
    }
  };

  const stepsToDisplay: AgentStepTrace[] =
    agentStream.steps.length > 0
      ? agentStream.steps
      : lastRunResponse?.steps ?? [];

  const handleStepClick = (step: AgentStepTrace, idx: number) => {
    setExpandedStepIndex(expandedStepIndex === idx ? null : idx);
    if (step.touched_entity_ids && step.touched_entity_ids.length > 0) {
      onHighlightEntities(step.touched_entity_ids);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden text-sm" data-testid="agent-panel">
      {/* Agent Pod Status & Action Header */}
      <div
        className="p-3 shrink-0"
        style={{
          borderBottom: "2px solid var(--nx-ink)",
          background: "var(--nx-panel-2)",
        }}
      >
        <div className="flex items-center gap-2">
          <select
            value={selectedIncidentId}
            onChange={(e) => setSelectedIncidentId(e.target.value)}
            disabled={loadingRun || agentStream.isRunning}
            className="nx-input nx-mono flex-1 text-xs"
            style={{ height: 36, padding: "0 8px" }}
            data-testid="incident-select"
          >
            {incidents.map((inc) => (
              <option key={inc.id} value={inc.id}>
                {inc.id}: {inc.title} ({inc.severity})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => handleRunAgent()}
            disabled={loadingRun || agentStream.isRunning}
            className="nx-btn nx-btn--warn text-xs whitespace-nowrap"
            style={{ height: 36, padding: "0 12px" }}
            data-testid="page-agents-btn"
          >
            {loadingRun || agentStream.isRunning ? (
              <>
                <span className="nx-dot is-busy nx-blink" />
                <span>TRIAGING...</span>
              </>
            ) : (
              <>
                <PixelZap size={14} />
                <span>PAGE AGENTS</span>
              </>
            )}
          </button>
        </div>

        {/* Real-time Agent Status Banner */}
        {agentStream.isRunning && (
          <div
            className="mt-2.5 flex items-center justify-between px-2.5 py-1.5"
            style={{
              background: "var(--nx-ink)",
              border: "2px solid var(--nx-mint)",
              boxShadow: "0 0 0 2px var(--nx-ink)",
            }}
          >
            <span className="flex items-center gap-2 text-xs">
              <span className="nx-dot is-busy nx-blink" />
              <span>
                Active:{" "}
                <strong className="nx-mono uppercase" style={{ color: "var(--nx-mint)" }}>
                  {agentStream.activeAgent ?? "Triage Team"}
                </strong>
              </span>
            </span>
            <span className="nx-mono text-xs" style={{ color: "var(--nx-sky)" }}>
              {agentStream.latestStep ? `tool: ${agentStream.latestStep.tool}` : "Planning graph steps..."}
            </span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div
        className="flex gap-1.5 p-2 shrink-0"
        style={{
          borderBottom: "2px solid var(--nx-ink)",
          background: "var(--nx-panel)",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("trace")}
          className={`nx-btn flex-1 text-xs justify-center ${activeTab === "trace" ? "is-on" : ""}`}
          aria-pressed={activeTab === "trace"}
          data-testid="tab-trace"
        >
          Live Trace ({stepsToDisplay.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("memory")}
          className={`nx-btn flex-1 text-xs justify-center ${activeTab === "memory" ? "is-on" : ""}`}
          aria-pressed={activeTab === "memory"}
          data-testid="tab-memory"
        >
          Memory ({episodes.length + facts.length + procedures.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tasks")}
          className={`nx-btn flex-1 text-xs justify-center ${activeTab === "tasks" ? "is-on" : ""}`}
          aria-pressed={activeTab === "tasks"}
          data-testid="tab-tasks"
        >
          Tasks ({tasks.length})
        </button>
      </div>

      {/* Tab 1: Live Trace (Explainable MCP Steps & Cypher) */}
      {activeTab === "trace" && (
        <div className="flex-1 overflow-y-auto nx-scroll p-3 space-y-2.5">
          {stepsToDisplay.length === 0 ? (
            <div className="text-center py-8" style={{ color: "var(--nx-dim)" }}>
              <p className="text-xs">No active agent run recorded yet.</p>
              <p className="text-xs mt-1">
                Click <strong style={{ color: "var(--nx-lemon)" }}>Page Agents</strong> above to launch Scout, Planner, and Scribe.
              </p>
            </div>
          ) : (
            stepsToDisplay.map((step, idx) => {
              const isExpanded = expandedStepIndex === idx;
              const agentColor =
                step.agent === "scout"
                  ? "var(--nx-sky)"
                  : step.agent === "planner"
                  ? "var(--nx-lemon)"
                  : "var(--nx-mint)";

              return (
                <div
                  key={idx}
                  style={{
                    background: "var(--nx-panel-2)",
                    border: "2px solid var(--nx-ink)",
                    boxShadow: "inset 0 0 0 1px var(--nx-line)",
                  }}
                  className="overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => handleStepClick(step, idx)}
                    className="w-full flex items-center justify-between p-2.5 text-left cursor-pointer transition-colors"
                    style={{ background: isExpanded ? "rgba(7, 12, 16, 0.4)" : "transparent" }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="nx-mono text-xs" style={{ color: "var(--nx-dim)" }}>
                        #{step.step_n}
                      </span>
                      <span
                        className="nx-chip text-[11px] font-bold uppercase"
                        style={{
                          color: agentColor,
                          padding: "1px 6px",
                        }}
                      >
                        {step.agent}
                      </span>
                      <span className="nx-mono truncate font-bold" style={{ color: "var(--nx-cream)" }}>
                        {step.tool}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs shrink-0">
                      {step.rows_returned !== undefined && (
                        <span className="nx-mono" style={{ color: "var(--nx-sky)" }}>
                          {step.rows_returned} rows
                        </span>
                      )}
                      {step.latency_ms !== undefined && (
                        <span className="nx-mono" style={{ color: "var(--nx-mint)" }}>
                          {step.latency_ms}ms
                        </span>
                      )}
                      <span style={{ color: "var(--nx-lemon)" }}>{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div
                      className="p-3 space-y-2.5"
                      style={{ borderTop: "2px solid var(--nx-ink)", background: "var(--nx-ink)" }}
                    >
                      {/* Arguments */}
                      <div>
                        <span className="nx-display text-[10px]" style={{ color: "var(--nx-dim)" }}>
                          ARGS:
                        </span>
                        <pre
                          className="nx-mono mt-1 p-2 text-xs overflow-x-auto"
                          style={{
                            background: "rgba(19,36,47,0.7)",
                            border: "1px solid var(--nx-line)",
                            color: "var(--nx-cream)",
                          }}
                        >
                          {JSON.stringify(step.args, null, 2)}
                        </pre>
                      </div>

                      {/* Cypher Query */}
                      {step.cypher && (
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="nx-display text-[10px]" style={{ color: "var(--nx-sky)" }}>
                              CYPHER EXECUTED:
                            </span>
                            <span className="nx-mono text-[11px]" style={{ color: "var(--nx-dim)" }}>
                              FalkorDB
                            </span>
                          </div>
                          <pre
                            className="nx-mono mt-1 p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all"
                            style={{
                              background: "rgba(12,23,32,0.9)",
                              border: "1px solid var(--nx-sky)",
                              color: "var(--nx-sky)",
                            }}
                          >
                            {step.cypher}
                          </pre>
                        </div>
                      )}

                      {/* Touched Entities */}
                      {step.touched_entity_ids && step.touched_entity_ids.length > 0 && (
                        <div>
                          <span className="nx-display text-[10px]" style={{ color: "var(--nx-lemon)" }}>
                            TOUCHED GRAPH NODES ({step.touched_entity_ids.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {step.touched_entity_ids.map((id) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => onHighlightEntities([id])}
                                className="nx-chip cursor-pointer hover:bg-[var(--nx-line)]"
                                style={{ color: "var(--nx-accent)", border: "1px solid var(--nx-line)" }}
                                title="Click to highlight on Office Floor / Graph"
                              >
                                {id}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Native FalkorDB Memory (Episodic, Semantic, Procedural) */}
      {activeTab === "memory" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub-tabs */}
          <div
            className="flex gap-1.5 p-2 shrink-0"
            style={{
              borderBottom: "2px solid var(--nx-ink)",
              background: "var(--nx-panel)",
            }}
          >
            <button
              type="button"
              onClick={() => setMemorySubTab("episodes")}
              className={`nx-btn flex-1 text-xs justify-center ${memorySubTab === "episodes" ? "is-on" : ""}`}
              aria-pressed={memorySubTab === "episodes"}
            >
              Episodic ({episodes.length})
            </button>
            <button
              type="button"
              onClick={() => setMemorySubTab("facts")}
              className={`nx-btn flex-1 text-xs justify-center ${memorySubTab === "facts" ? "is-on" : ""}`}
              aria-pressed={memorySubTab === "facts"}
            >
              Semantic ({facts.length})
            </button>
            <button
              type="button"
              onClick={() => setMemorySubTab("procedures")}
              className={`nx-btn flex-1 text-xs justify-center ${memorySubTab === "procedures" ? "is-on" : ""}`}
              aria-pressed={memorySubTab === "procedures"}
            >
              Playbooks ({procedures.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto nx-scroll p-3 space-y-2.5">
            {loadingMemory && (
              <p className="text-center py-4 text-xs" style={{ color: "var(--nx-dim)" }}>
                Loading memory graph…
              </p>
            )}

            {!loadingMemory && memorySubTab === "episodes" && (
              <>
                {episodes.length === 0 ? (
                  <p className="text-center py-6 text-xs" style={{ color: "var(--nx-dim)" }}>
                    No episodes recorded yet for tenant &apos;{tenant}&apos;.
                  </p>
                ) : (
                  episodes.map((ep) => (
                    <div
                      key={ep.id}
                      style={{
                        background: "var(--nx-panel-2)",
                        border: "2px solid var(--nx-ink)",
                        boxShadow: "inset 0 0 0 1px var(--nx-line)",
                        padding: 10,
                      }}
                      className="space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="nx-mono font-bold" style={{ color: "var(--nx-cream)" }}>
                          {ep.incident_id}
                        </span>
                        <span className="nx-chip" style={{ color: "var(--nx-mint)" }}>
                          {ep.outcome}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: "var(--nx-dim)" }}>
                        {ep.summary}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {ep.entities_touched.map((entityId) => (
                          <span
                            key={entityId}
                            className="nx-chip text-[11px]"
                            style={{ color: "var(--nx-sky)" }}
                          >
                            {entityId}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {!loadingMemory && memorySubTab === "facts" && (
              <>
                {facts.length === 0 ? (
                  <p className="text-center py-6 text-xs" style={{ color: "var(--nx-dim)" }}>
                    No semantic facts recorded yet for tenant &apos;{tenant}&apos;.
                  </p>
                ) : (
                  facts.map((fact) => {
                    const isStale = Boolean(fact.invalid_at || fact.superseded_by);
                    return (
                      <div
                        key={fact.id}
                        style={{
                          background: isStale ? "rgba(45, 15, 15, 0.75)" : "var(--nx-panel-2)",
                          border: isStale ? "2px solid var(--nx-coral)" : "2px solid var(--nx-ink)",
                          boxShadow: "inset 0 0 0 1px var(--nx-line)",
                          padding: 10,
                          opacity: isStale ? 0.8 : 1,
                        }}
                        className="space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="nx-mono font-bold" style={{ color: "var(--nx-sky)" }}>
                            {fact.subject}
                          </span>
                          {isStale ? (
                            <span
                              className="nx-chip"
                              style={{ color: "var(--nx-coral)", borderColor: "var(--nx-coral)" }}
                            >
                              Superseded
                            </span>
                          ) : (
                            <span className="nx-chip" style={{ color: "var(--nx-mint)" }}>
                              Live Fact
                            </span>
                          )}
                        </div>
                        <div className="nx-mono text-xs">
                          <span style={{ color: "var(--nx-lemon)" }}>{fact.predicate}</span>{" "}
                          <span style={{ color: "var(--nx-dim)" }}>➔</span>{" "}
                          <span
                            style={{
                              color: isStale ? "var(--nx-coral)" : "var(--nx-cream)",
                              textDecoration: isStale ? "line-through" : "none",
                            }}
                          >
                            {fact.object}
                          </span>
                        </div>
                        <div
                          className="flex justify-between nx-mono text-[11px]"
                          style={{ color: "var(--nx-dim)" }}
                        >
                          <span>Confidence: {(fact.confidence * 100).toFixed(0)}%</span>
                          <span>Valid: {fact.valid_at.slice(0, 10)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {!loadingMemory && memorySubTab === "procedures" && (
              <>
                {procedures.length === 0 ? (
                  <p className="text-center py-6 text-xs" style={{ color: "var(--nx-dim)" }}>
                    No procedures recorded yet for tenant &apos;{tenant}&apos;.
                  </p>
                ) : (
                  procedures.map((proc) => (
                    <div
                      key={proc.name}
                      style={{
                        background: "var(--nx-panel-2)",
                        border: "2px solid var(--nx-ink)",
                        boxShadow: "inset 0 0 0 1px var(--nx-line)",
                        padding: 10,
                      }}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="nx-display text-xs" style={{ color: "var(--nx-lemon)" }}>
                          {proc.name}
                        </span>
                        <span className="nx-chip" style={{ color: "var(--nx-sky)" }}>
                          Used {proc.success_count}x
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: "var(--nx-dim)" }}>
                        Pattern: {proc.incident_pattern}
                      </p>
                      <div
                        className="nx-mono text-xs p-2 flex items-center gap-1.5 flex-wrap"
                        style={{ background: "var(--nx-ink)", border: "1px solid var(--nx-line)" }}
                      >
                        {proc.step_sequence.map((s, si) => (
                          <React.Fragment key={si}>
                            <span style={{ color: "var(--nx-cream)" }}>{s}</span>
                            {si < proc.step_sequence.length - 1 && (
                              <span style={{ color: "var(--nx-mint)" }}>➔</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Shared Tasks & Atomic Handoffs */}
      {activeTab === "tasks" && (
        <div className="flex-1 overflow-y-auto nx-scroll p-3 space-y-2.5">
          {tasks.length === 0 ? (
            <p className="text-center py-6 text-xs" style={{ color: "var(--nx-dim)" }}>
              No shared tasks claimed yet for tenant &apos;{tenant}&apos;.
            </p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                style={{
                  background: "var(--nx-panel-2)",
                  border: "2px solid var(--nx-ink)",
                  boxShadow: "inset 0 0 0 1px var(--nx-line)",
                  padding: 10,
                }}
                className="space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="nx-mono font-bold" style={{ color: "var(--nx-cream)" }}>
                      {task.id}
                    </span>
                    <span className="nx-mono text-[11px]" style={{ color: "var(--nx-dim)" }}>
                      ({task.incident_id})
                    </span>
                  </div>
                  <span
                    className="nx-chip uppercase font-bold text-[10px]"
                    style={{
                      color:
                        task.status === "completed"
                          ? "var(--nx-mint)"
                          : task.status === "claimed"
                          ? "var(--nx-sky)"
                          : "var(--nx-lemon)",
                    }}
                  >
                    {task.status}
                  </span>
                </div>

                <div className="nx-mono text-xs" style={{ color: "var(--nx-dim)" }}>
                  Assigned:{" "}
                  <strong className="uppercase" style={{ color: "var(--nx-cream)" }}>
                    {task.assigned_to}
                  </strong>
                </div>

                {/* Handoff trail */}
                {task.handoffs && task.handoffs.length > 0 && (
                  <div className="space-y-1.5 pt-1.5" style={{ borderTop: "1px solid var(--nx-line)" }}>
                    <span className="nx-display text-[10px]" style={{ color: "var(--nx-dim)" }}>
                      HANDOFF CHAIN:
                    </span>
                    {task.handoffs.map((h, hi) => (
                      <div
                        key={hi}
                        className="p-2 space-y-1"
                        style={{ background: "var(--nx-ink)", border: "1px solid var(--nx-line)" }}
                      >
                        <div className="flex items-center gap-1.5 nx-mono text-xs">
                          <span className="uppercase font-bold" style={{ color: "var(--nx-sky)" }}>
                            {h.from_agent}
                          </span>
                          <span style={{ color: "var(--nx-mint)" }}>➔</span>
                          <span className="uppercase font-bold" style={{ color: "var(--nx-mint)" }}>
                            {h.to_agent}
                          </span>
                        </div>
                        <p className="nx-mono text-[11px]" style={{ color: "var(--nx-dim)", margin: 0 }}>
                          {h.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
