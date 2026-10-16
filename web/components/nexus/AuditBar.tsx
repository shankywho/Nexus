"use client";

import React from "react";

export type AuditKind = "who-owns-what" | "decision-trace" | "stale-knowledge" | "bus-factor";

export interface AuditBarProps {
  activeAudit: AuditKind | null;
  loadingAudit: boolean;
  onRunAudit: (kind: AuditKind) => void;
}

const AUDITS: Array<{ kind: AuditKind; label: string; hint: string }> = [
  { kind: "who-owns-what", label: "OWNERS", hint: "Light up every owner and maintainer" },
  { kind: "decision-trace", label: "TRACE", hint: "Follow a decision back to its sources" },
  { kind: "stale-knowledge", label: "STALE", hint: "Find superseded decisions still cited" },
  { kind: "bus-factor", label: "BUS FACTOR", hint: "Find people the org leans on most" },
];

export function AuditBar({ activeAudit, loadingAudit, onRunAudit }: AuditBarProps) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Audits">
      <span className="nx-display text-xs" style={{ color: "var(--nx-muted)" }}>
        AUDITS
      </span>
      <div className="nx-seg">
        {AUDITS.map((a) => (
          <button
            key={a.kind}
            type="button"
            className="nx-btn"
            style={{ height: 28, padding: "0 8px", fontSize: 11 }}
            data-testid={`audit-${a.kind}`}
            aria-pressed={activeAudit === a.kind}
            title={a.hint}
            disabled={loadingAudit}
            onClick={() => onRunAudit(a.kind)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
