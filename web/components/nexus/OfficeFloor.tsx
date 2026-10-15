"use client";

import React, { useMemo } from "react";
import type { TopologyNode } from "@/lib/nexus/api";
import { buildRooms, RECORDS_ID, str, type Room } from "@/lib/nexus/office";

interface OfficeFloorProps {
  data: Parameters<typeof buildRooms>[0];
  highlightIds: string[];
  onNodeClick: (node: TopologyNode) => void;
}


const ROOM_W = 560;
const GAP = 24;
const PAD = 20;
const WALL_H = 36;
const BOARD_W = 128;
const BOARD_H = 88;
const BOARD_SLOT = BOARD_W + 12;
const RACK_SLOT = 104;
const RACK_ROW_H = 96;
const DESK_SLOT = 124;
const DESK_ROW_H = 150;

// Palette (see app/nexus/nexus.css). Kept literal: SVG fills are pixel-exact.
const C = {
  ink: "#070c10",
  cream: "#f6ebcb",
  paper: "#f1e6c3",
  paperOld: "#b9b39c",
  woodA: "#d9b97c",
  woodB: "#cba96a",
  wall: "#5c4630",
  wallLine: "#4a3826",
  desk: "#8a5a3b",
  deskTop: "#a56f48",
  rack: "#3b4a57",
  rackDark: "#26323c",
  screen: "#0e4b55",
  mint: "#6be3a5",
  sky: "#5cc8f0",
  blue: "#6c8ef5",
  lemon: "#ffd166",
  coral: "#ff6b6b",
};

const TEAM_COLORS = ["#6be3a5", "#5cc8f0", "#ffd166", "#b197fc", "#ffa07a", "#6c8ef5"];
const SKIN = ["#f2c9a0", "#d9a577", "#b87d52", "#8a5a3b"];
const HAIR = ["#2a1b14", "#5a3a22", "#c9a24a", "#9a4a2a", "#1b1f2a"];

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

function roomMetrics(room: Room) {
  const inner = ROOM_W - PAD * 2;
  const boardCols = Math.max(1, Math.floor(inner / BOARD_SLOT));
  const rackCols = Math.max(1, Math.floor(inner / RACK_SLOT));
  const deskCols = Math.max(1, Math.floor(inner / DESK_SLOT));
  const boardsH = room.decisions.length ? Math.ceil(room.decisions.length / boardCols) * (BOARD_H + 14) + 10 : 0;
  const racksH = room.services.length ? Math.ceil(room.services.length / rackCols) * RACK_ROW_H + 6 : 0;
  const desksH = room.people.length ? Math.ceil(room.people.length / deskCols) * DESK_ROW_H + 26 : 0;
  return { boardCols, rackCols, deskCols, boardsH, racksH, desksH, height: WALL_H + boardsH + racksH + desksH + PAD };
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

function Bubble({ x, y, w, lines, fill }: { x: number; y: number; w: number; lines: string[]; fill: string }) {
  const h = lines.length * 14 + 10;
  return (
    <g transform={`translate(${x}, ${y - h - 6})`} shapeRendering="crispEdges">
      <rect x="0" y="2" width={w} height={h - 4} fill={C.ink} />
      <rect x="2" y="0" width={w - 4} height={h} fill={C.ink} />
      <rect x="2" y="4" width={w - 4} height={h - 8} fill={fill} />
      <rect x="4" y="2" width={w - 8} height={h - 4} fill={fill} />
      <rect x={w / 2 - 4} y={h} width="8" height="2" fill={C.ink} />
      <rect x={w / 2 - 2} y={h + 2} width="4" height="2" fill={C.ink} />
      <rect x={w / 2 - 2} y={h - 2} width="4" height="4" fill={fill} />
      {lines.map((line, i) => (
        <text key={line + i} x={w / 2} y={15 + i * 14} textAnchor="middle" className="nx-t-mono" fontSize="15" fill={C.ink}>
          {line}
        </text>
      ))}
    </g>
  );
}

function wrap(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  words.forEach((w) => {
    if ((cur + " " + w).trim().length > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  });
  if (cur) lines.push(cur);
  return lines.slice(0, 2).map((l) => clip(l, width));
}

export function OfficeFloor({ data, highlightIds, onNodeClick }: OfficeFloorProps) {
  const { rooms, supersededBy, incidents, personNote } = useMemo(() => buildRooms(data), [data]);
  const hl = useMemo(() => new Set(highlightIds), [highlightIds]);

  const cols = 2;
  const metrics = rooms.map(roomMetrics);
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

  return (
    <div className="absolute inset-0" data-testid="office-floor" style={{ background: "#08121a" }}>
      <style>{`
        .nx-hit { cursor: pointer; }
        .nx-hit:hover .nx-pick, .nx-hit:focus-visible .nx-pick { stroke: ${C.lemon}; stroke-width: 3; }
        .nx-hit:focus-visible { outline: none; }
        .nx-light { mix-blend-mode: screen; pointer-events: none; }
      `}</style>
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Office floor plan: teams are rooms, people sit at desks, services are server racks, decisions are boards on the wall"
        style={{ display: "block" }}
      >
        <defs>
          <pattern id="nx-wood" width="32" height="32" patternUnits="userSpaceOnUse">
            <rect width="32" height="32" fill={C.woodA} />
            <rect width="16" height="16" fill={C.woodB} />
            <rect x="16" y="16" width="16" height="16" fill={C.woodB} />
          </pattern>
          <pattern id="nx-planks" width="16" height="12" patternUnits="userSpaceOnUse">
            <rect width="16" height="12" fill={C.wall} />
            <rect y="11" width="16" height="1" fill={C.wallLine} />
            <rect x="8" width="1" height="12" fill={C.wallLine} />
          </pattern>
        </defs>

        {rooms.map((room, i) => {
          const m = metrics[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = GAP + col * (ROOM_W + GAP);
          const y = rowY[row];
          const h = rowHeights[row];
          const accent = room.id === RECORDS_ID ? C.lemon : TEAM_COLORS[i % TEAM_COLORS.length];
          const clipId = `nx-clip-${i}`;

          return (
            <g key={room.id} transform={`translate(${x}, ${y})`}>
              <clipPath id={clipId}>
                <rect width={ROOM_W} height={h} />
              </clipPath>
              <rect x="-4" y="-4" width={ROOM_W + 8} height={h + 8} fill={C.ink} />
              <g clipPath={`url(#${clipId})`}>
                <rect width={ROOM_W} height={h} fill="url(#nx-wood)" />
                <rect width={ROOM_W} height={WALL_H} fill="url(#nx-planks)" />
                <rect y={WALL_H} width={ROOM_W} height="4" fill={C.ink} />
                {/* night-shift tint over the floor, cool light pools added below */}
                <rect y={WALL_H + 4} width={ROOM_W} height={h - WALL_H - 4} fill="#0a2a3a" opacity="0.28" />
              </g>

              {/* team rug under the desks, plant in the corner */}
              {room.people.length > 0 && (
                <g shapeRendering="crispEdges">
                  <rect x={PAD - 8} y={WALL_H + m.boardsH + m.racksH + 28} width={ROOM_W - PAD * 2 + 16} height={m.desksH - 20} fill={accent} opacity="0.2" />
                  <rect x={PAD - 4} y={WALL_H + m.boardsH + m.racksH + 32} width={ROOM_W - PAD * 2 + 8} height={m.desksH - 28} fill="none" stroke={accent} strokeWidth="2" opacity="0.5" />
                </g>
              )}
              <g transform={`translate(${ROOM_W - 40}, ${h - 52})`} shapeRendering="crispEdges">
                <rect x="6" y="30" width="20" height="16" fill="#9a5a34" stroke={C.ink} strokeWidth="2" />
                <rect x="12" y="8" width="8" height="22" fill="#2f8f4e" />
                <rect x="2" y="12" width="10" height="8" fill="#3fae63" />
                <rect x="20" y="10" width="10" height="8" fill="#3fae63" />
                <rect x="6" y="2" width="8" height="8" fill="#3fae63" />
                <rect x="18" y="0" width="8" height="8" fill="#2f8f4e" />
              </g>

              {/* room sign */}
              <rect x="10" y="6" width={Math.min(ROOM_W - 150, room.name.length * 11 + 32)} height="24" fill={C.ink} />
              <rect x="10" y="6" width="8" height="24" fill={accent} />
              <text x="26" y="23" className="nx-t-display" fontSize="9" fill={C.cream}>
                {clip(room.name.toUpperCase(), 28)}
              </text>
              <text x={ROOM_W - 12} y="24" textAnchor="end" className="nx-t-mono" fontSize="17" fill={C.cream}>
                {room.people.length} people · {room.services.length} services · {room.decisions.length} decisions
              </text>

              {/* decision boards on the back wall */}
              {room.decisions.map((d, k) => {
                const bx = PAD + (k % m.boardCols) * BOARD_SLOT;
                const by = WALL_H + 14 + Math.floor(k / m.boardCols) * (BOARD_H + 14);
                const dead = str(d.properties?.status) === "superseded" || supersededBy.has(d.id);
                const successor = supersededBy.get(d.id) || str(d.properties?.superseded_by);
                const summary = str(d.properties?.summary).replace(/^[A-Z]+-\d+:\s*/, "").replace(/^Deploying DEC-\d+:\s*/, "");
                const bodyLines = wrap(summary || d.name, 19);
                return (
                  <g
                    key={d.id}
                    transform={`translate(${bx}, ${by})`}
                    className="nx-hit"
                    role="button"
                    tabIndex={0}
                    aria-label={`Decision ${d.id}${dead ? ", superseded" : ", active"}`}
                    onClick={open(d)}
                    onKeyDown={key(d)}
                    data-testid={`board-${d.id}`}
                  >
                    <rect x="3" y="4" width={BOARD_W} height={BOARD_H} fill={C.ink} opacity="0.35" />
                    <rect className="nx-pick" width={BOARD_W} height={BOARD_H} fill={dead ? C.paperOld : C.paper} stroke={C.ink} strokeWidth="2" />
                    <rect x="55" y="-3" width="18" height="8" fill={dead ? "#8b8670" : C.cream} stroke={C.ink} strokeWidth="2" />
                    <text x="8" y="20" className="nx-t-display" fontSize="8" fill={dead ? "#6f6a58" : C.ink}>
                      {d.id}
                    </text>
                    {bodyLines.map((line, li) => (
                      <text key={li} x="8" y={36 + li * 14} className="nx-t-mono" fontSize="16" fill={dead ? "#6f6a58" : "#2a2230"}>
                        {line}
                      </text>
                    ))}
                    {dead ? (
                      <>
                        <rect x="6" y="31" width={BOARD_W - 12} height="2" fill={C.coral} />
                        <g transform={`translate(${BOARD_W - 80}, ${BOARD_H - 34}) rotate(-8)`}>
                          <rect width="72" height="20" fill="none" stroke={C.coral} strokeWidth="2" />
                          <text x="36" y="14" textAnchor="middle" className="nx-t-display" fontSize="7" fill={C.coral}>
                            REPLACED
                          </text>
                        </g>
                        {successor && (
                          <text x="8" y={BOARD_H - 7} className="nx-t-mono" fontSize="16" fill="#6f6a58">
                            now {successor}
                          </text>
                        )}
                      </>
                    ) : (
                      <>
                        <rect x="8" y={BOARD_H - 22} width="46" height="14" fill="#1f8a5a" />
                        <text x="31" y={BOARD_H - 12} textAnchor="middle" className="nx-t-display" fontSize="7" fill={C.cream}>
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
                const rx = PAD + (k % m.rackCols) * RACK_SLOT + 8;
                const ry = WALL_H + m.boardsH + 10 + Math.floor(k / m.rackCols) * RACK_ROW_H;
                const down = incidents.has(s.id);
                return (
                  <g
                    key={s.id}
                    transform={`translate(${rx}, ${ry})`}
                    className="nx-hit"
                    role="button"
                    tabIndex={0}
                    aria-label={`Service ${s.name}${down ? ", has an incident" : ""}`}
                    onClick={open(s)}
                    onKeyDown={key(s)}
                    data-testid={`rack-${s.id}`}
                  >
                    <circle className="nx-light" cx="30" cy="26" r="46" fill={down ? C.coral : C.sky} opacity="0.16" />
                    <circle className="nx-light" cx="30" cy="26" r="30" fill={down ? C.coral : C.sky} opacity="0.12" />
                    <rect className="nx-pick" width="60" height="52" fill={C.rack} stroke={C.ink} strokeWidth="3" />
                    {[0, 1, 2].map((r) => (
                      <g key={r}>
                        <rect x="5" y={5 + r * 15} width="50" height="11" fill={C.rackDark} />
                        <rect
                          className={r === 0 && down ? "nx-blink" : undefined}
                          x="9"
                          y={8 + r * 15}
                          width="5"
                          height="5"
                          fill={r === 0 && down ? C.coral : C.mint}
                        />
                        <rect x="20" y={9 + r * 15} width="28" height="3" fill="#4f6270" />
                      </g>
                    ))}
                    <rect x="0" y="52" width="60" height="4" fill={C.ink} opacity="0.35" />
                    {down && (
                      <g transform="translate(46,-14)">
                        <rect width="20" height="18" fill={C.coral} stroke={C.ink} strokeWidth="2" />
                        <text x="10" y="14" textAnchor="middle" className="nx-t-display" fontSize="9" fill={C.ink}>
                          !
                        </text>
                      </g>
                    )}
                    <text x="30" y="72" textAnchor="middle" className="nx-t-ui" fontSize="13" fill={C.ink}>
                      {clip(s.name, 13)}
                    </text>
                    <text x="30" y="86" textAnchor="middle" className="nx-t-mono" fontSize="16" fill="#3d3326">
                      tier {str(s.properties?.tier) || "-"}
                    </text>
                    {hl.has(s.id) && (
                      <rect className="nx-ring" x="-5" y="-5" width="70" height="62" fill="none" stroke={C.lemon} strokeWidth="3" />
                    )}
                  </g>
                );
              })}

              {/* people at desks */}
              {room.people.map((p, k) => {
                const dx = PAD + (k % m.deskCols) * DESK_SLOT + 12;
                const dy = WALL_H + m.boardsH + m.racksH + 36 + Math.floor(k / m.deskCols) * DESK_ROW_H;
                const fullName = str(p.properties?.name) || p.name;
                const role = str(p.properties?.role);
                const note = personNote.get(p.id);
                const lit = hl.has(p.id);
                const shirt = accent;
                return (
                  <g
                    key={p.id}
                    transform={`translate(${dx}, ${dy})`}
                    className="nx-hit"
                    role="button"
                    tabIndex={0}
                    aria-label={`Person ${fullName}${role ? `, ${role}` : ""}`}
                    onClick={open(p)}
                    onKeyDown={key(p)}
                    data-testid={`desk-${p.id}`}
                  >
                    {/* monitor light pool */}
                    <circle className="nx-light" cx="54" cy="60" r="52" fill={C.sky} opacity="0.09" />
                    <circle className="nx-light" cx="54" cy="60" r="34" fill={C.sky} opacity="0.1" />

                    {note && (
                      <Bubble
                        x={54 - 52}
                        y={14}
                        w={104}
                        lines={[note.verb, clip(note.target, 17)]}
                        fill={note.kind === "own" ? "#a9ddf5" : "#b6f0cf"}
                      />
                    )}

                    {/* chair behind, person, desk in front */}
                    <rect x="38" y="24" width="32" height="12" fill="#26323c" stroke={C.ink} strokeWidth="2" />
                    <g transform="translate(39, 10)" className={lit ? "nx-bob" : undefined}>
                      <Sprite seed={p.id} shirt={shirt} />
                    </g>
                    <g shapeRendering="crispEdges">
                      <rect x="2" y="42" width="104" height="38" fill={C.ink} />
                      <rect className="nx-pick" x="4" y="44" width="100" height="34" fill={C.desk} />
                      <rect x="4" y="44" width="100" height="6" fill={C.deskTop} />
                      <rect x="40" y="46" width="28" height="20" fill={C.ink} />
                      <rect x="42" y="48" width="24" height="14" fill={C.screen} />
                      <rect x="45" y="51" width="12" height="2" fill={C.mint} />
                      <rect x="45" y="55" width="17" height="2" fill={C.sky} />
                      <rect x="52" y="66" width="4" height="4" fill={C.ink} />
                      <rect x="42" y="70" width="24" height="5" fill="#d8cfae" />
                      <rect x="82" y="50" width="12" height="9" fill="#d8cfae" stroke={C.ink} strokeWidth="1" />
                    </g>

                    {/* nameplate */}
                    <rect x="8" y="86" width="92" height="16" fill={C.cream} stroke={C.ink} strokeWidth="2" />
                    <text x="54" y="98" textAnchor="middle" className="nx-t-ui" fontSize="13" fill={C.ink}>
                      {clip(fullName, 14)}
                    </text>
                    {role && (
                      <text x="54" y="115" textAnchor="middle" className="nx-t-mono" fontSize="16" fill={C.ink}>
                        {clip(role.replace(/^(Senior|Staff|Principal|Lead)\s+/i, ""), 20)}
                      </text>
                    )}
                    {lit && (
                      <rect className="nx-ring" x="-2" y="-4" width="112" height="108" fill="none" stroke={C.lemon} strokeWidth="3" />
                    )}
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
