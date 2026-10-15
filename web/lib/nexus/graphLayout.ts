import type { TopologyData } from "./api";
import { buildRooms, RECORDS_ID, str } from "./office.ts";

export type GraphKind = "team" | "person" | "service" | "decision";

export interface GraphNode {
  id: string;
  kind: GraphKind;
  label: string;
  x: number;
  y: number;
  cluster: number;
  dead?: boolean;
  incident?: boolean;
  hasDecision?: boolean;
  detail?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  kind: "member" | "owns" | "maintains" | "affects" | "supersedes";
}

export interface GraphCluster {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  rx: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  links: GraphLink[];
  clusters: GraphCluster[];
}

const R_PEOPLE = 66;
const R_SERVICES = 128;
const R_DECISIONS = 214;
const CLUSTER_R = 230;
const STRETCH = 1.45; // islands are wider than tall to match a widescreen panel
const SPACING_X = 900;
const SPACING_Y = 490;

/**
 * Lays the company out as islands: one per team, with the team in the middle, its people in an inner
 * ring, its services in a second ring and decisions on the outside, next to the service they affect.
 * Positions are fixed, so the picture is the same every time and nothing jitters.
 */
export function layoutGraph(data: TopologyData): GraphLayout {
  const { rooms, supersededBy, incidents, decisionService } = buildRooms(data);
  const cols = rooms.length > 2 ? 2 : rooms.length || 1;
  const nodes: GraphNode[] = [];
  const clusters: GraphCluster[] = [];
  const links: GraphLink[] = [];
  const pos = new Map<string, { x: number; y: number }>();

  const place = (n: GraphNode) => {
    nodes.push(n);
    pos.set(n.id, { x: n.x, y: n.y });
  };

  rooms.forEach((room, ci) => {
    const cx = (ci % cols) * SPACING_X;
    const cy = Math.floor(ci / cols) * SPACING_Y;
    clusters.push({ id: room.id, name: room.name, x: cx, y: cy, r: CLUSTER_R, rx: CLUSTER_R * STRETCH });

    if (room.id !== RECORDS_ID) {
      place({ id: `team:${room.id}`, kind: "team", label: room.name, x: cx, y: cy, cluster: ci });
    }

    room.people.forEach((p, i) => {
      const a = -Math.PI / 2 + (i / Math.max(room.people.length, 1)) * Math.PI * 2;
      place({
        id: p.id,
        kind: "person",
        label: str(p.properties?.name) || p.name,
        x: cx + Math.cos(a) * R_PEOPLE * STRETCH,
        y: cy + Math.sin(a) * R_PEOPLE,
        cluster: ci,
        detail: str(p.properties?.role),
      });
      if (room.id !== RECORDS_ID) links.push({ source: `team:${room.id}`, target: p.id, kind: "member" });
    });

    // services sit in the gaps between people so lines and labels do not collide
    const n = room.people.length;
    const m = room.services.length;
    const svcAngle = new Map<string, number>();
    room.services.forEach((sv, k) => {
      const a =
        n >= m && n > 0
          ? -Math.PI / 2 + (Math.floor(((k + 0.5) * n) / m) / n) * Math.PI * 2 + Math.PI / n
          : -Math.PI / 2 + ((k + 0.5) / Math.max(m, 1)) * Math.PI * 2;
      svcAngle.set(sv.id, a);
      place({
        id: sv.id,
        kind: "service",
        label: sv.name,
        x: cx + Math.cos(a) * R_SERVICES * STRETCH,
        y: cy + Math.sin(a) * R_SERVICES,
        cluster: ci,
        incident: incidents.has(sv.id),
        detail: `tier ${str(sv.properties?.tier) || "-"}`,
      });
    });

    const perService = new Map<string, number>();
    const totalFor = new Map<string, number>();
    room.decisions.forEach((d) => totalFor.set(decisionService.get(d.id) ?? "", (totalFor.get(decisionService.get(d.id) ?? "") ?? 0) + 1));
    room.decisions.forEach((d, i) => {
      const svc = decisionService.get(d.id);
      const base = svc ? svcAngle.get(svc) : undefined;
      const n = perService.get(svc ?? "") ?? 0;
      perService.set(svc ?? "", n + 1);
      const count = totalFor.get(svc ?? "") ?? 1;
      const a = base !== undefined ? base + (n - (count - 1) / 2) * 0.5 : -Math.PI / 2 + i * 0.7;
      place({
        id: d.id,
        kind: "decision",
        label: d.id,
        x: cx + Math.cos(a) * R_DECISIONS * STRETCH,
        y: cy + Math.sin(a) * R_DECISIONS,
        cluster: ci,
        dead: str(d.properties?.status) === "superseded" || supersededBy.has(d.id),
        detail: str(d.properties?.summary),
      });
      if (svc && pos.has(svc)) {
        links.push({ source: d.id, target: svc, kind: "affects" });
        const svcNode = nodes.find((x) => x.id === svc);
        if (svcNode) svcNode.hasDecision = true;
      }
    });
  });

  data.links.forEach((l) => {
    const s = typeof l.source === "string" ? l.source : l.source.id;
    const t = typeof l.target === "string" ? l.target : l.target.id;
    if (!pos.has(s) || !pos.has(t)) return;
    if (l.label === "OWNS") links.push({ source: s, target: t, kind: "owns" });
    else if (l.label === "MAINTAINS") links.push({ source: s, target: t, kind: "maintains" });
    else if (l.label === "SUPERSEDES") links.push({ source: s, target: t, kind: "supersedes" });
  });

  return { nodes, links, clusters };
}
