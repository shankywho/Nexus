"use client";

import React from "react";

type Src = string | { id?: string; label?: string; via?: string | null; reason?: string | null; title?: string; ref?: string; date?: string; channel?: string; thread_id?: string; text?: string } | null | undefined;

export interface ProvenanceBadgeProps {
  currentSource?: Src;
  supersededSource?: Src;
  decisionId?: string;
  reason?: string;
}

function formatSource(src: Src): string | null {
  if (!src) return null;
  if (typeof src === "string") return src;
  if (src.label) return `${src.label}${src.via ? ` via ${src.via}` : ""}`;
  if (src.title && src.ref) return `${src.title}${src.date ? ` (${src.date})` : ""} via ${src.ref}`;
  if (src.channel) return `${src.channel}${src.date ? ` (${src.date})` : ""}`;
  return src.title || src.text || null;
}

export function ProvenanceBadge({ currentSource, supersededSource, decisionId, reason }: ProvenanceBadgeProps) {
  const current = formatSource(currentSource);
  const old = formatSource(supersededSource);
  return (
    <section className="nx-panel" aria-label="Provenance" data-testid="provenance-badge">
      <header className="nx-panel-head">
        <span className="nx-display">Provenance{decisionId ? ` · ${decisionId}` : ""}</span>
      </header>
      <div className="p-3 flex flex-col gap-3">
        <div className="flex gap-2.5 items-start">
          <span className="nx-chip" style={{ background: "var(--nx-ok)", color: "var(--nx-ink)", fontWeight: 700, height: 22, padding: "0 6px" }}>
            <span className="nx-dot" style={{ background: "var(--nx-ink)", width: 6, height: 6 }} />
            CURRENT
          </span>
          <span className="nx-mono text-xs flex-1" style={{ lineHeight: "18px", color: "var(--nx-text)" }}>
            {current ?? "No current source found"}
          </span>
        </div>
        <div className="flex gap-2.5 items-start">
          <span className="nx-chip" style={{ background: "var(--nx-warn)", color: "var(--nx-ink)", fontWeight: 700, height: 22, padding: "0 6px" }}>
            <span className="nx-dot" style={{ background: "var(--nx-ink)", width: 6, height: 6 }} />
            SUPERSEDED
          </span>
          <span
            className="nx-mono text-xs flex-1"
            style={{ lineHeight: "18px", color: "var(--nx-muted)", textDecoration: "line-through" }}
          >
            {old ?? "Nothing superseded"}
          </span>
        </div>
        {reason && <p className="nx-mono" style={{ color: "var(--nx-muted)", fontSize: 12 }}>Why: {reason}</p>}
      </div>
    </section>
  );
}
