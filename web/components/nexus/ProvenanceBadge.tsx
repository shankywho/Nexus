"use client";

import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";

export interface ProvenanceBadgeProps {
  currentSource?: string | { title?: string; ref?: string; date?: string; channel?: string; thread_id?: string; text?: string } | null;
  supersededSource?: string | { title?: string; ref?: string; date?: string; channel?: string; thread_id?: string; text?: string } | null;
  decisionId?: string;
  reason?: string;
}

export function ProvenanceBadge({
  currentSource,
  supersededSource,
  decisionId,
  reason,
}: ProvenanceBadgeProps) {
  const formatSource = (src: any, defaultText: string) => {
    if (!src) return defaultText;
    if (typeof src === "string") return src;
    if (src.title && src.ref) return `${src.title} (${src.date || "2026-10-12"}) via ${src.ref}`;
    if (src.channel) return `#${src.channel} Slack Thread (${src.date || "2026-09-18"})`;
    return src.title || src.text || defaultText;
  };

  const currentDisplay = formatSource(
    currentSource,
    "ADR-042 (2026-10-12) via LIN-409"
  );
  const supersededDisplay = formatSource(
    supersededSource,
    "#eng-backend Slack Thread (2026-09-18) — Invalidated"
  );

  return (
    <div className="p-3 border border-[#27272a] bg-[#141414] font-mono text-xs shadow-lg space-y-2">
      <div className="flex items-center justify-between border-b border-[#27272a] pb-1.5 mb-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-[#10b981]" />
          <span className="text-[10px] tracking-widest uppercase font-bold text-zinc-300">
            TEMPORAL PROVENANCE RESOLUTION {decisionId ? `(${decisionId})` : ""}
          </span>
        </div>
        <span className="text-[10px] tracking-wider uppercase text-zinc-500">
          BI-TEMPORAL AUDIT
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-start gap-2 text-[#10b981]">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
          <div className="leading-tight">
            <span className="font-semibold uppercase tracking-wider text-[10px] block text-[#10b981]/80">
              CURRENT SOURCE
            </span>
            <span>{currentDisplay}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 text-[#ef4444]">
          <XCircle size={15} className="shrink-0 mt-0.5" />
          <div className="leading-tight">
            <span className="font-semibold uppercase tracking-wider text-[10px] block text-[#ef4444]/80">
              SUPERSEDED
            </span>
            <span>{supersededDisplay}</span>
            {reason && <span className="block text-[10px] text-zinc-400 mt-0.5">Reason: {reason}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
