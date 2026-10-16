"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { TopologyData, TopologyNode } from "@/lib/nexus/api";
import { layoutGraph, type GraphLink, type GraphNode } from "@/lib/nexus/graphLayout";
import { FLOORS, RECORDS_FLOOR } from "@/lib/nexus/theme";
import { NX } from "@/lib/nexus/tokens";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--nx-muted)" }}>
      Drawing the graph…
    </div>
  ),
});

export interface LiveTopologyProps {
  data: TopologyData;
  highlightIds?: string[];
  onNodeClick?: (node: TopologyNode) => void;
}

const INK = NX.ink;
const CREAM = NX.text;
const PAPER = NX.panel2;
const PAPER_OLD = NX.panel;
const CORAL = NX.bad;
const SKY = NX.info;
const MINT = NX.ok;

type FGNode = GraphNode & { x: number; y: number; fx: number; fy: number };
type FGLink = Omit<GraphLink, "source" | "target"> & { source: FGNode | string; target: FGNode | string };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

const accentOf = (cluster: number, isRecords: boolean) => (isRecords ? RECORDS_FLOOR.accent : FLOORS[cluster % FLOORS.length].accent);

export function LiveTopology({ data, highlightIds = [], onNodeClick }: LiveTopologyProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{ zoomToFit: (ms?: number, pad?: number) => void } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => layoutGraph(data), [data]);
  const graph = useMemo(
    () => ({
      nodes: layout.nodes.map((n) => ({ ...n, fx: n.x, fy: n.y })) as FGNode[],
      links: layout.links.map((l) => ({ ...l })) as FGLink[],
    }),
    [layout],
  );
  const lit = useMemo(() => new Set(highlightIds), [highlightIds]);
  const recordsIdx = useMemo(() => layout.clusters.findIndex((c) => c.id === "__records__"), [layout]);

  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    layout.links.forEach((l) => {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)?.add(l.target);
      m.get(l.target)?.add(l.source);
    });
    return m;
  }, [layout]);

  const fit = useCallback(() => fgRef.current?.zoomToFit(350, 105), []);
  useEffect(() => {
    const t = setTimeout(fit, 450);
    return () => clearTimeout(t);
  }, [fit, size.w, size.h, layout]);

  const faded = (id: string) => hover !== null && id !== hover && !neighbours.get(hover)?.has(id);

  const drawNode = (raw: object, ctx: CanvasRenderingContext2D, scale: number) => {
    const n = raw as FGNode;
    const accent = accentOf(n.cluster, n.cluster === recordsIdx);
    const fs = Math.min(18, 12 / scale);
    const isLit = lit.has(n.id);
    ctx.save();
    ctx.globalAlpha = faded(n.id) ? 0.22 : lit.size > 0 && n.kind !== "team" && !lit.has(n.id) ? 0.4 : 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (n.kind === "team") {
      ctx.beginPath();
      ctx.arc(n.x, n.y, 24, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `700 ${Math.min(17, 14 / scale)}px "Atkinson Hyperlegible", sans-serif`;
      ctx.fillText(n.label.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join(""), n.x, n.y + 1);
    } else if (n.kind === "person") {
      ctx.beginPath();
      ctx.arc(n.x, n.y, 17, 0, Math.PI * 2);
      ctx.fillStyle = NX.panel;
      ctx.fill();
      ctx.lineWidth = isLit ? 4 : 2.5;
      ctx.strokeStyle = isLit ? NX.accent : accent;
      ctx.stroke();
      ctx.fillStyle = CREAM;
      ctx.font = `700 ${Math.min(16, 13 / scale)}px "JetBrains Mono", monospace`;
      ctx.fillText(initials(n.label), n.x, n.y + 1);
      ctx.font = `${fs}px "JetBrains Mono", monospace`;
      ctx.fillStyle = CREAM;
      ctx.fillText(n.label.split(" ")[0], n.x, n.y + 29);
    } else if (n.kind === "service") {
      ctx.fillStyle = NX.panel2;
      ctx.strokeStyle = isLit ? NX.accent : INK;
      ctx.lineWidth = isLit ? 4 : 3;
      ctx.beginPath();
      ctx.rect(n.x - 17, n.y - 15, 34, 30);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = NX.ink;
        ctx.fillRect(n.x - 13, n.y - 11 + i * 9, 26, 6);
        ctx.fillStyle = i === 0 && n.incident ? CORAL : MINT;
        ctx.fillRect(n.x - 10, n.y - 10 + i * 9, 3, 3);
      }
      if (n.incident) {
        ctx.fillStyle = CORAL;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(n.x + 17, n.y - 15, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // label sits outside the ring, away from the team hub, so it never lands on people
      const c = layout.clusters[n.cluster];
      const dx = n.x - (c?.x ?? 0);
      const dy = n.y - (c?.y ?? 0);
      ctx.font = `700 ${fs}px "JetBrains Mono", monospace`;
      ctx.fillStyle = CREAM;
      if (!n.hasDecision && Math.abs(dx) > Math.abs(dy) * 0.8) {
        ctx.textAlign = dx > 0 ? "left" : "right";
        ctx.fillText(n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label, n.x + (dx > 0 ? 24 : -24), n.y + 1);
      } else {
        ctx.fillText(n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label, n.x, n.y + (n.hasDecision ? 30 : dy > 0 ? 28 : -26));
      }
    } else {
      const w = 74;
      const h = 36;
      ctx.fillStyle = n.dead ? PAPER_OLD : PAPER;
      ctx.strokeStyle = isLit ? NX.accent : n.dead ? CORAL : INK;
      ctx.lineWidth = isLit ? 4 : 2.5;
      if (n.dead) ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.rect(n.x - w / 2, n.y - h / 2, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = n.dead ? NX.muted : INK;
      ctx.font = `700 ${Math.min(15, 13 / scale)}px "JetBrains Mono", monospace`;
      ctx.fillText(n.label, n.x, n.y - 3);
      ctx.font = `${Math.min(11, 9 / scale)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = n.dead ? NX.warn : NX.ok;
      ctx.fillText(n.dead ? "REPLACED" : "LIVE", n.x, n.y + 11);
      if (n.dead) {
        ctx.strokeStyle = CORAL;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(n.x - w / 2 + 6, n.y - 3);
        ctx.lineTo(n.x + w / 2 - 6, n.y - 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const drawLink = (raw: object, ctx: CanvasRenderingContext2D, scale: number) => {
    const l = raw as FGLink;
    const s = l.source as FGNode;
    const t = l.target as FGNode;
    if (typeof s !== "object" || typeof t !== "object") return;
    ctx.save();
    ctx.globalAlpha = hover !== null && s.id !== hover && t.id !== hover ? 0.12 : 1;
    ctx.setLineDash([]);
    if (l.kind === "member") {
      ctx.strokeStyle = "rgba(159,179,176,0.28)";
      ctx.lineWidth = 1.5;
    } else if (l.kind === "owns") {
      ctx.strokeStyle = "rgba(92,200,240,0.85)";
      ctx.lineWidth = 3;
    } else if (l.kind === "maintains") {
      ctx.strokeStyle = "rgba(107,227,165,0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
    } else if (l.kind === "affects") {
      ctx.strokeStyle = "rgba(246,239,214,0.55)";
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = CORAL;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 5]);
    }
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    if (l.kind === "supersedes") {
      const mx = (s.x + t.x) / 2;
      const my = (s.y + t.y) / 2;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.hypot(dx, dy) || 1;
      const cx = mx - (dy / len) * 58;
      const cy = my + (dx / len) * 58;
      ctx.quadraticCurveTo(cx, cy, t.x, t.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const ang = Math.atan2(t.y - cy, t.x - cx);
      const ax = t.x - Math.cos(ang) * 40;
      const ay = t.y - Math.sin(ang) * 22;
      ctx.fillStyle = CORAL;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - Math.cos(ang - 0.45) * 12, ay - Math.sin(ang - 0.45) * 12);
      ctx.lineTo(ax - Math.cos(ang + 0.45) * 12, ay - Math.sin(ang + 0.45) * 12);
      ctx.closePath();
      ctx.fill();
      ctx.font = `700 ${Math.min(15, 12 / scale)}px "Atkinson Hyperlegible", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = CORAL;
      ctx.fillText("replaces", (mx + cx) / 2 + 2, (my + cy) / 2 - 8);
    } else {
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawBackdrop = (ctx: CanvasRenderingContext2D, scale: number) => {
    layout.clusters.forEach((c, i) => {
      const accent = accentOf(i, c.id === "__records__");
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.rx, c.r, 0, 0, Math.PI * 2);
      ctx.fillStyle = `${accent}12`;
      ctx.fill();
      ctx.lineWidth = 1.5 / scale + 0.5;
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = `${accent}55`;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${Math.min(14, 10 / scale)}px "Press Start 2P", monospace`;
      const text = c.name.toUpperCase();
      const w = ctx.measureText(text).width + 24;
      const h = Math.min(30, 24 / Math.max(scale, 0.5));
      ctx.fillStyle = accent;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(c.x - w / 2, c.y - c.r - h / 2 + 8, w, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, c.x, c.y - c.r + 9);
      ctx.restore();
    });
  };

  const handleClick = (raw: object) => {
    const n = raw as FGNode;
    const id = n.kind === "team" ? n.id.replace(/^team:/, "") : n.id;
    const original = data.nodes.find((d) => d.id === id);
    if (original) onNodeClick?.(original);
  };

  const hitArea = (raw: object, color: string, ctx: CanvasRenderingContext2D) => {
    const n = raw as FGNode;
    ctx.fillStyle = color;
    const w = n.kind === "team" ? 90 : n.kind === "decision" ? 40 : 22;
    ctx.fillRect(n.x - w, n.y - 24, w * 2, 48);
  };

  return (
    <div ref={wrapRef} data-testid="live-topology-canvas" className="absolute inset-0 select-none" style={{ background: "var(--nx-bg)" }}>
      <ForceGraph2D
        ref={fgRef as never}
        width={size.w}
        height={size.h}
        graphData={graph}
        backgroundColor={NX.bg}
        nodeId="id"
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => "replace"}
        nodePointerAreaPaint={hitArea}
        linkCanvasObject={drawLink}
        linkCanvasObjectMode={() => "replace"}
        onRenderFramePre={drawBackdrop}
        onNodeHover={(n) => setHover(n ? (n as FGNode).id : null)}
        onNodeClick={handleClick}
        enableNodeDrag={false}
        cooldownTicks={0}
        warmupTicks={0}
        minZoom={0.25}
        maxZoom={4}
      />
      <div className="absolute left-3 top-3 flex flex-wrap gap-x-4 gap-y-1 px-3 py-2" style={{ background: "rgba(7,12,16,.82)", fontSize: 13, color: "var(--nx-dim)", maxWidth: "70%" }}>
        <span><b style={{ color: SKY }}>━</b> owns</span>
        <span><b style={{ color: MINT }}>╍</b> maintains</span>
        <span><b style={{ color: CREAM }}>━</b> decision affects service</span>
        <span><b style={{ color: CORAL }}>╍</b> replaces</span>
        <span style={{ color: "var(--nx-dim)" }}>Hover to focus, scroll to zoom</span>
      </div>
      <button type="button" className="nx-btn absolute right-3 bottom-3" onClick={fit}>
        Fit view
      </button>
    </div>
  );
}
