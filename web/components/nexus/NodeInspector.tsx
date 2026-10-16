"use client";

import React from "react";
import { TopologyNode } from "@/lib/nexus/api";
import { PixelClose } from "./PixelIcons";

export interface NodeInspectorProps {
  node: TopologyNode | null;
  onClose: () => void;
}

const HIDDEN = new Set(["org_id", "email_hash"]);

export function NodeInspector({ node, onClose }: NodeInspectorProps) {
  if (!node) return null;
  const props = node.properties || {};
  const status = String(props.status || "");
  const dead = status === "superseded";
  const rows = Object.entries(props).filter(([k]) => !HIDDEN.has(k));

  return (
    <aside
      data-testid="node-inspector"
      className="nx-panel"
      style={{ position: "absolute", right: 14, top: 14, width: 320, zIndex: 20 }}
      aria-label={`${node.group} details`}
    >
      <header className="nx-panel-head">
        <span className="nx-display">{node.group}</span>
        <button
          type="button"
          className="nx-btn"
          style={{ height: 28, padding: "0 6px" }}
          onClick={onClose}
          aria-label="Close details"
        >
          <PixelClose />
        </button>
      </header>
      <div className="p-3 flex flex-col gap-2">
        <p className="nx-mono font-bold" style={{ fontSize: 15, margin: 0, color: "var(--nx-text)" }}>
          {node.name || node.id}
        </p>
        {node.group === "Decision" && (
          <span
            className="nx-chip"
            style={{
              alignSelf: "flex-start",
              background: dead ? "var(--nx-warn)" : "var(--nx-ok)",
              color: "var(--nx-ink)",
              fontWeight: 700,
            }}
          >
            {dead ? "superseded" : status || "active"}
          </span>
        )}
        <dl className="nx-mono nx-scroll" style={{ maxHeight: 260, margin: 0 }}>
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between gap-3"
              style={{ borderTop: "1px solid var(--nx-line)", padding: "4px 0", fontSize: 12 }}
            >
              <dt style={{ color: "var(--nx-muted)" }}>{k}</dt>
              <dd style={{ margin: 0, textAlign: "right", overflowWrap: "anywhere", color: "var(--nx-text)" }}>
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
