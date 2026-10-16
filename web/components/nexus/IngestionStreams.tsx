"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { fetchSources, SourceEvent } from "@/lib/nexus/api";

export interface IngestionStreamsProps {
  live: boolean;
  /** Changes whenever a new event arrives or a sync finishes, so the counts reload. */
  refreshKey?: number;
}

const LABELS: Array<{ kind: string; label: string }> = [
  { kind: "slack_message", label: "Slack" },
  { kind: "linear_ticket", label: "Linear" },
  { kind: "github_pr", label: "PRs" },
  { kind: "adr", label: "ADRs" },
  { kind: "notion_doc", label: "Docs" },
  { kind: "incident", label: "Inc" },
];

/** Horizontal strip: how much has been ingested from each source, and what came in last. */
export function IngestionStreams({ live, refreshKey = 0 }: IngestionStreamsProps) {
  const [events, setEvents] = useState<SourceEvent[]>([]);

  const load = useCallback(async () => {
    try {
      setEvents(await fetchSources(300));
    } catch {
      // API offline: keep the last list
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

  const latest = useMemo(() => [...events].sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? "")).slice(0, 4), [events]);
  const labelOf = (k: string | null) => LABELS.find((l) => l.kind === k)?.label ?? k ?? "other";

  return (
    <section className="flex items-center gap-4 px-4 py-1.5 shrink-0" aria-label="Ingested events" style={{ borderTop: "var(--bd)", background: "var(--nx-panel)" }}>
      <span className="nx-chip">
        <span className={`nx-dot ${live ? "" : "is-muted"}`} />
        {live ? "stream idle" : "stream down"}
      </span>
      <ul className="flex items-center gap-3 text-xs" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {LABELS.map((l) => {
          const count = counts.get(l.kind) ?? 0;
          return (
            <li key={l.kind} className="flex items-baseline gap-1.5">
              <span style={{ color: "var(--nx-muted)" }}>{l.label}</span>
              <span className="nx-mono font-bold" style={{ color: count > 0 ? "var(--nx-ok)" : "var(--nx-muted)" }}>
                {count}
              </span>
            </li>
          );
        })}
      </ul>
      <span style={{ width: 1, alignSelf: "stretch", background: "var(--nx-line)" }} aria-hidden />
      <ol className="nx-mono flex items-center gap-4 min-w-0 text-xs" style={{ listStyle: "none", margin: 0, padding: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
        {latest.length === 0 && <li style={{ color: "var(--nx-muted)" }}>No events yet. Replay the company sync.</li>}
        {latest.map((e) => (
          <li key={e.id}>
            <span style={{ color: "var(--nx-muted)" }}>{(e.ts ?? "").slice(5, 10)}</span>{" "}
            <span style={{ color: "var(--nx-info)" }}>{labelOf(e.kind)}</span> {e.id}
          </li>
        ))}
      </ol>
    </section>
  );
}
