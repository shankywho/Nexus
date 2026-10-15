"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { TopologyNode } from "@/lib/nexus/api";
import { buildRooms, RECORDS_ID, str, type Room } from "@/lib/nexus/office";
import { FLOORS, RECORDS_FLOOR } from "@/lib/nexus/theme";

interface OfficeFloorProps {
  data: Parameters<typeof buildRooms>[0];
  highlightIds: string[];
  onNodeClick: (node: TopologyNode) => void;
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

export function OfficeFloor({ data, highlightIds, onNodeClick }: OfficeFloorProps) {
  const { rooms, supersededBy, incidents, personNote } = useMemo(() => buildRooms(data), [data]);
  const hl = useMemo(() => new Set(highlightIds), [highlightIds]);
  const [hover, setHover] = useState<string | null>(null);
  const dim = (id: string) => (hl.size > 0 && !hl.has(id) ? 0.38 : 1);

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
          {[...FLOORS, RECORDS_FLOOR].map((f, i) => (
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
          const floor = isRecords ? RECORDS_FLOOR : FLOORS[i % FLOORS.length];
          const floorIdx = isRecords ? FLOORS.length : i % FLOORS.length;
          const deskTop = WALL_H + m.topH;

          return (
            <g key={room.id} transform={`translate(${x}, ${y})`}>
              <rect x="-4" y="-4" width={ROOM_W + 8} height={h + 8} fill={C.ink} />
              <rect width={ROOM_W} height={h} fill={`url(#nx-floor-${floorIdx})`} />
              <rect width={ROOM_W} height={WALL_H} fill={C.wall} />
              <rect y={WALL_H - 4} width={ROOM_W} height="4" fill={C.ink} />
              <rect y={WALL_H} width={ROOM_W} height={h - WALL_H} fill="#0a2a3a" opacity="0.1" />

              <rect x="0" y="0" width="8" height={WALL_H - 4} fill={floor.accent} />
              <text x="24" y="27" className="nx-t-display" fontSize="11" fill={C.cream}>
                {clip(room.name.toUpperCase(), 30)}
              </text>
              <text x={ROOM_W - 16} y="27" textAnchor="end" className="nx-t-ui" fontSize="14" fill="#c4d2cf">
                {room.name.length > 26
                  ? `${room.people.length} people · ${room.services.length} services`
                  : `${room.people.length} people · ${room.services.length} services · ${room.decisions.length} decisions`}
              </text>

              {/* decision boards on the back wall */}
              {room.decisions.map((d, k) => {
                const bx = m.sideBySide ? ROOM_W - PAD - (room.decisions.length - k) * BOARD_SLOT + 12 : PAD + (k % m.boardCols) * BOARD_SLOT;
                const by = WALL_H + 14 + (m.sideBySide ? 0 : Math.floor(k / m.boardCols) * (BOARD_H + 14));
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
                );
              })}

              {/* server racks */}
              {room.services.map((s, k) => {
                const rx = PAD + (k % m.rackCols) * RACK_SLOT + 12;
                const ry = WALL_H + (m.sideBySide ? 0 : m.boardsH) + 8 + Math.floor(k / m.rackCols) * RACK_ROW_H;
                const down = incidents.has(s.id);
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
                const dx = PAD + (k % m.deskCols) * DESK_SLOT + 10;
                const dy = deskTop + 14 + Math.floor(k / m.deskCols) * DESK_ROW_H;
                const fullName = str(p.properties?.name) || p.name;
                const role = str(p.properties?.role);
                const note = personNote.get(p.id);
                const lit = hl.has(p.id);
                const hovered = hover === p.id;
                let bubble: { lines: string[]; fill: string } | null = null;
                if (hovered && note) bubble = { lines: [note.verb, clip(note.target, 18)], fill: note.kind === "own" ? "#a9ddf5" : "#b6f0cf" };
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
                    <rect x="38" y="20" width="32" height="12" fill="#26323c" stroke={C.ink} strokeWidth="2" />
                    <g transform="translate(39, 6)" className={lit ? "nx-bob" : undefined}>
                      <Sprite seed={p.id} shirt={floor.accent} />
                    </g>
                    <g shapeRendering="crispEdges">
                      <rect x="2" y="38" width="104" height="38" fill={C.ink} />
                      <rect className="nx-pick" x="4" y="40" width="100" height="34" fill={C.desk} />
                      <rect x="4" y="40" width="100" height="6" fill={C.deskTop} />
                      <rect x="40" y="42" width="28" height="20" fill={C.ink} />
                      <rect x="42" y="44" width="24" height="14" fill={C.screen} />
                      <rect x="45" y="47" width="12" height="2" fill={C.mint} />
                      <rect x="45" y="51" width="17" height="2" fill={C.sky} />
                      <rect x="42" y="66" width="24" height="5" fill="#d8cfae" />
                    </g>
                    <rect x="4" y="82" width="100" height="22" fill={C.cream} stroke={C.ink} strokeWidth="2" />
                    <text x="54" y="98" textAnchor="middle" className="nx-t-ui" fontSize="14" fontWeight="700" fill={C.ink}>
                      {clip(fullName, 13)}
                    </text>
                    {bubble && <Bubble cx={54} bottom={2} lines={bubble.lines} fill={bubble.fill} />}
                    {lit && <rect className="nx-ring" x="-2" y="-4" width="112" height="112" fill="none" stroke={C.lemon} strokeWidth="3" />}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
