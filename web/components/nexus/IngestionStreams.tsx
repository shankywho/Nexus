"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { fetchSources, SourceEvent } from "@/lib/nexus/api";

export interface IngestionStreamsProps {
  onEventReceived?: (event: Record<string, unknown>) => void;
  refreshKey?: number;
}

const LABELS: Array<{ kind: string; label: string }> = [
  { kind: "slack_message", label: "Slack" },
  { kind: "linear_ticket", label: "Linear" },
  { kind: "github_pr", label: "PRs" },
  { kind: "adr", label: "ADRs" },
  { kind: "notion_doc", label: "Docs" },
  { kind: "incident", label: "Incidents" },
];

export function IngestionStreams({ onEventReceived, refreshKey = 0 }: IngestionStreamsProps) {
  const [events, setEvents] = useState<SourceEvent[]>([]);
  const [live, setLive] = useState(true);

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

  useEffect(() => {
    const es = new EventSource("/api/events/stream");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.kind || data.type === "ingest.received") load();
        onEventReceived?.(data);
      } catch {
        // ignore malformed frames
      }
    };
    return () => es.close();
  }, [load, onEventReceived]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e) => m.set(e.kind ?? "other", (m.get(e.kind ?? "other") ?? 0) + 1));
    return m;
  }, [events]);

  const latest = useMemo(() => [...events].sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? "")).slice(0, 16), [events]);
  const labelOf = (k: string | null) => LABELS.find((l) => l.kind === k)?.label ?? k ?? "other";

  return (
    <section className="nx-panel flex flex-col min-h-0" aria-label="Incoming events">
      <header className="nx-panel-head">
        <span className="nx-display">Mail room</span>
        <span className="nx-chip">
          <span className={`nx-dot ${live ? "" : "is-bad"}`} />
          {live ? "live" : "offline"}
        </span>
      </header>
      <ul className="p-3 grid grid-cols-2 gap-2" style={{ listStyle: "none", margin: 0 }}>
        {LABELS.map((l) => (
          <li key={l.kind} className="flex items-baseline justify-between" style={{ background: "var(--nx-ink)", padding: "4px 8px" }}>
            <span>{l.label}</span>
            <span className="nx-mono" style={{ color: "var(--nx-mint)", fontSize: 22 }}>{counts.get(l.kind) ?? 0}</span>
          </li>
        ))}
      </ul>
      <div className="nx-display px-3 pb-2" style={{ color: "var(--nx-dim)" }}>Latest</div>
      <ol className="nx-scroll nx-mono flex-1 min-h-0 px-3 pb-3" style={{ listStyle: "none", margin: 0 }}>
        {latest.length === 0 && <li style={{ color: "var(--nx-dim)" }}>No events yet. Replay the company sync.</li>}
        {latest.map((e) => (
          <li key={e.id} className="flex justify-between gap-2" style={{ borderTop: "1px solid var(--nx-line)", padding: "2px 0", whiteSpace: "nowrap" }}>
            <span>{e.id}</span>
            <span style={{ color: "var(--nx-sky)" }}>{labelOf(e.kind)}</span>
            <span style={{ color: "var(--nx-dim)" }}>{(e.ts ?? "").slice(5, 10)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
