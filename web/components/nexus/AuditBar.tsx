"use client";

import React from "react";

export type AuditKind = "who-owns-what" | "decision-trace" | "stale-knowledge" | "bus-factor";

export interface AuditBarProps {
  activeAudit: AuditKind | null;
  loadingAudit: boolean;
  onRunAudit: (kind: AuditKind) => void;
}

const AUDITS: Array<{ kind: AuditKind; label: string; hint: string }> = [
  { kind: "who-owns-what", label: "Who owns what", hint: "Light up every owner and maintainer" },
  { kind: "decision-trace", label: "Decision trace", hint: "Follow a decision back to its sources" },
  { kind: "stale-knowledge", label: "Stale knowledge", hint: "Find superseded decisions still cited" },
  { kind: "bus-factor", label: "Bus factor", hint: "Find people the org leans on most" },
];

export function AuditBar({ activeAudit, loadingAudit, onRunAudit }: AuditBarProps) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label="Audits">
      <span className="nx-display" style={{ color: "var(--nx-dim)" }}>
        Audits
      </span>
      {AUDITS.map((a) => (
        <button
          key={a.kind}
          type="button"
          className="nx-btn"
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
  );
}
