"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, GitPullRequest, CheckSquare, BookOpen, AlertTriangle } from "lucide-react";

export interface StreamCounts {
  slack: number;
  jira: number;
  prs: number;
  docs: number;
  incidents: number;
}

export interface IngestionStreamsProps {
  onEventReceived?: (event: Record<string, unknown>) => void;
}

export function IngestionStreams({ onEventReceived }: IngestionStreamsProps) {
  const [counts, setCounts] = useState<StreamCounts>({
    slack: 28,
    jira: 12,
    prs: 8,
    docs: 2,
    incidents: 2,
  });
  const [lastEvent, setLastEvent] = useState<string>("LIN-409 ratified Postgres");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/events/stream");
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "ingest.received" || data.kind) {
            const kind = data.kind || "";
            setCounts((prev) => {
              if (kind.includes("slack")) return { ...prev, slack: prev.slack + 1 };
              if (kind.includes("ticket") || kind.includes("linear")) return { ...prev, jira: prev.jira + 1 };
              if (kind.includes("pr") || kind.includes("github")) return { ...prev, prs: prev.prs + 1 };
              if (kind.includes("adr") || kind.includes("doc")) return { ...prev, docs: prev.docs + 1 };
              if (kind.includes("incident")) return { ...prev, incidents: prev.incidents + 1 };
              return prev;
            });
            if (data.text || data.id) {
              setLastEvent(`${data.id || ""}: ${(data.text || "").slice(0, 32)}...`);
            }
          }
          if (onEventReceived) {
            onEventReceived(data);
          }
        } catch {
          // ignore parse errors
        }
      };
    } catch {
      setConnected(false);
    }

    return () => {
      if (es) es.close();
    };
  }, [onEventReceived]);

  return (
    <aside className="w-64 border-r border-[#27272a] bg-[#141414] flex flex-col shrink-0 font-mono text-xs select-none">
      <div className="p-3 border-b border-[#27272a] flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest uppercase text-zinc-300">
          Ingestion Streams
        </span>
        <span
          className={`text-[9px] px-1.5 py-0.5 border ${
            connected
              ? "border-[#10b981]/50 bg-[#10b981]/15 text-[#10b981]"
              : "border-zinc-700 bg-zinc-800 text-zinc-400"
          }`}
        >
          {connected ? "LIVE SSE" : "SSE READY"}
        </span>
      </div>

      <div className="p-3 space-y-2.5 flex-1 overflow-y-auto">
        {/* Slack Messages */}
        <div className="p-2 border border-[#27272a] bg-[#0a0a0a] hover:border-[#10b981]/40 transition-colors">
          <div className="flex justify-between items-center text-zinc-400 mb-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
              <MessageSquare size={13} className="text-[#10b981]" />
              SLACK MESSAGES
            </span>
            <span className="text-[#10b981] font-bold text-xs">{counts.slack}</span>
          </div>
          <div className="text-[10px] text-zinc-500 truncate">
            #eng-backend: DEC-017 vs Postgres
          </div>
        </div>

        {/* Jira / Linear Tickets */}
        <div className="p-2 border border-[#27272a] bg-[#0a0a0a] hover:border-[#10b981]/40 transition-colors">
          <div className="flex justify-between items-center text-zinc-400 mb-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
              <CheckSquare size={13} className="text-[#10b981]" />
              LINEAR / JIRA
            </span>
            <span className="text-[#10b981] font-bold text-xs">{counts.jira}</span>
          </div>
          <div className="text-[10px] text-zinc-500 truncate">
            LIN-391 (Redis) → LIN-409 (Postgres)
          </div>
        </div>

        {/* GitHub Pull Requests */}
        <div className="p-2 border border-[#27272a] bg-[#0a0a0a] hover:border-[#10b981]/40 transition-colors">
          <div className="flex justify-between items-center text-zinc-400 mb-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
              <GitPullRequest size={13} className="text-[#10b981]" />
              GITHUB PRS
            </span>
            <span className="text-[#10b981] font-bold text-xs">{counts.prs}</span>
          </div>
          <div className="text-[10px] text-zinc-500 truncate">
            PR-1150 (Implement), PR-1184 (Revert)
          </div>
        </div>

        {/* ADR Documents */}
        <div className="p-2 border border-[#27272a] bg-[#0a0a0a] hover:border-[#10b981]/40 transition-colors">
          <div className="flex justify-between items-center text-zinc-400 mb-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
              <BookOpen size={13} className="text-[#10b981]" />
              ADR &amp; DOCS
            </span>
            <span className="text-[#10b981] font-bold text-xs">{counts.docs}</span>
          </div>
          <div className="text-[10px] text-zinc-500 truncate">
            ADR-038 (Redis), ADR-042 (Postgres)
          </div>
        </div>

        {/* Incidents */}
        <div className="p-2 border border-[#27272a] bg-[#0a0a0a] hover:border-[#ef4444]/40 transition-colors">
          <div className="flex justify-between items-center text-zinc-400 mb-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
              <AlertTriangle size={13} className="text-[#ef4444]" />
              INCIDENTS
            </span>
            <span className="text-[#ef4444] font-bold text-xs">{counts.incidents}</span>
          </div>
          <div className="text-[10px] text-zinc-500 truncate">
            INC-77 (Redis session eviction)
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-[#27272a]">
          <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-semibold block mb-2">
            TOPOLOGY LEGEND
          </span>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-[#10b981]" />
              <span className="text-zinc-300">Active Decision / Edge</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-[#ef4444] border-b border-dashed border-[#ef4444]" />
              <span className="text-[#ef4444]">Superseded (Invalidated)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-[#f59e0b]" />
              <span className="text-[#f59e0b]">Contested / Bus Factor 1</span>
            </div>
          </div>
        </div>

        {/* Live Event Feed Preview */}
        <div className="pt-2">
          <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-semibold block mb-1">
            LATEST TELEMETRY
          </span>
          <div className="p-1.5 bg-[#0a0a0a] border border-[#27272a] text-[10px] text-zinc-400 truncate">
            {lastEvent}
          </div>
        </div>
      </div>
    </aside>
  );
}
