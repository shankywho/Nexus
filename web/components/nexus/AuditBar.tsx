"use client";

import React from "react";
import { Users, GitFork, ShieldAlert, Zap, Loader2 } from "lucide-react";

export type AuditKind = "who-owns-what" | "decision-trace" | "stale-knowledge" | "bus-factor";

export interface AuditBarProps {
  activeAudit: AuditKind | null;
  loadingAudit: boolean;
  onRunAudit: (kind: AuditKind) => void;
}

export function AuditBar({ activeAudit, loadingAudit, onRunAudit }: AuditBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto select-none py-1">
      <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-semibold mr-2 shrink-0">
        QUICK AUDITS:
      </span>

      <button
        type="button"
        data-testid="audit-who-owns-what"
        onClick={() => onRunAudit("who-owns-what")}
        disabled={loadingAudit}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-widest uppercase border transition-colors shrink-0 ${
          activeAudit === "who-owns-what"
            ? "bg-[#10b981]/20 border-[#10b981] text-[#10b981]"
            : "bg-[#141414] border-[#27272a] text-zinc-300 hover:text-zinc-100 hover:border-zinc-500"
        }`}
      >
        {loadingAudit && activeAudit === "who-owns-what" ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Users size={13} />
        )}
        <span>WHO OWNS WHAT</span>
      </button>

      <button
        type="button"
        data-testid="audit-decision-trace"
        onClick={() => onRunAudit("decision-trace")}
        disabled={loadingAudit}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-widest uppercase border transition-colors shrink-0 ${
          activeAudit === "decision-trace"
            ? "bg-[#10b981]/20 border-[#10b981] text-[#10b981]"
            : "bg-[#141414] border-[#27272a] text-zinc-300 hover:text-zinc-100 hover:border-zinc-500"
        }`}
      >
        {loadingAudit && activeAudit === "decision-trace" ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <GitFork size={13} />
        )}
        <span>DECISION TRACE</span>
      </button>

      <button
        type="button"
        data-testid="audit-stale-knowledge"
        onClick={() => onRunAudit("stale-knowledge")}
        disabled={loadingAudit}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-widest uppercase border transition-colors shrink-0 ${
          activeAudit === "stale-knowledge"
            ? "bg-[#ef4444]/20 border-[#ef4444] text-[#ef4444]"
            : "bg-[#141414] border-[#27272a] text-zinc-300 hover:text-zinc-100 hover:border-zinc-500"
        }`}
      >
        {loadingAudit && activeAudit === "stale-knowledge" ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <ShieldAlert size={13} />
        )}
        <span>STALE KNOWLEDGE</span>
      </button>

      <button
        type="button"
        data-testid="audit-bus-factor"
        onClick={() => onRunAudit("bus-factor")}
        disabled={loadingAudit}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-widest uppercase border transition-colors shrink-0 ${
          activeAudit === "bus-factor"
            ? "bg-[#f59e0b]/20 border-[#f59e0b] text-[#f59e0b]"
            : "bg-[#141414] border-[#27272a] text-zinc-300 hover:text-zinc-100 hover:border-zinc-500"
        }`}
      >
        {loadingAudit && activeAudit === "bus-factor" ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Zap size={13} />
        )}
        <span>BUS FACTOR</span>
      </button>
    </div>
  );
}
