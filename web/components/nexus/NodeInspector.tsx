"use client";

import React from "react";
import { X, ShieldCheck, AlertCircle, Calendar, Hash, Tag } from "lucide-react";
import { TopologyNode } from "@/lib/nexus/api";

export interface NodeInspectorProps {
  node: TopologyNode | null;
  onClose: () => void;
}

export function NodeInspector({ node, onClose }: NodeInspectorProps) {
  if (!node) return null;

  const props = node.properties || {};
  const isDecision = node.group === "Decision" || node.label === "Decision";
  const isSuperseded = props.status === "superseded";

  return (
    <div
      data-testid="node-inspector"
      className="absolute top-4 right-4 w-80 bg-[#141414] border border-[#27272a] shadow-2xl p-4 font-mono text-xs z-30 space-y-3"
    >
      <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
        <div className="flex items-center gap-2">
          <Tag size={13} className="text-[#10b981]" />
          <span className="font-bold uppercase tracking-wider text-zinc-200">
            {node.group || "Entity"}: {node.name || node.id}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-200 p-0.5"
          aria-label="Close inspector"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">ID:</span>
          <span className="text-zinc-300 font-semibold">{node.id}</span>
        </div>

        {isDecision && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">STATUS:</span>
            <span
              className={`px-1.5 py-0.5 uppercase font-bold text-[10px] border ${
                isSuperseded
                  ? "border-[#ef4444]/50 bg-[#ef4444]/15 text-[#ef4444]"
                  : "border-[#10b981]/50 bg-[#10b981]/15 text-[#10b981]"
              }`}
            >
              {String(props.status || "active")}
            </span>
          </div>
        )}

        {Boolean(props.at) && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">TIMESTAMP:</span>
            <span className="text-zinc-400">{String(props.at)}</span>
          </div>
        )}

        {Boolean(props.team) && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">TEAM:</span>
            <span className="text-zinc-300">{String(props.team)}</span>
          </div>
        )}

        {Boolean(props.role) && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">ROLE:</span>
            <span className="text-zinc-300">{String(props.role)}</span>
          </div>
        )}

        {Boolean(props.superseded_by) && (
          <div className="flex items-center justify-between text-[11px] text-[#ef4444]">
            <span>SUPERSEDED BY:</span>
            <span className="font-bold">{String(props.superseded_by)}</span>
          </div>
        )}

        {Boolean(props.supersedes) && (
          <div className="flex items-center justify-between text-[11px] text-[#10b981]">
            <span>SUPERSEDES:</span>
            <span className="font-bold">{String(props.supersedes)}</span>
          </div>
        )}
      </div>

      {/* Raw Properties Accordion / Section */}
      <div className="pt-2 border-t border-[#27272a]">
        <span className="text-[10px] uppercase text-zinc-500 block mb-1 font-semibold">
          PROPERTIES
        </span>
        <div className="max-h-40 overflow-y-auto bg-[#0a0a0a] p-2 border border-[#27272a] text-[10px] text-zinc-400 space-y-1">
          {Object.entries(props).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 truncate">
              <span className="text-zinc-500 truncate">{k}:</span>
              <span className="text-zinc-300 truncate">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
