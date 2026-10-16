"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { fetchSources, SourceEvent } from "@/lib/nexus/api";

export interface MergedFooterProps {
  live: boolean;
  refreshKey?: number;
  liveDecisionsCount: number;
  deadDecisionsCount: number;
  hasIncidents: boolean;
}

const LABELS: Array<{ kind: string; label: string }> = [
  { kind: "slack_message", label: "Slack" },
  { kind: "linear_ticket", label: "Linear" },
  { kind: "github_pr", label: "PRs" },
  { kind: "adr", label: "ADRs" },
  { kind: "notion_doc", label: "Docs" },
  { kind: "incident", label: "Inc" },
];

export function MergedFooter({
  live,
  refreshKey = 0,
  liveDecisionsCount,
  deadDecisionsCount,
  hasIncidents,
}: MergedFooterProps) {
  const [events, setEvents] = useState<SourceEvent[]>([]);

  const load = useCallback(async () => {
    try {
      setEvents(await fetchSources(300));
    } catch {
      // API offline
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e) => m.set(e.kind ?? "other", (m.get(e.kind ?? "other") ?? 0) + 1));
    return m;
  }, [events]);

  const latest = useMemo(() => [...events].sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? "")).slice(0, 3), [events]);
  const labelOf = (k: string | null) => LABELS.find((l) => l.kind === k)?.label ?? k ?? "other";

  return (
    <footer
      className="flex items-center justify-between gap-4 px-4 shrink-0"
      style={{
        height: "var(--footer-h)",
        minHeight: "var(--footer-h)",
        borderTop: "var(--bd)",
        background: "var(--nx-panel)",
        fontSize: 11,
      }}
      role="contentinfo"
      aria-label="System status and graph legend"
    >
      {/* Left side: Stream status and counts */}
      <div className="flex items-center gap-3 min-w-0 overflow-hidden">
        <span className="nx-chip" style={{ height: 22, padding: "0 6px" }}>
          <span className={`nx-dot ${live ? "" : "is-muted"}`} />
          <span>{live ? "stream idle" : "stream down"}</span>
        </span>

        <ul className="flex items-center gap-2.5 text-xs" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {LABELS.map((l) => {
            const count = counts.get(l.kind) ?? 0;
            return (
              <li key={l.kind} className="flex items-baseline gap-1">
                <span style={{ color: "var(--nx-muted)" }}>{l.label}</span>
                <span className="nx-mono font-bold" style={{ color: count > 0 ? "var(--nx-ok)" : "var(--nx-muted)" }}>
                  {count}
                </span>
              </li>
            );
          })}
        </ul>

        {latest.length > 0 && (
          <>
            <span style={{ width: 1, height: 16, background: "var(--nx-line)" }} aria-hidden />
            <span className="nx-mono text-xs truncate hidden xl:inline" style={{ color: "var(--nx-muted)", maxWidth: 300 }}>
              latest: <span style={{ color: "var(--nx-info)" }}>{labelOf(latest[0].kind)}</span> {latest[0].id}
            </span>
          </>
        )}
      </div>

      {/* Right side: Legend with dimming when 0 instances on screen */}
      <div className="flex items-center gap-3 shrink-0 nx-mono text-xs" style={{ color: "var(--nx-muted)" }}>
        <span
          className="flex items-center gap-1.5"
          style={{ opacity: liveDecisionsCount > 0 ? 1 : 0.4 }}
          title={liveDecisionsCount > 0 ? `${liveDecisionsCount} live decisions` : "No live decisions yet"}
        >
          <i style={{ width: 10, height: 8, background: "var(--nx-text)", display: "inline-block" }} />
          <span>live</span>
        </span>
        <span
          className="flex items-center gap-1.5"
          style={{ opacity: deadDecisionsCount > 0 ? 1 : 0.4 }}
          title={deadDecisionsCount > 0 ? `${deadDecisionsCount} replaced decisions` : "No replaced decisions yet"}
        >
          <i style={{ width: 10, height: 8, background: "var(--nx-warn)", display: "inline-block" }} />
          <span>replaced</span>
        </span>
        <span
          className="flex items-center gap-1.5"
          style={{ opacity: hasIncidents ? 1 : 0.4 }}
          title={hasIncidents ? "Active incident open" : "No open incidents"}
        >
          <i style={{ width: 8, height: 8, background: "var(--nx-bad)", display: "inline-block" }} />
          <span>incident</span>
        </span>
      </div>
    </footer>
  );
}
