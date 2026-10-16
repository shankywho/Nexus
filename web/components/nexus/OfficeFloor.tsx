"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TopologyNode, AgentStepTrace } from "@/lib/nexus/api";
import { buildRooms, RECORDS_ID, AGENT_POD_ID, str, type Room } from "@/lib/nexus/office";
import { FLOORS, RECORDS_FLOOR, AGENT_FLOOR } from "@/lib/nexus/theme";
import { describeEvent, KIND_COLOR, type IngestEvent } from "@/lib/nexus/events";
import type { TaskHandoffEvent } from "@/lib/nexus/useAgentStream";

interface OfficeFloorProps {
  data: Parameters<typeof buildRooms>[0];
  highlightIds: string[];
  onNodeClick: (node: TopologyNode) => void;
  /** Latest ingested event; each new one plays a short scene on the floor. */
  event?: IngestEvent | null;
  latestStep?: AgentStepTrace | null;
  latestHandoff?: TaskHandoffEvent | null;
  activeAgent?: string | null;
}


const ROOM_W = 648;
const GAP = 20;
const PAD = 16;
const WALL_H = 40;
const BOARD_W = 128;
const BOARD_H = 80;
const BOARD_SLOT = BOARD_W + 12;
const RACK_SLOT = 104;
const RACK_ROW_H = 88;
const DESK_SLOT = 124;
const DESK_ROW_H = 118;

const C = {
  ink: "#070c10",
  cream: "#f6ebcb",
  paper: "#f6efd6",
  paperOld: "#c4bea6",
  wall: "#3a4a58",
  wallLine: "#2f3d49",
  desk: "#8a5a3b",
  deskTop: "#a56f48",
  rack: "#3b4a57",
  rackDark: "#26323c",
  screen: "#0e4b55",
  mint: "#6be3a5",
  sky: "#5cc8f0",
  lemon: "#ffd166",
  coral: "#ff6b6b",
};

const SKIN = ["#f2c9a0", "#d9a577", "#b87d52", "#8a5a3b"];
const HAIR = ["#2a1b14", "#5a3a22", "#c9a24a", "#9a4a2a", "#1b1f2a"];

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

function wrap(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  text.split(" ").forEach((w) => {
    if (cur && `${cur} ${w}`.length > width) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  });
  if (cur) lines.push(cur);
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines) out[maxLines - 1] = clip(`${out[maxLines - 1]} …`, width);
  return out.map((l) => clip(l, width));
}

function roomMetrics(room: Room) {
  const inner = ROOM_W - PAD * 2;
  const boardCols = Math.max(1, Math.floor(inner / BOARD_SLOT));
  const rackCols = Math.max(1, Math.floor(inner / RACK_SLOT));
  const deskCols = Math.max(1, Math.floor(inner / DESK_SLOT));
  const r = room.services.length;
  const b = room.decisions.length;
  // racks on the left and boards on the right when they fit on one row; otherwise stacked
  const sideBySide = r > 0 && b > 0 && r * RACK_SLOT + b * BOARD_SLOT + 16 <= inner;
  const boardsH = b ? Math.ceil(b / boardCols) * (BOARD_H + 14) + 10 : 0;
  const racksH = r ? Math.ceil(r / rackCols) * RACK_ROW_H + 6 : 0;
  const topH = sideBySide ? Math.max(boardsH, racksH) : boardsH + racksH;
  const desksH = room.people.length ? Math.ceil(room.people.length / deskCols) * DESK_ROW_H + 24 : 0;
  return { boardCols, rackCols, deskCols, boardsH, racksH, topH, sideBySide, desksH, height: WALL_H + topH + desksH + PAD };
}

/** Pixel person, 10 x 10 cells. */
function Sprite({ seed, shirt }: { seed: string; shirt: string }) {
  const h = hash(seed);
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >> 3) % HAIR.length];
  const long = ((h >> 6) & 1) === 1;
  const rows = [
    "..HHHHHH..",
    ".HHHHHHHH.",
    long ? "HHSSSSSSHH" : ".HSSSSSSH.",
    long ? "HHSESSESHH" : ".HSESSESH.",
    long ? "HHSSSSSSHH" : ".HSSSSSSH.",
    long ? "HH.SSSS.HH" : "..SSSSSS..",
    "..TTTTTT..",
    ".TTTTTTTT.",
    "STTTTTTTTS",
    "STTTTTTTTS",
  ];
  const fill: Record<string, string> = { H: hair, S: skin, E: C.ink, T: shirt };
  const px = 3;
  return (
    <g shapeRendering="crispEdges">
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) =>
          ch === "." ? null : <rect key={`${x}-${y}`} x={x * px} y={y * px} width={px} height={px} fill={fill[ch]} />,
        ),
      )}
    </g>
  );
}

/** Pixel robot for autonomous agents, 10 x 10 cells. */
function RobotSprite({ seed, accent }: { seed: string; accent: string }) {
  const isScout = seed.includes("scout");
  const isPlanner = seed.includes("planner");
  const eye = isScout ? C.sky : isPlanner ? C.lemon : C.mint;
  const chassis = isScout ? "#0284c7" : isPlanner ? "#d97706" : "#059669";
  const metal = "#475569";
  const metalLight = "#94a3b8";
  const rows = [
    "..||||||..",
    "..######..",
    ".########.",
    ".#EEEEEE#.",
    ".#E#EE#E#.",
    "..######..",
    "..TTTTTT..",
    ".TTTTTTTT.",
    "MTTTTTTTTM",
    "MTTTTTTTTM",
  ];
  const fill: Record<string, string> = {
    "|": accent,
    "#": metal,
    E: eye,
    T: chassis,
    M: metalLight,
  };
  const px = 3;
  return (
    <g shapeRendering="crispEdges">
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) =>
          ch === "." ? null : <rect key={`${x}-${y}`} x={x * px} y={y * px} width={px} height={px} fill={fill[ch]} />
        )
      )}
    </g>
  );
}


function Bubble({ cx, bottom, lines, fill }: { cx: number; bottom: number; lines: string[]; fill: string }) {
  const w = Math.max(...lines.map((l) => l.length)) * 8.2 + 22;
  const h = lines.length * 18 + 12;
  return (
    <g transform={`translate(${cx - w / 2}, ${bottom - h - 6})`} shapeRendering="crispEdges" pointerEvents="none">
      <rect x="0" y="2" width={w} height={h - 4} fill={C.ink} />
      <rect x="2" y="0" width={w - 4} height={h} fill={C.ink} />
      <rect x="2" y="4" width={w - 4} height={h - 8} fill={fill} />
      <rect x="4" y="2" width={w - 8} height={h - 4} fill={fill} />
      <rect x={w / 2 - 4} y={h} width="8" height="2" fill={C.ink} />
      <rect x={w / 2 - 2} y={h + 2} width="4" height="2" fill={C.ink} />
      <rect x={w / 2 - 2} y={h - 2} width="4" height="4" fill={fill} />
      {lines.map((line, i) => (
        <text key={line + i} x={w / 2} y={19 + i * 18} textAnchor="middle" className="nx-t-ui" fontSize="14" fill={C.ink}>
          {line}
        </text>
      ))}
    </g>
  );
}

/** Slot positions inside a room. Shared by the render pass and the animation anchors. */
type Metrics = ReturnType<typeof roomMetrics>;
const boardPos = (m: Metrics, room: Room, k: number) => ({
  x: m.sideBySide ? ROOM_W - PAD - (room.decisions.length - k) * BOARD_SLOT + 12 : PAD + (k % m.boardCols) * BOARD_SLOT,
  y: WALL_H + 14 + (m.sideBySide ? 0 : Math.floor(k / m.boardCols) * (BOARD_H + 14)),
});
const rackPos = (m: Metrics, k: number) => ({
  x: PAD + (k % m.rackCols) * RACK_SLOT + 12,
  y: WALL_H + (m.sideBySide ? 0 : m.boardsH) + 8 + Math.floor(k / m.rackCols) * RACK_ROW_H,
});
const deskPos = (m: Metrics, k: number) => ({
  x: PAD + (k % m.deskCols) * DESK_SLOT + 10,
  y: WALL_H + m.topH + 14 + Math.floor(k / m.deskCols) * DESK_ROW_H,
});

/*
 * Motion. The timings and the idea that status is shown by movement come from the office scene of
 * Munder Difflin (MIT, https://github.com/HarnessMD/munder-difflin): avatars walk in from the door,
 * monitors light up with scrolling lines and a blinking cursor, work shows as a pulsing halo,
 * messages fly desk to desk as envelopes on an arc and end in a small ring. The code here is our own.
 */
const ENV_SPEED = 230; // units per second
const ENV_ARC = 38;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function Envelope({ from, to, color, onDone }: { from: { x: number; y: number }; to: { x: number; y: number }; color: string; onDone: () => void }) {
  const g = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = Math.min(2, Math.max(0.8, dist / ENV_SPEED));
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const el = (now - t0) / 1000;
      const node = g.current;
      if (!node) return;
      if (el < dur) {
        const e = ease(el / dur);
        const x = from.x + (to.x - from.x) * e;
        const y = from.y + (to.y - from.y) * e - ENV_ARC * Math.sin(Math.PI * e);
        node.setAttribute("transform", `translate(${Math.round(x)}, ${Math.round(y)})`);
        const fade = Math.min(1, el / 0.14, Math.max(0, (dur - el) / 0.22));
        node.style.opacity = String(fade);
        body.current?.setAttribute("transform", `rotate(${(Math.sin(el * 6) * 0.12 * 180) / Math.PI})`);
        raf = requestAnimationFrame(tick);
        return;
      }
      const b = (el - dur) / 0.34; // arrival ring
      node.setAttribute("transform", `translate(${to.x}, ${to.y})`);
      if (body.current) body.current.style.display = "none";
      if (ring.current) {
        ring.current.style.display = "block";
        ring.current.setAttribute("r", String(3 + Math.min(b, 1) * 14));
        ring.current.setAttribute("stroke-opacity", String(1 - Math.min(b, 1)));
      }
      node.style.opacity = "1";
      if (b >= 1) {
        onDone();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // from, to and color are fixed for the lifetime of one envelope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <g ref={g} style={{ opacity: 0 }} pointerEvents="none" transform={`translate(${from.x}, ${from.y})`}>
      <g ref={body} shapeRendering="crispEdges">
        <rect x="-8" y="-6" width="16" height="12" fill={color} stroke={C.ink} strokeWidth="2" />
        <path d="M-8 -6 L0 2 L8 -6" fill="none" stroke={C.ink} strokeWidth="2" />
      </g>
      <circle ref={ring} r="3" fill="none" stroke={C.lemon} strokeWidth="3" style={{ display: "none" }} />
    </g>
  );
}

function Confetti({ colors }: { colors: string[] }) {
  return (
    <g pointerEvents="none" shapeRendering="crispEdges">
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <rect
            key={i}
            className="nx-confetti"
            x={BOARD_W / 2}
            y={BOARD_H / 2}
            width="5"
            height="5"
            fill={colors[i % colors.length]}
            style={{ ["--tx" as string]: `${Math.cos(a) * 80}px`, ["--ty" as string]: `${Math.sin(a) * 56 - 12}px` }}
          />
        );
      })}
    </g>
  );
}

export function OfficeFloor({
  data,
  highlightIds,
  onNodeClick,
  event = null,
  latestStep = null,
  latestHandoff = null,
  activeAgent = null,
}: OfficeFloorProps) {
  const { rooms, supersededBy, incidents, personNote } = useMemo(() => buildRooms(data), [data]);

  const hl = useMemo(() => new Set(highlightIds), [highlightIds]);
  const [hover, setHover] = useState<string | null>(null);
  const dim = (id: string) => (hl.size > 0 && !hl.has(id) ? 0.38 : 1);

  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  const [envelopes, setEnvelopes] = useState<Array<{ key: number; from: { x: number; y: number }; to: { x: number; y: number }; color: string }>>([]);
  const [active, setActive] = useState<Record<string, { seq: number; label: string; alert: boolean }>>({});
  const [alerts, setAlerts] = useState<Record<string, number>>({});
  const [fx, setFx] = useState<{ slam: string[]; pop: string[] }>({ slam: [], pop: [] });
  const anchors = useRef(new Map<string, { x: number; y: number }>());

  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1100, h: 800 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const cols = box.w >= 760 ? 2 : 1;
  const metrics = rooms.map((r) => roomMetrics(r));
  const rowHeights: number[] = [];
  rooms.forEach((_, i) => {
    const row = Math.floor(i / cols);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, metrics[i].height);
  });
  const rowY: number[] = [];
  rowHeights.reduce((acc, h, i) => {
    rowY[i] = acc;
    return acc + h + GAP;
  }, GAP);
  const totalW = GAP + cols * (ROOM_W + GAP);
  const totalH = (rowY[rowY.length - 1] ?? GAP) + (rowHeights[rowHeights.length - 1] ?? 0) + GAP;
  // fit the whole floor in view; only scroll if the window is tiny
  const scale = Math.max(0.5, Math.min(1.5, box.w / totalW, box.h / totalH));

  // where things are, in floor coordinates, so envelopes know where to fly
  const next = new Map<string, { x: number; y: number }>();
  rooms.forEach((room, i) => {
    const m = metrics[i];
    const ox = GAP + (i % cols) * (ROOM_W + GAP);
    const oy = rowY[Math.floor(i / cols)];
    room.people.forEach((p, k) => {
      const d = deskPos(m, k);
      next.set(p.id, { x: ox + d.x + 54, y: oy + d.y + 34 });
    });
    room.services.forEach((sv, k) => {
      const d = rackPos(m, k);
      next.set(sv.id, { x: ox + d.x + 32, y: oy + d.y + 24 });
    });
    room.decisions.forEach((dc, k) => {
      const d = boardPos(m, room, k);
      next.set(dc.id, { x: ox + d.x + BOARD_W / 2, y: oy + d.y + BOARD_H / 2 });
    });
  });
  anchors.current = next;

  // a new ingested event: the actor reacts and an envelope flies to what the event is about
  useEffect(() => {
    if (!event || reduced.current) return undefined;
    const a = anchors.current;
    const actor = event.actor ? a.get(event.actor) : undefined;
    const svc = event.refs.service_ids?.find((id) => a.has(id));
    const targetId = svc ?? (event.refs.decision_id && a.has(event.refs.decision_id) ? event.refs.decision_id : undefined);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const isIncident = event.kind === "incident";
    if (event.actor && actor) {
      setActive((cur) => ({ ...cur, [event.actor as string]: { seq: event.seq, label: describeEvent(event), alert: isIncident } }));
      timers.push(
        setTimeout(() => {
          setActive((cur) => {
            if (cur[event.actor as string]?.seq !== event.seq) return cur;
            const { [event.actor as string]: _gone, ...rest } = cur;
            return rest;
          });
        }, 2400),
      );
    }
    if (actor && targetId) {
      const to = a.get(targetId) as { x: number; y: number };
      timers.push(
        setTimeout(() => {
          setEnvelopes((cur) => [...cur.slice(-5), { key: event.seq, from: { x: actor.x, y: actor.y - 22 }, to: { x: to.x, y: to.y - 8 }, color: KIND_COLOR[event.kind ?? ""] ?? C.cream }]);
        }, 260),
      );
    }
    if (isIncident && svc) {
      setAlerts((cur) => ({ ...cur, [svc]: event.seq }));
      timers.push(setTimeout(() => setAlerts((cur) => (cur[svc] === event.seq ? Object.fromEntries(Object.entries(cur).filter(([k]) => k !== svc)) : cur)), 3000));
    }
    return () => timers.forEach(clearTimeout);
  }, [event]);

  // an agent executes an MCP tool: speech bubble appears and envelope flies to touched graph nodes
  useEffect(() => {
    if (!latestStep || reduced.current) return undefined;
    const a = anchors.current;
    const agentId = `agent-${latestStep.agent.toLowerCase()}`;
    const agentPos = a.get(agentId);
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (agentPos) {
      setActive((cur) => ({
        ...cur,
        [agentId]: {
          seq: latestStep.step_n,
          label: `calling ${latestStep.tool}`,
          alert: false,
        },
      }));
      timers.push(
        setTimeout(() => {
          setActive((cur) => {
            if (cur[agentId]?.seq !== latestStep.step_n) return cur;
            const { [agentId]: _gone, ...rest } = cur;
            return rest;
          });
        }, 2800)
      );
    }

    if (agentPos && latestStep.touched_entity_ids && latestStep.touched_entity_ids.length > 0) {
      const targetId = latestStep.touched_entity_ids.find((id) => a.has(id));
      if (targetId) {
        const to = a.get(targetId)!;
        timers.push(
          setTimeout(() => {
            setEnvelopes((cur) => [
              ...cur.slice(-5),
              {
                key: Date.now() + Math.random(),
                from: { x: agentPos.x, y: agentPos.y - 20 },
                to: { x: to.x, y: to.y - 8 },
                color: C.sky,
              },
            ]);
          }, 200)
        );
      }
    }

    return () => timers.forEach(clearTimeout);
  }, [latestStep]);

  // task handoff between agents: flying envelope from sender to receiver
  useEffect(() => {
    if (!latestHandoff || reduced.current) return undefined;
    const a = anchors.current;
    const fromId = `agent-${latestHandoff.from_agent.toLowerCase()}`;
    const toId = `agent-${latestHandoff.to_agent.toLowerCase()}`;
    const fromPos = a.get(fromId);
    const toPos = a.get(toId);
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (fromPos && toPos) {
      setActive((cur) => ({
        ...cur,
        [fromId]: {
          seq: latestHandoff.step_n,
          label: `handoff to ${latestHandoff.to_agent}`,
          alert: false,
        },
      }));

      setEnvelopes((cur) => [
        ...cur.slice(-5),
        {
          key: Date.now() + Math.random(),
          from: { x: fromPos.x, y: fromPos.y - 20 },
          to: { x: toPos.x, y: toPos.y - 20 },
          color: C.lemon,
        },
      ]);

      timers.push(
        setTimeout(() => {
          setActive((cur) => ({
            ...cur,
            [toId]: {
              seq: latestHandoff.step_n + 1000,
              label: `claimed task!`,
              alert: false,
            },
          }));
        }, 1100)
      );

      timers.push(
        setTimeout(() => {
          setActive((cur) => {
            const copy = { ...cur };
            delete copy[fromId];
            delete copy[toId];
            return copy;
          });
        }, 3400)
      );
    }

    return () => timers.forEach(clearTimeout);
  }, [latestHandoff]);


  // boards that were just replaced get stamped, and new boards pop onto the wall
  const prevBoards = useRef<Map<string, boolean> | null>(null);
  useEffect(() => {
    const now = new Map<string, boolean>();
    rooms.forEach((r) => r.decisions.forEach((d) => now.set(d.id, str(d.properties?.status) === "superseded" || supersededBy.has(d.id))));
    const prev = prevBoards.current;
    prevBoards.current = now;
    if (!prev || prev.size === 0 || reduced.current) return undefined;
    const slam: string[] = [];
    const pop: string[] = [];
    now.forEach((dead, id) => {
      const was = prev.get(id);
      if (was === undefined) pop.push(id);
      else if (!was && dead) slam.push(id);
    });
    if (!slam.length && !pop.length) return undefined;
    setFx({ slam, pop });
    const t = setTimeout(() => setFx({ slam: [], pop: [] }), 2200);
    return () => clearTimeout(t);
  }, [rooms, supersededBy]);
  const dropEnvelope = useCallback((key: number) => setEnvelopes((cur) => cur.filter((e) => e.key !== key)), []);

  const open = (n: TopologyNode) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeClick(n);
  };
  const key = (n: TopologyNode) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onNodeClick(n);
    }
  };
  const hoverProps = (id: string) => ({
    onMouseEnter: () => setHover(id),
    onMouseLeave: () => setHover((h) => (h === id ? null : h)),
    onFocus: () => setHover(id),
    onBlur: () => setHover((h) => (h === id ? null : h)),
  });

  return (
    <div ref={wrapRef} className="absolute inset-0 nx-scroll" data-testid="office-floor" style={{ background: "#0a141c" }}>
      <style>{`
        .nx-hit { cursor: pointer; }
        .nx-hit:hover .nx-pick, .nx-hit:focus-visible .nx-pick { stroke: ${C.lemon}; stroke-width: 3; }
        .nx-hit:focus-visible { outline: none; }
        .nx-light { mix-blend-mode: screen; pointer-events: none; }
      `}</style>
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        width={totalW * scale}
        height={totalH * scale}
        role="group"
        aria-label="Office floor plan: teams are rooms, people sit at desks, services are server racks, decisions are boards on the wall"
        style={{ display: "block", margin: "0 auto" }}
      >
        <defs>
          {[...FLOORS, RECORDS_FLOOR, AGENT_FLOOR].map((f, i) => (
            <pattern key={i} id={`nx-floor-${i}`} width="48" height="48" patternUnits="userSpaceOnUse">
              <rect width="48" height="48" fill={f.base} />
              <path d="M48 0H0V48" fill="none" stroke={f.line} strokeWidth="2" />
            </pattern>
          ))}
        </defs>

        {rooms.map((room, i) => {
          const m = metrics[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = GAP + col * (ROOM_W + GAP);
          const y = rowY[row];
          const h = rowHeights[row];
          const isRecords = room.id === RECORDS_ID;
          const isAgentPod = room.id === AGENT_POD_ID;
          const floor = isAgentPod ? AGENT_FLOOR : isRecords ? RECORDS_FLOOR : FLOORS[i % FLOORS.length];
          const floorIdx = isAgentPod ? FLOORS.length + 1 : isRecords ? FLOORS.length : i % FLOORS.length;

          return (
            <g key={room.id} transform={`translate(${x}, ${y})`}>
              <rect x="-4" y="-4" width={ROOM_W + 8} height={h + 8} fill={C.ink} />
              <rect width={ROOM_W} height={h} fill={`url(#nx-floor-${floorIdx})`} />
              <rect width={ROOM_W} height={WALL_H} fill={isAgentPod ? "#132337" : C.wall} />
              <rect y={WALL_H - 4} width={ROOM_W} height="4" fill={C.ink} />
              <rect y={WALL_H} width={ROOM_W} height={h - WALL_H} fill={isAgentPod ? "#0284c7" : "#0a2a3a"} opacity={isAgentPod ? "0.15" : "0.1"} />

              <rect x="0" y="0" width="8" height={WALL_H - 4} fill={floor.accent} />
              <text x="24" y="27" className="nx-t-display" fontSize="11" fill={isAgentPod ? "#38bdf8" : C.cream}>
                {clip(room.name.toUpperCase(), 36)}
              </text>
              <text x={ROOM_W - 16} y="27" textAnchor="end" className="nx-t-ui" fontSize="14" fill={isAgentPod ? "#7dd3fc" : "#c4d2cf"}>
                {isAgentPod
                  ? "3 Autonomous Agents · FalkorDB Graph MCP"
                  : room.name.length > 26
                  ? `${room.people.length} people · ${room.services.length} services`
                  : `${room.people.length} people · ${room.services.length} services · ${room.decisions.length} decisions`}
              </text>


              {/* decision boards on the back wall */}
              {room.decisions.map((d, k) => {
                const { x: bx, y: by } = boardPos(m, room, k);
                const slam = fx.slam.includes(d.id);
                const pop = fx.pop.includes(d.id);
                const dead = str(d.properties?.status) === "superseded" || supersededBy.has(d.id);
                const successor = supersededBy.get(d.id) || str(d.properties?.superseded_by);
                const summary = str(d.properties?.summary).replace(/^[A-Z]+-\d+:\s*/, "").replace(/^Deploying DEC-\d+:\s*/, "");
                const body = wrap(summary || d.name, 16, 2);
                return (
                  <g
                    key={d.id}
                    transform={`translate(${bx}, ${by})`}
                    className="nx-hit"
                    role="button"
                    tabIndex={0}
                    aria-label={`Decision ${d.id}${dead ? ", superseded" : ", active"}. ${summary}`}
                    opacity={dim(d.id)}
                    onClick={open(d)}
                    onKeyDown={key(d)}
                    data-testid={`board-${d.id}`}
                  >
                    <g className={slam ? "nx-slam" : pop ? "nx-pop" : undefined} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
                    <title>{`${d.id}: ${summary}`}</title>
                    <rect x="3" y="4" width={BOARD_W} height={BOARD_H} fill={C.ink} opacity="0.3" />
                    <rect className="nx-pick" width={BOARD_W} height={BOARD_H} fill={dead ? C.paperOld : C.paper} stroke={C.ink} strokeWidth="2" />
                    <circle cx={BOARD_W / 2} cy="0" r="4" fill={dead ? "#6f6a58" : C.coral} stroke={C.ink} strokeWidth="2" />
                    <text x="10" y="22" className="nx-t-ui" fontSize="15" fontWeight="700" fill={dead ? "#6f6a58" : C.ink}>
                      {d.id}
                    </text>
                    {body.map((line, li) => (
                      <text key={li} x="10" y={42 + li * 16} className="nx-t-ui" fontSize="13" fill={dead ? "#6f6a58" : "#2a2230"}>
                        {line}
                      </text>
                    ))}
                    {dead ? (
                      <>
                        <rect x="6" y="15" width={BOARD_W - 12} height="2" fill={C.coral} />
                        <text x="10" y={BOARD_H - 9} className="nx-t-ui" fontSize="12" fontWeight="700" fill="#b23a3a">
                          {successor ? `Now ${successor}` : "Replaced"}
                        </text>
                      </>
                    ) : (
                      <>
                        <rect x="10" y={BOARD_H - 20} width="38" height="14" fill="#1f8a5a" />
                        <text x="29" y={BOARD_H - 9} textAnchor="middle" className="nx-t-ui" fontSize="11" fontWeight="700" fill="#fff">
                          LIVE
                        </text>
                      </>
                    )}
                    {hl.has(d.id) && (
                      <rect className="nx-ring" x="-5" y="-5" width={BOARD_W + 10} height={BOARD_H + 10} fill="none" stroke={C.lemon} strokeWidth="3" />
                    )}
                    </g>
                    {pop && !dead && <Confetti colors={[floor.accent, C.lemon, C.cream, C.sky]} />}
                  </g>
                );
              })}

              {/* server racks */}
              {room.services.map((s, k) => {
                const { x: rx, y: ry } = rackPos(m, k);
                const down = incidents.has(s.id);
                const pulsing = alerts[s.id] !== undefined;
                return (
                  <g
                    key={s.id}
                    transform={`translate(${rx}, ${ry})`}
                    className="nx-hit"
                    role="button"
                    tabIndex={0}
                    aria-label={`Service ${s.name}, tier ${str(s.properties?.tier) || "unknown"}${down ? ", has an incident" : ""}`}
                    opacity={dim(s.id)}
                    onClick={open(s)}
                    onKeyDown={key(s)}
                    data-testid={`rack-${s.id}`}
                  >
                    <title>{`${s.name} · tier ${str(s.properties?.tier) || "-"}${down ? " · incident open" : ""}`}</title>
                    <circle className="nx-light" cx="32" cy="28" r="50" fill={down ? C.coral : C.sky} opacity="0.14" />
                    {pulsing &&
                      [0, 0.3, 0.6].map((d) => (
                        <circle key={d} className="nx-ringout" cx="32" cy="28" r="10" fill="none" stroke={C.coral} strokeWidth="3" style={{ animationDelay: `${d}s` }} />
                      ))}
                    <rect className="nx-pick" width="64" height="54" fill={C.rack} stroke={C.ink} strokeWidth="3" />
                    {[0, 1, 2].map((r) => (
                      <g key={r}>
                        <rect x="5" y={5 + r * 15} width="54" height="11" fill={C.rackDark} />
                        <rect
                          className={r === 0 && down ? "nx-blink" : undefined}
                          x="9"
                          y={8 + r * 15}
                          width="5"
                          height="5"
                          fill={r === 0 && down ? C.coral : C.mint}
                        />
                        <rect x="20" y={9 + r * 15} width="30" height="3" fill="#4f6270" />
                      </g>
                    ))}
                    {down && (
                      <g transform="translate(50,-12)">
                        <rect width="20" height="18" fill={C.coral} stroke={C.ink} strokeWidth="2" />
                        <text x="10" y="14" textAnchor="middle" className="nx-t-ui" fontSize="13" fontWeight="700" fill={C.ink}>
                          !
                        </text>
                      </g>
                    )}
                    <text x="32" y="74" textAnchor="middle" className="nx-t-ui" fontSize="12" fontWeight="700" fill={C.ink}>
                      {clip(s.name, 14)}
                    </text>
                    {hl.has(s.id) && (
                      <rect className="nx-ring" x="-5" y="-5" width="74" height="64" fill="none" stroke={C.lemon} strokeWidth="3" />
                    )}
                  </g>
                );
              })}

              {/* people at desks */}
              {room.people.map((p, k) => {
                const { x: dx, y: dy } = deskPos(m, k);
                const act = active[p.id];
                const doorX = ROOM_W / 2 - dx - 39;
                const doorY = h - dy - 6 + 8;
                const walk = Math.min(2.8, Math.max(1.1, Math.hypot(doorX, doorY) / 170));
                const delay = i * 0.25 + k * 0.16;
                const fullName = str(p.properties?.name) || p.name;
                const role = str(p.properties?.role);
                const note = personNote.get(p.id);
                const lit = hl.has(p.id);
                const hovered = hover === p.id;
                let bubble: { lines: string[]; fill: string } | null = null;
                if (act) bubble = { lines: wrap(act.label, 16, 2), fill: act.alert ? "#ffc9c4" : "#a9ddf5" };
                else if (hovered && note) bubble = { lines: [note.verb, clip(note.target, 18)], fill: note.kind === "own" ? "#a9ddf5" : "#b6f0cf" };
                return (
                  <g
                    key={p.id}
                    transform={`translate(${dx}, ${dy})`}
                    className="nx-hit"
                    role="button"
                    tabIndex={0}
                    aria-label={`Person ${fullName}${role ? `, ${role}` : ""}`}
                    opacity={dim(p.id)}
                    onClick={open(p)}
                    onKeyDown={key(p)}
                    data-testid={`desk-${p.id}`}
                    {...hoverProps(p.id)}
                  >
                    <title>{`${fullName}${role ? ` · ${role}` : ""}`}</title>
                    <circle className="nx-light" cx="54" cy="56" r="48" fill={C.sky} opacity="0.1" />
                    {act && <circle key={`glow-${act.seq}`} className="nx-glow" cx="54" cy="52" r="46" fill={floor.accent} />}
                    <rect x="38" y="20" width="32" height="12" fill="#26323c" stroke={C.ink} strokeWidth="2" />
                    <g transform="translate(39, 6)" className={lit ? "nx-bob" : undefined}>
                      <g className="nx-enter" style={{ ["--fx" as string]: `${doorX}px`, ["--fy" as string]: `${doorY}px`, ["--dur" as string]: `${walk}s`, ["--delay" as string]: `${delay}s` }}>
                        <g className="nx-stride" style={{ ["--bobs" as string]: Math.round(walk / 0.34), ["--delay" as string]: `${delay}s` }}>
                          <g key={act ? `hop-${act.seq}` : "rest"} className={act ? "nx-hop" : undefined}>
                            {p.properties?.is_agent ? (
                              <RobotSprite seed={p.id} accent={floor.accent} />
                            ) : (
                              <Sprite seed={p.id} shirt={floor.accent} />
                            )}
                          </g>
                        </g>
                      </g>
                    </g>
                    <g shapeRendering="crispEdges">
                      <rect x="2" y="38" width="104" height="38" fill={C.ink} />
                      <rect className="nx-pick" x="4" y="40" width="100" height="34" fill={p.properties?.is_agent ? "#1e293b" : C.desk} />
                      <rect x="4" y="40" width="100" height="6" fill={p.properties?.is_agent ? "#334155" : C.deskTop} />
                      <rect x="40" y="42" width="28" height="20" fill={C.ink} />
                      <rect x="42" y="44" width="24" height="14" fill={p.properties?.is_agent ? "#032830" : C.screen} />
                      <svg x="42" y="44" width="24" height="14" overflow="hidden">
                        <g className="nx-scr" style={{ animationDelay: `-${(hash(p.id) % 24) / 10}s` }}>
                          {[2, 6, 10, 16, 20, 24].map((yy, n) => (
                            <rect
                              key={yy}
                              x="3"
                              y={yy}
                              width={8 + ((hash(p.id) + n * 5) % 4) * 3}
                              height="2"
                              fill={p.properties?.is_agent ? (n % 2 ? "#38bdf8" : "#4ade80") : (n % 2 ? C.sky : C.mint)}
                            />
                          ))}
                        </g>
                        <rect className="nx-cursor" x="3" y="10" width="3" height="2" fill={p.properties?.is_agent ? "#38bdf8" : "#fff"} />
                      </svg>
                      <rect x="42" y="66" width="24" height="5" fill={p.properties?.is_agent ? "#0284c7" : "#d8cfae"} />
                    </g>
                    <rect
                      x="4"
                      y="82"
                      width="100"
                      height="22"
                      fill={p.properties?.is_agent ? "#0b1928" : C.cream}
                      stroke={p.properties?.is_agent ? "#38bdf8" : C.ink}
                      strokeWidth="2"
                    />
                    <text
                      x="54"
                      y="98"
                      textAnchor="middle"
                      className="nx-t-ui"
                      fontSize="14"
                      fontWeight="700"
                      fill={p.properties?.is_agent ? "#38bdf8" : C.ink}
                    >
                      {clip(fullName, 13)}
                    </text>

                    {bubble && (
                      <g key={act ? `b-${act.seq}` : "b"} className={act ? "nx-bubble-life" : undefined}>
                        <Bubble cx={54} bottom={2} lines={bubble.lines} fill={bubble.fill} />
                      </g>
                    )}
                    {act?.alert && (
                      <g className="nx-alert" pointerEvents="none">
                        <rect x="96" y="-2" width="18" height="18" fill={C.coral} stroke={C.ink} strokeWidth="2" />
                        <text x="105" y="12" textAnchor="middle" className="nx-t-ui" fontSize="13" fontWeight="700" fill={C.ink}>!</text>
                      </g>
                    )}
                    {lit && <rect className="nx-ring" x="-2" y="-4" width="112" height="112" fill="none" stroke={C.lemon} strokeWidth="3" />}
                  </g>
                );
              })}
            </g>
          );
        })}
        {envelopes.map((e) => (
          <Envelope key={e.key} from={e.from} to={e.to} color={e.color} onDone={() => dropEnvelope(e.key)} />
        ))}
      </svg>
    </div>
  );
}
