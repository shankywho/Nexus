"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { forceCollide, forceX, forceY } from "d3-force-3d";
import { TopologyData, TopologyNode } from "@/lib/nexus/api";
import { layoutGraph, type GraphCluster, type GraphLink, type GraphNode } from "@/lib/nexus/graphLayout";
import { AGENT_POD_ID } from "@/lib/nexus/office";
import { NX } from "@/lib/nexus/tokens";
import { getServiceShortName } from "./OfficeFloor";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center nx-mono text-xs" style={{ color: "var(--nx-muted)" }}>
      Initializing Graph Topology…
    </div>
  ),
});

export interface LiveTopologyProps {
  data: TopologyData;
  highlightIds?: string[];
  onNodeClick?: (node: TopologyNode) => void;
  selectedNodeId?: string | null;
  activeAudit?: string | null;
  auditCypher?: string | null;
}

interface TourStep {
  step: number;
  title: string;
  badge: string;
  badgeColor: string;
  desc: string;
  cypher: string;
  zoom: number;
  highlightKeys: string[];
  findTarget: (nodes: FGNode[]) => FGNode | undefined;
}

const TOUR_STEPS: TourStep[] = [
  {
    step: 1,
    title: "1/4: OUTAGE INCIDENT DETECTED",
    badge: "INC-83 · SEV-1 SPIKE",
    badgeColor: "var(--nx-bad)",
    desc: "Web checkout 5xx spike triggered. Error rates in Auth Gateway and Session Store breach SLA.",
    cypher: "MATCH (i:Incident {id: 'INC-83'})-[:affects]->(s:Service) RETURN s",
    zoom: 2.2,
    highlightKeys: ["INC-83", "AUTH", "SESSIONS", "CHECKOUT"],
    findTarget: (nodes) =>
      nodes.find((n) => n.id === "INC-83" || n.kind === "incident") ||
      nodes.find((n) => n.id === "SESSIONS" || n.label.toLowerCase().includes("session")),
  },
  {
    step: 2,
    title: "2/4: BLAST RADIUS MAPPED",
    badge: "PLATFORM INFRASTRUCTURE CLUSTER",
    badgeColor: "var(--nx-warn)",
    desc: "Graph traversal reveals Auth Gateway dependency on Session Store. Checkout frontend fails on auth timeout.",
    cypher: "MATCH path = (s:Service)-[:affects*1..2]->(downstream:Service) RETURN path",
    zoom: 1.6,
    highlightKeys: ["AUTH", "SESSIONS", "CHECKOUT", "NOTIFY"],
    findTarget: (nodes) =>
      nodes.find((n) => n.id === "AUTH" || n.label.toLowerCase().includes("auth")) ||
      nodes.find((n) => n.kind === "service"),
  },
  {
    step: 3,
    title: "3/4: OWNERSHIP RESOLVED",
    badge: "ON-CALL & SERVICE OWNERS",
    badgeColor: "var(--nx-info)",
    desc: "FalkorDB resolves service owners (Sarah Chen) and on-call SREs (Devon Vance) via direct ownership edges.",
    cypher: "MATCH (s:Service)<-[:owns]-(p:Person) WHERE s.id IN ['AUTH', 'SESSIONS'] RETURN p",
    zoom: 1.8,
    highlightKeys: ["AUTH", "SESSIONS", "Sarah", "Devon"],
    findTarget: (nodes) =>
      nodes.find((n) => n.kind === "person" && (n.label.includes("Sarah") || n.label.includes("Devon"))) ||
      nodes.find((n) => n.kind === "person"),
  },
  {
    step: 4,
    title: "4/4: TEMPORAL DECISION MEMORY",
    badge: "DEC-017 SUPERSEDED BY DEC-021",
    badgeColor: "var(--nx-ok)",
    desc: "FalkorDB temporal memory reveals DEC-017 (Postgres row locks) was superseded by DEC-021 (Redis session store). Autonomous triage pod suggests restarting Redis replica pool.",
    cypher: "MATCH (d1:Decision)<-[:supersedes]-(d2:Decision) WHERE d1.id = 'DEC-017' RETURN d2",
    zoom: 1.9,
    highlightKeys: ["DEC-017", "DEC-021"],
    findTarget: (nodes) =>
      nodes.find((n) => n.id === "DEC-017" || n.label.includes("DEC-017")) ||
      nodes.find((n) => n.kind === "decision" && n.dead),
  },
];

type FGNode = GraphNode & {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
};

type FGLink = Omit<GraphLink, "source" | "target"> & {
  source: FGNode | string;
  target: FGNode | string;
};

interface Point {
  x: number;
  y: number;
}

interface CachedHull {
  clusterIndex: number;
  name: string;
  hullPoints: Point[];
  floor: string;
  stroke: string;
  minY: number;
  centerX: number;
}

function crossProduct(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function computeConvexHull(points: Point[]): Point[] {
  if (points.length <= 2) return points.slice();
  const sorted = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function drawPaddedHull(ctx: CanvasRenderingContext2D, points: Point[], pad: number) {
  if (points.length === 0) return;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, pad, 0, Math.PI * 2);
    return;
  }
  if (points.length === 2) {
    const p1 = points[0];
    const p2 = points[1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const ang = Math.atan2(ny, nx);
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, pad, ang, ang + Math.PI, false);
    ctx.arc(p1.x, p1.y, pad, ang + Math.PI, ang + Math.PI * 2, false);
    ctx.closePath();
    return;
  }
  const k = points.length;
  ctx.beginPath();
  for (let i = 0; i < k; i += 1) {
    const prev = points[(i - 1 + k) % k];
    const curr = points[i];
    const next = points[(i + 1) % k];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const n1x = -dy1 / len1;
    const n1y = dx1 / len1;

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const n2x = -dy2 / len2;
    const n2y = dx2 / len2;

    const ang1 = Math.atan2(n1y, n1x);
    let ang2 = Math.atan2(n2y, n2x);
    if (ang2 > ang1) ang2 -= Math.PI * 2;

    ctx.arc(curr.x, curr.y, pad, ang1, ang2, true);
  }
  ctx.closePath();
}

const getClusterStyle = (id: string, name: string) => {
  const lower = `${id} ${name}`.toLowerCase();
  if (lower.includes("agent") || id === AGENT_POD_ID) {
    return { floor: "rgba(24, 33, 47, 0.6)", stroke: NX.agents };
  }
  if (lower.includes("payment") || lower.includes("ledger")) {
    return { floor: "rgba(46, 42, 32, 0.6)", stroke: NX.payments };
  }
  if (lower.includes("platform")) {
    return { floor: "rgba(31, 44, 39, 0.6)", stroke: NX.platform };
  }
  if (lower.includes("growth")) {
    return { floor: "rgba(33, 40, 56, 0.6)", stroke: NX.growth };
  }
  if (lower.includes("sre") || lower.includes("ops")) {
    return { floor: "rgba(43, 35, 49, 0.6)", stroke: NX.sre };
  }
  return { floor: "rgba(30, 36, 45, 0.6)", stroke: NX.accent };
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

interface ForceGraphInstance {
  zoomToFit: (ms?: number, pad?: number) => void;
  centerAt: (x?: number, y?: number, ms?: number) => void;
  zoom: (scale?: number, ms?: number) => number | void;
  d3Force: (name: string, fn?: unknown) => {
    strength: (val: unknown) => unknown;
    distance: (val: unknown) => unknown;
  } | undefined;
}

export function LiveTopology({
  data,
  highlightIds = [],
  onNodeClick,
  selectedNodeId = null,
  activeAudit = null,
  auditCypher = null,
}: LiveTopologyProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphInstance | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [hover, setHover] = useState<string | null>(null);
  const [depthFilter, setDepthFilter] = useState<"all" | "1-hop" | "2-hops">("all");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
  }, []);

  const fit = useCallback(() => {
    fgRef.current?.zoomToFit(400, 48);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      setTimeout(fit, 80);
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [fit]);

  const layout = useMemo(() => layoutGraph(data), [data]);
  const graph = useMemo(
    () => ({
      nodes: layout.nodes.map((n) => {
        // Pin team hubs to seed positions to keep clusters stable
        if (n.kind === "team") {
          return { ...n, fx: n.x, fy: n.y };
        }
        return { ...n };
      }) as FGNode[],
      links: layout.links.map((l) => ({ ...l })) as FGLink[],
    }),
    [layout],
  );

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

  // Keys illuminated by active tour step
  const tourLitKeys = useMemo(() => {
    if (tourStep === null) return new Set<string>();
    const step = TOUR_STEPS[tourStep - 1];
    if (!step) return new Set<string>();
    const keys = new Set<string>();
    graph.nodes.forEach((n) => {
      if (step.highlightKeys.some((k) => n.id.includes(k) || n.label.toUpperCase().includes(k.toUpperCase()))) {
        keys.add(n.id);
      }
    });
    return keys;
  }, [tourStep, graph.nodes]);

  const combinedLit = useMemo(() => {
    const set = new Set(highlightIds);
    tourLitKeys.forEach((k) => set.add(k));
    return set;
  }, [highlightIds, tourLitKeys]);

  // Ego-network neighborhood calculation for depth filter
  const activeFocusId = selectedNodeId || hover || (tourStep !== null ? TOUR_STEPS[tourStep - 1]?.highlightKeys[0] : null);
  const hopNeighborhood = useMemo(() => {
    if (depthFilter === "all" || !activeFocusId) return null;
    const oneHop = new Set<string>([activeFocusId]);
    const twoHops = new Set<string>([activeFocusId]);

    const direct = neighbours.get(activeFocusId);
    if (direct) {
      direct.forEach((id) => {
        oneHop.add(id);
        twoHops.add(id);
        if (depthFilter === "2-hops") {
          const indirect = neighbours.get(id);
          if (indirect) indirect.forEach((subId) => twoHops.add(subId));
        }
      });
    }
    return depthFilter === "1-hop" ? oneHop : twoHops;
  }, [depthFilter, activeFocusId, neighbours]);

  // Camera tweening when moving through the guided tour
  useEffect(() => {
    if (tourStep === null) return;
    const stepData = TOUR_STEPS[tourStep - 1];
    if (!stepData) return;

    const target = stepData.findTarget(graph.nodes);
    if (target && typeof target.x === "number" && typeof target.y === "number") {
      fgRef.current?.centerAt(target.x, target.y, 600);
      fgRef.current?.zoom(stepData.zoom, 600);
    }
  }, [tourStep, graph.nodes]);

  // Zoom to fit on initial mount and when data/batch updates
  useEffect(() => {
    const t = setTimeout(fit, 280);
    return () => clearTimeout(t);
  }, [fit, data]);

  // Configure D3 forces according to §6
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const charge = fg.d3Force("charge");
    if (charge) {
      charge.strength(-180);
    }

    const link = fg.d3Force("link");
    if (link) {
      link.distance((l: unknown) => {
        const edge = l as { source: FGNode | string; target: FGNode | string };
        const s = typeof edge.source === "object" ? edge.source : null;
        const t = typeof edge.target === "object" ? edge.target : null;
        if (s && t && s.cluster !== undefined && t.cluster !== undefined && s.cluster === t.cluster) {
          return 48; // intra-team
        }
        return 140; // cross-team
      });
    }

    try {
      if (forceCollide) {
        fg.d3Force(
          "collide",
          forceCollide((node: unknown) => {
            const n = node as FGNode;
            const r = n.kind === "team" ? 18 : n.kind === "service" ? 16 : 14;
            return r + 6;
          }),
        );
      }
    } catch {
      // safe fallback
    }

    try {
      const agentCluster = layout.clusters.find((c: GraphCluster) => c.id === AGENT_POD_ID);
      if (agentCluster && forceX && forceY) {
        fg.d3Force(
          "agentPodX",
          forceX((n: unknown) => ((n as FGNode).id.startsWith("PLAYBOOK") ? agentCluster.x : 0)).strength((n: unknown) =>
            (n as FGNode).id.startsWith("PLAYBOOK") ? 0.25 : 0,
          ),
        );
        fg.d3Force(
          "agentPodY",
          forceY((n: unknown) => ((n as FGNode).id.startsWith("PLAYBOOK") ? agentCluster.y : 0)).strength((n: unknown) =>
            (n as FGNode).id.startsWith("PLAYBOOK") ? 0.25 : 0,
          ),
        );
      }
    } catch {
      // safe fallback
    }
  }, [layout]);

  const faded = (id: string) => hover !== null && id !== hover && !neighbours.get(hover)?.has(id);

  // Throttled convex hull calculation (every 4 ticks)
  const frameRef = useRef(0);
  const cachedHullsRef = useRef<CachedHull[]>([]);

  const drawBackdrop = (ctx: CanvasRenderingContext2D, scale: number) => {
    frameRef.current += 1;
    const shouldRecompute = frameRef.current % 4 === 0 || cachedHullsRef.current.length === 0;

    if (shouldRecompute) {
      const nextHulls = layout.clusters.map((c, ci) => {
        // Exclude incident nodes so incidents on services do not stretch the team hull
        const clusterNodes = graph.nodes.filter((n) => n.cluster === ci && n.kind !== "incident");
        const points: Point[] = clusterNodes.map((n) => ({ x: n.x, y: n.y }));
        points.push({ x: c.x, y: c.y });
        const hull = computeConvexHull(points);

        const pad = 42;
        let minY = Infinity;
        let minX = Infinity;
        let maxX = -Infinity;
        hull.forEach((p) => {
          if (p.y < minY) minY = p.y;
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
        });

        const style = getClusterStyle(c.id, c.name);
        return {
          clusterIndex: ci,
          name: c.name,
          hullPoints: hull,
          floor: style.floor,
          stroke: style.stroke,
          minY: minY - pad,
          centerX: minX < maxX ? (minX + maxX) / 2 : c.x,
        };
      });
      cachedHullsRef.current = nextHulls;
    }

    // Render convex hulls with dashed stroke and badges
    cachedHullsRef.current.forEach((hullData) => {
      ctx.save();
      const pad = 42;
      drawPaddedHull(ctx, hullData.hullPoints, pad);
      ctx.fillStyle = hullData.floor;
      ctx.fill();
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.strokeStyle = hullData.stroke;
      ctx.stroke();
      ctx.setLineDash([]);

      // Pixel badge placed above top-most point with 8px offset
      const text = hullData.name.toUpperCase();
      const fontPx = Math.max(8, Math.round(11 / scale));
      ctx.font = `${fontPx}px "Silkscreen", monospace`;
      const textW = ctx.measureText(text).width;
      const badgeW = textW + 16 / scale;
      const badgeH = 22 / scale;
      const badgeX = hullData.centerX;
      const badgeY = hullData.minY - 8 / scale - badgeH / 2;

      ctx.fillStyle = NX.panel2;
      ctx.strokeStyle = hullData.stroke;
      ctx.lineWidth = 1.5 / scale;
      ctx.beginPath();
      ctx.rect(badgeX - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = hullData.stroke;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, badgeX, badgeY + 1 / scale);
      ctx.restore();
    });
  };

  // Screen-space HUD legend rendered on top of canvas matching §6
  const drawHUD = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const x = 12;
    const y = 12;
    const w = 480;
    const h = 28;

    // Background panel with 1px border
    ctx.fillStyle = "rgba(14, 19, 26, 0.94)";
    ctx.strokeStyle = NX.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    ctx.font = `11px "JetBrains Mono", monospace`;
    ctx.textBaseline = "middle";

    let cx = x + 12;
    const cy = y + h / 2;

    // 1. owns (solid line)
    ctx.strokeStyle = NX.line;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.stroke();
    cx += 24;
    ctx.fillStyle = NX.muted;
    ctx.fillText("owns", cx, cy);
    cx += 48;

    // 2. maintains (dashed line)
    ctx.strokeStyle = NX.line;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    cx += 24;
    ctx.fillStyle = NX.muted;
    ctx.fillText("maintains", cx, cy);
    cx += 78;

    // 3. affects (solid blue)
    ctx.strokeStyle = "rgba(108, 182, 255, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.stroke();
    cx += 24;
    ctx.fillStyle = NX.muted;
    ctx.fillText("affects", cx, cy);
    cx += 64;

    // 4. replaces (dashed warn)
    ctx.strokeStyle = NX.warn;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    cx += 24;
    ctx.fillStyle = NX.muted;
    ctx.fillText("replaces", cx, cy);
    cx += 72;

    // 5. superseded (dashed bad)
    ctx.strokeStyle = "rgba(235, 87, 87, 0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    cx += 24;
    ctx.fillStyle = NX.muted;
    ctx.fillText("superseded", cx, cy);

    ctx.restore();
  };

  // Node drawing matching §6 fixed screen sizes
  const drawNode = (raw: object, ctx: CanvasRenderingContext2D, scale: number) => {
    const n = raw as FGNode;
    const style = getClusterStyle(layout.clusters[n.cluster]?.id ?? "", layout.clusters[n.cluster]?.name ?? "");
    const isLit = combinedLit.has(n.id);
    const isHovered = hover === n.id;

    // Ego-network hop filter: if depth filter is active, fade out non-neighborhood nodes to a tiny dot
    if (hopNeighborhood && !hopNeighborhood.has(n.id)) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 3 / scale, 0, Math.PI * 2);
      ctx.fillStyle = NX.muted;
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalAlpha = faded(n.id) ? 0.18 : combinedLit.size > 0 && n.kind !== "team" && !isLit ? 0.4 : 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (n.kind === "team") {
      // Team hub: 18px circle
      const r = 9 / scale;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = style.stroke;
      ctx.fill();
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = NX.ink;
      ctx.stroke();

      // Short team acronym inside hub
      const acronym = n.label
        .split(/\s+/)
        .filter((w) => /^[A-Za-z]/.test(w))
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("");
      ctx.font = `700 ${Math.max(7, 8 / scale)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = NX.ink;
      ctx.fillText(acronym, n.x, n.y + 0.5 / scale);
    } else if (n.kind === "agent") {
      // Agent: 14px blue circle
      const r = 7 / scale;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = NX.info;
      ctx.fill();
      ctx.lineWidth = isLit ? 3 / scale : 1.5 / scale;
      ctx.strokeStyle = isLit ? NX.accent : NX.ink;
      ctx.stroke();

      ctx.font = `700 ${Math.max(6, 7 / scale)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = NX.ink;
      ctx.fillText(initials(n.label), n.x, n.y + 0.5 / scale);

      // Label with 3px ink halo
      const fontPx = Math.max(9, 10 / scale);
      ctx.font = `700 ${fontPx}px "JetBrains Mono", monospace`;
      ctx.strokeStyle = NX.ink;
      ctx.lineWidth = 3 / scale;
      ctx.strokeText(n.label, n.x, n.y + r + 8 / scale);
      ctx.fillStyle = NX.info;
      ctx.fillText(n.label, n.x, n.y + r + 8 / scale);
    } else if (n.kind === "person") {
      // Person: 14px circle with initials
      const r = 7 / scale;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = NX.panel2;
      ctx.fill();
      ctx.lineWidth = isLit ? 3 / scale : 1.5 / scale;
      ctx.strokeStyle = isLit ? NX.accent : style.stroke;
      ctx.stroke();

      ctx.font = `700 ${Math.max(6, 7 / scale)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = NX.text;
      ctx.fillText(initials(n.label), n.x, n.y + 0.5 / scale);

      // Person labels show at scale >= 1.2 or on hover
      if (scale >= 1.2 || isHovered) {
        const firstName = n.label.split(" ")[0];
        const fontPx = Math.max(9, 10 / scale);
        ctx.font = `600 ${fontPx}px "JetBrains Mono", monospace`;
        ctx.strokeStyle = NX.ink;
        ctx.lineWidth = 3 / scale;
        ctx.strokeText(firstName, n.x, n.y + r + 8 / scale);
        ctx.fillStyle = NX.text;
        ctx.fillText(firstName, n.x, n.y + r + 8 / scale);
      }
    } else if (n.kind === "service") {
      // Service: 16px rack square
      const hw = 8 / scale;
      ctx.beginPath();
      ctx.rect(n.x - hw, n.y - hw, hw * 2, hw * 2);
      ctx.fillStyle = NX.panel2;
      ctx.fill();
      ctx.lineWidth = isLit ? 3 / scale : 2 / scale;
      ctx.strokeStyle = isLit ? NX.accent : n.incident ? NX.bad : NX.ink;
      ctx.stroke();

      // Mini rack lines inside
      ctx.fillStyle = NX.ink;
      ctx.fillRect(n.x - hw + 2 / scale, n.y - hw / 2, hw * 2 - 4 / scale, 2 / scale);
      ctx.fillRect(n.x - hw + 2 / scale, n.y + hw / 4, hw * 2 - 4 / scale, 2 / scale);

      // Status pip
      ctx.fillStyle = n.incident ? NX.bad : NX.ok;
      ctx.fillRect(n.x - hw + 2 / scale, n.y - hw / 2, 2 / scale, 2 / scale);

      if (n.incident) {
        ctx.fillStyle = NX.bad;
        ctx.beginPath();
        ctx.arc(n.x + hw, n.y - hw, 3 / scale, 0, Math.PI * 2);
        ctx.fill();
      }

      // Always show service label using shortName mapping
      const shortName = getServiceShortName(n.label);
      const fontPx = Math.max(9, 10 / scale);
      ctx.font = `700 ${fontPx}px "JetBrains Mono", monospace`;
      ctx.strokeStyle = NX.ink;
      ctx.lineWidth = 3 / scale;
      ctx.strokeText(shortName, n.x, n.y + hw + 8 / scale);
      ctx.fillStyle = NX.text;
      ctx.fillText(shortName, n.x, n.y + hw + 8 / scale);
    } else if (n.kind === "decision") {
      // Decision: 14px diamond (mint live / amber replaced)
      const d = 7 / scale;
      ctx.beginPath();
      ctx.moveTo(n.x, n.y - d);
      ctx.lineTo(n.x + d, n.y);
      ctx.lineTo(n.x, n.y + d);
      ctx.lineTo(n.x - d, n.y);
      ctx.closePath();

      ctx.fillStyle = n.dead ? NX.warn : NX.ok;
      ctx.fill();
      ctx.lineWidth = isLit ? 3 / scale : 1.5 / scale;
      ctx.strokeStyle = isLit ? NX.accent : NX.ink;
      ctx.stroke();

      // Always show decision label with 3px ink halo
      const fontPx = Math.max(9, 10 / scale);
      ctx.font = `700 ${fontPx}px "JetBrains Mono", monospace`;
      ctx.strokeStyle = NX.ink;
      ctx.lineWidth = 3 / scale;
      ctx.strokeText(n.label, n.x, n.y + d + 8 / scale);
      ctx.fillStyle = n.dead ? NX.warn : NX.ok;
      ctx.fillText(n.label, n.x, n.y + d + 8 / scale);

      if (n.dead) {
        // Strike-through line on replaced decision label
        const tw = ctx.measureText(n.label).width;
        ctx.strokeStyle = NX.bad;
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.moveTo(n.x - tw / 2, n.y + d + 8 / scale);
        ctx.lineTo(n.x + tw / 2, n.y + d + 8 / scale);
        ctx.stroke();
      }
    } else if (n.kind === "incident") {
      // Incident: 14px red square
      const hw = 7 / scale;
      ctx.beginPath();
      ctx.rect(n.x - hw, n.y - hw, hw * 2, hw * 2);
      ctx.fillStyle = NX.bad;
      ctx.fill();
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = NX.ink;
      ctx.stroke();

      const fontPx = Math.max(9, 10 / scale);
      ctx.font = `700 ${fontPx}px "JetBrains Mono", monospace`;
      ctx.strokeStyle = NX.ink;
      ctx.lineWidth = 3 / scale;
      ctx.strokeText(n.label, n.x, n.y + hw + 8 / scale);
      ctx.fillStyle = NX.bad;
      ctx.fillText(n.label, n.x, n.y + hw + 8 / scale);
    }

    ctx.restore();
  };

  // Edge drawing matching §6 specifications
  const drawLink = (raw: object, ctx: CanvasRenderingContext2D, scale: number) => {
    const l = raw as FGLink;
    const s = l.source as FGNode;
    const t = l.target as FGNode;
    if (typeof s !== "object" || typeof t !== "object") return;
    ctx.save();
    if (hopNeighborhood && (!hopNeighborhood.has(s.id) || !hopNeighborhood.has(t.id))) {
      ctx.globalAlpha = 0.03;
    } else {
      ctx.globalAlpha = hover !== null && s.id !== hover && t.id !== hover ? 0.15 : 1;
    }
    ctx.setLineDash([]);

    if (l.kind === "owns") {
      // owns = solid --nx-line
      ctx.strokeStyle = NX.line;
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    } else if (l.kind === "maintains") {
      // maintains = dashed --nx-line
      ctx.strokeStyle = NX.line;
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    } else if (l.kind === "affects") {
      // affects = solid --nx-info at 0.6
      ctx.strokeStyle = "rgba(108, 182, 255, 0.6)";
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    } else if (l.kind === "supersedes") {
      // replaces = dashed --nx-warn with an arrow
      ctx.strokeStyle = NX.warn;
      ctx.lineWidth = 2.5 / scale;
      ctx.setLineDash([6 / scale, 3 / scale]);

      const mx = (s.x + t.x) / 2;
      const my = (s.y + t.y) / 2;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.hypot(dx, dy) || 1;
      const cx = mx - (dy / len) * (40 / scale);
      const cy = my + (dx / len) * (40 / scale);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(cx, cy, t.x, t.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const ang = Math.atan2(t.y - cy, t.x - cx);
      const ax = t.x - Math.cos(ang) * (18 / scale);
      const ay = t.y - Math.sin(ang) * (18 / scale);
      ctx.fillStyle = NX.warn;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - Math.cos(ang - 0.45) * (10 / scale), ay - Math.sin(ang - 0.45) * (10 / scale));
      ctx.lineTo(ax - Math.cos(ang + 0.45) * (10 / scale), ay - Math.sin(ang + 0.45) * (10 / scale));
      ctx.closePath();
      ctx.fill();

      ctx.font = `700 ${Math.max(9, 10 / scale)}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = NX.ink;
      ctx.lineWidth = 3 / scale;
      ctx.strokeText("replaces", (mx + cx) / 2, (my + cy) / 2 - 6 / scale);
      ctx.fillStyle = NX.warn;
      ctx.fillText("replaces", (mx + cx) / 2, (my + cy) / 2 - 6 / scale);
    } else if (l.kind === "superseded_source") {
      // superseded-source edges = dashed --nx-bad at 0.7
      ctx.strokeStyle = "rgba(235, 87, 87, 0.7)";
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    } else {
      // member = faint line
      ctx.strokeStyle = "rgba(43, 55, 71, 0.4)";
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
    ctx.restore();
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
    const w = (n.kind === "team" ? 18 : n.kind === "service" ? 16 : 14) * 1.5;
    ctx.beginPath();
    ctx.arc(n.x, n.y, w, 0, Math.PI * 2);
    ctx.fill();
  };

  return (
    <div
      ref={wrapRef}
      data-testid="live-topology-canvas"
      className="absolute inset-0 select-none overflow-hidden"
      style={{ background: "var(--nx-bg)" }}
    >
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
        linkDirectionalParticles={(l: object) => {
          if (reducedMotion) return 0;
          const link = l as FGLink;
          const s = typeof link.source === "object" ? link.source : { id: link.source };
          const t = typeof link.target === "object" ? link.target : { id: link.target };
          const isLitEdge = combinedLit.has(s.id) && combinedLit.has(t.id);
          if (link.kind === "affects") return 4;
          if (link.kind === "supersedes") return 3;
          if (isLitEdge) return 3;
          if (link.kind === "owns") return 1;
          return 0;
        }}
        linkDirectionalParticleSpeed={(l: object) => {
          const link = l as FGLink;
          if (link.kind === "affects") return 0.016;
          if (link.kind === "supersedes") return 0.009;
          return 0.006;
        }}
        linkDirectionalParticleWidth={(l: object) => {
          const link = l as FGLink;
          if (link.kind === "affects") return 3.5;
          if (link.kind === "supersedes") return 3;
          return 2.5;
        }}
        linkDirectionalParticleColor={(l: object) => {
          const link = l as FGLink;
          if (link.kind === "affects") return NX.bad;
          if (link.kind === "supersedes") return NX.warn;
          if (link.kind === "owns") return NX.info;
          return NX.accent;
        }}
        onRenderFramePre={drawBackdrop}
        onRenderFramePost={drawHUD}
        onNodeHover={(n) => setHover(n ? (n as FGNode).id : null)}
        onNodeClick={handleClick}
        enableNodeDrag={false}
        cooldownTicks={200}
        warmupTicks={40}
        minZoom={0.25}
        maxZoom={4}
      />

      {/* Top-Right Control Toolbar: Depth Filter + Tour + Fit View */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 select-none">
        {/* Hop Depth Filter Segmented Control */}
        <div className="nx-seg flex items-center">
          <span
            className="nx-mono text-[10px] px-2 select-none"
            style={{
              background: "var(--nx-panel)",
              border: "1px solid var(--nx-line)",
              borderRight: "none",
              color: "var(--nx-muted)",
              height: 26,
              display: "flex",
              alignItems: "center",
            }}
          >
            DEPTH
          </span>
          {(["all", "1-hop", "2-hops"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDepthFilter(d)}
              className={`nx-btn text-[10px] ${depthFilter === d ? "is-on" : ""}`}
              style={{ height: 26, padding: "0 8px" }}
              title={
                d === "all"
                  ? "Show complete graph topology"
                  : `Isolate ${d} neighborhood around selected/hovered node`
              }
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Guided Tour Trigger Button */}
        <button
          type="button"
          onClick={() => {
            if (tourStep === null) setTourStep(1);
            else {
              setTourStep(null);
              fit();
            }
          }}
          className={`nx-btn text-xs ${tourStep !== null ? "nx-btn--warn" : "nx-btn--primary"}`}
          style={{ height: 26, padding: "0 10px" }}
          title="Interactive incident triage walkthrough"
        >
          {tourStep !== null ? "EXIT TOUR" : "▶ TOUR"}
        </button>

        {/* Fit View Button */}
        <button
          type="button"
          className="nx-btn text-xs"
          style={{ height: 26, padding: "0 8px" }}
          onClick={fit}
          title="Fit full topology in view"
        >
          FIT VIEW
        </button>
      </div>

      {/* Depth Filter Helper Toast */}
      {depthFilter !== "all" && !activeFocusId && tourStep === null && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 nx-mono text-xs select-none pointer-events-none"
          style={{
            background: "var(--nx-panel)",
            border: "1px dashed var(--nx-info)",
            color: "var(--nx-info)",
          }}
        >
          CLICK ANY NODE TO ISOLATE {depthFilter.toUpperCase()} NEIGHBORHOOD
        </div>
      )}

      {/* Live Cypher Query Banner (shown during audit or when query is available) */}
      {(auditCypher || activeAudit) && tourStep === null && (
        <div
          className="absolute bottom-3 left-3 z-10 p-2 flex items-center gap-2 select-all shadow-lg pointer-events-auto"
          style={{
            maxWidth: "calc(100% - 140px)",
            border: "1px solid var(--nx-line)",
            background: "rgba(9, 12, 17, 0.94)",
          }}
        >
          <span className="nx-chip text-[9px] shrink-0" style={{ color: "var(--nx-accent)", height: 18 }}>
            FALKORDB {activeAudit ? activeAudit.toUpperCase() : "CYPHER"}
          </span>
          <code className="nx-mono text-[10px] truncate" style={{ color: "var(--nx-text)" }}>
            {auditCypher || "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100"}
          </code>
          <span className="nx-mono text-[9px] shrink-0" style={{ color: "var(--nx-ok)" }}>
            ● 0.4ms
          </span>
        </div>
      )}

      {/* Guided Tour Floating Narrative Card */}
      {tourStep !== null && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 p-3 select-none flex flex-col gap-2"
          style={{
            width: "min(580px, calc(100% - 24px))",
            background: "rgba(10, 15, 20, 0.96)",
            border: "1px solid var(--nx-line)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.8), 0 0 0 1px var(--nx-ink)",
          }}
        >
          {/* Tour Card Header */}
          <div className="flex items-center justify-between pb-1" style={{ borderBottom: "1px solid var(--nx-line)" }}>
            <div className="flex items-center gap-2">
              <span className="nx-display text-xs" style={{ color: "var(--nx-accent)", letterSpacing: ".06em" }}>
                {TOUR_STEPS[tourStep - 1].title}
              </span>
              <span
                className="nx-chip text-[9px]"
                style={{
                  color: TOUR_STEPS[tourStep - 1].badgeColor,
                  border: `1px solid ${TOUR_STEPS[tourStep - 1].badgeColor}`,
                  height: 18,
                  padding: "0 6px",
                }}
              >
                {TOUR_STEPS[tourStep - 1].badge}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setTourStep(null);
                fit();
              }}
              className="nx-btn text-[11px]"
              style={{ height: 20, width: 20, padding: 0 }}
              title="Exit Tour"
            >
              ×
            </button>
          </div>

          {/* Tour Card Description */}
          <p className="nx-mono text-xs leading-relaxed" style={{ color: "var(--nx-text)", margin: 0 }}>
            {TOUR_STEPS[tourStep - 1].desc}
          </p>

          {/* Tour Cypher Query */}
          <div
            className="p-1.5 nx-mono text-[10px] flex items-center justify-between gap-2 overflow-x-auto"
            style={{
              background: "var(--nx-panel-2)",
              border: "1px solid var(--nx-line)",
              color: "var(--nx-info)",
            }}
          >
            <code className="truncate">{TOUR_STEPS[tourStep - 1].cypher}</code>
            <span className="nx-chip text-[9px] shrink-0" style={{ color: "var(--nx-ok)", height: 16 }}>
              FALKORDB
            </span>
          </div>

          {/* Stepper Controls */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setTourStep((s) => (s && s > 1 ? s - 1 : 1))}
              disabled={tourStep <= 1}
              className="nx-btn text-xs"
              style={{ height: 26, padding: "0 10px" }}
            >
              ◀ PREV
            </button>

            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((s) => (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => setTourStep(s.step)}
                  className={`nx-btn text-[10px] ${tourStep === s.step ? "nx-btn--primary" : ""}`}
                  style={{
                    height: 22,
                    width: 24,
                    padding: 0,
                  }}
                >
                  {s.step}
                </button>
              ))}
            </div>

            {tourStep < TOUR_STEPS.length ? (
              <button
                type="button"
                onClick={() => setTourStep((s) => (s ? s + 1 : 1))}
                className="nx-btn nx-btn--primary text-xs"
                style={{ height: 26, padding: "0 10px" }}
              >
                NEXT ▶
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTourStep(null);
                  fit();
                }}
                className="nx-btn is-on text-xs"
                style={{ height: 26, padding: "0 10px" }}
              >
                FINISH ◼
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
