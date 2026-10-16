"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import type { TopologyNode, AgentStepTrace } from "@/lib/nexus/api";
import { buildRooms, AGENT_POD_ID, str, type Room } from "@/lib/nexus/office";
import { SPRITE_SKIN, SPRITE_HAIR } from "@/lib/nexus/tokens";
import { describeEvent, type IngestEvent } from "@/lib/nexus/events";
import type { TaskHandoffEvent } from "@/lib/nexus/useAgentStream";

interface OfficeFloorProps {
  data: Parameters<typeof buildRooms>[0];
  highlightIds: string[];
  onNodeClick: (node: TopologyNode) => void;
  event?: IngestEvent | null;
  latestStep?: AgentStepTrace | null;
  latestHandoff?: TaskHandoffEvent | null;
  activeAgent?: string | null;
}

const SHORT_NAMES: Record<string, string> = {
  "Core Banking Ledger": "LEDGER",
  "Payouts Engine": "PAYOUTS",
  "Fraud & Risk Scorer": "FRAUD",
  "Session Store": "SESSIONS",
  "Auth Gateway": "AUTH",
  "Notification Dispatcher": "NOTIFY",
  "Web Checkout Frontend": "CHECKOUT",
  "Telemetry & Metrics": "TELEMETRY",
  "MCP Runtime": "MCP",
  "Memory Engine": "MEMORY",
};

export function getServiceShortName(name: string): string {
  if (SHORT_NAMES[name]) return SHORT_NAMES[name];
  for (const [k, v] of Object.entries(SHORT_NAMES)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  const words = name.replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  return words[0]?.toUpperCase().slice(0, 9) || "SERVICE";
}

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

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

function getEnvelopeColor(kind?: string | null): string {
  switch (kind) {
    case "incident":
      return "var(--nx-bad)";
    case "linear_ticket":
      return "var(--nx-warn)";
    case "github_pr":
      return "var(--nx-ok)";
    case "slack_message":
      return "var(--nx-info)";
    case "adr":
      return "var(--nx-note)";
    case "notion_doc":
      return "var(--room-platform)";
    default:
      return "var(--nx-note)";
  }
}

/** Pixel speech bubble for live events and hover details */
function PixelBubble({
  lines,
  isAlert = false,
  isLive = false,
}: {
  lines: string[];
  isAlert?: boolean;
  isLive?: boolean;
}) {
  return (
    <div
      className={`absolute z-30 pointer-events-none flex flex-col items-center ${isLive ? "nx-bubble-life" : ""}`}
      style={{
        bottom: "calc(100% + 2px)",
        left: "50%",
        transform: "translateX(-50%)",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))",
      }}
    >
      <div
        className="nx-mono text-[9px] font-bold leading-tight px-1.5 py-1 whitespace-pre text-center"
        style={{
          background: isAlert ? "var(--nx-bad)" : "var(--nx-note)",
          color: "var(--nx-ink)",
          border: "1px solid var(--nx-ink)",
          maxWidth: 130,
        }}
      >
        {lines.map((l, i) => (
          <div key={i} className="truncate max-w-[120px]">
            {l}
          </div>
        ))}
      </div>
      {/* Downward pointing pixel tail */}
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "4px solid transparent",
          borderRight: "4px solid transparent",
          borderTop: `4px solid ${isAlert ? "var(--nx-bad)" : "var(--nx-note)"}`,
          marginTop: -1,
        }}
      />
    </div>
  );
}

/** Pixel person avatar, 10x10 grid rendered at 32x32 */
function PersonSprite({ seed, shirt }: { seed: string; shirt: string }) {
  const h = hash(seed);
  const skin = SPRITE_SKIN[h % SPRITE_SKIN.length];
  const hair = SPRITE_HAIR[(h >> 3) % SPRITE_HAIR.length];
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
  const fill: Record<string, string> = { H: hair, S: skin, E: "var(--nx-ink)", T: shirt };
  const px = 3.2;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      {rows.map((row, y) =>
        row.split("").map((ch, x) =>
          ch === "." ? null : (
            <rect key={`${x}-${y}`} x={x * px} y={y * px} width={px} height={px} fill={fill[ch]} />
          )
        )
      )}
    </svg>
  );
}

/** Pixel robot sprite for agents */
function AgentRobotSprite({ seed, role }: { seed: string; role: string }) {
  const isScout = seed.includes("scout") || role.toLowerCase().includes("investigator");
  const isPlanner = seed.includes("planner") || role.toLowerCase().includes("strategist");
  const eye = isScout ? "var(--nx-info)" : isPlanner ? "var(--nx-accent)" : "var(--nx-ok)";
  const chassis = isScout ? "var(--nx-info)" : isPlanner ? "var(--nx-warn)" : "var(--nx-ok)";
  const metal = "var(--nx-muted)";
  const metalLight = "var(--nx-line)";
  const rows = [
    "..||||||..",
    "..MMMMMM..",
    ".MMMMMMMM.",
    ".MEEEEEEM.",
    ".MEMEEMEM.",
    "..MMMMMM..",
    "..TTTTTT..",
    ".TTTTTTTT.",
    "LTTTTTTTTL",
    "LTTTTTTTTL",
  ];
  const fill: Record<string, string> = {
    "|": eye,
    M: metal,
    E: eye,
    T: chassis,
    L: metalLight,
  };
  const px = 3.2;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
      {rows.map((row, y) =>
        row.split("").map((ch, x) =>
          ch === "." ? null : (
            <rect key={`${x}-${y}`} x={x * px} y={y * px} width={px} height={px} fill={fill[ch]} />
          )
        )
      )}
    </svg>
  );
}

/** 48x48 Server rack sprite with animated blinkers and incident radar */
function RackSprite({ isDown, isHighlighted }: { isDown: boolean; isHighlighted: boolean }) {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      style={{
        imageRendering: "pixelated",
        overflow: "visible",
        filter: isHighlighted ? "drop-shadow(0 0 6px var(--nx-info))" : undefined,
      }}
    >
      {/* Incident radar pulsing ringout waves */}
      {isDown &&
        [0, 0.35, 0.7].map((d) => (
          <circle
            key={d}
            className="nx-ringout"
            cx="24"
            cy="24"
            r="12"
            fill="none"
            stroke="var(--nx-bad)"
            strokeWidth="2"
            style={{ animationDelay: `${d}s` }}
          />
        ))}

      {/* Outer frame */}
      <rect x="2" y="2" width="44" height="44" fill="var(--nx-panel-2)" stroke="var(--nx-ink)" strokeWidth="2" />
      <rect x="4" y="4" width="40" height="40" fill="var(--nx-panel)" />

      {/* 3 Server bays */}
      {[0, 1, 2].map((bay) => (
        <g key={bay} transform={`translate(6, ${6 + bay * 12})`}>
          <rect width="36" height="10" fill="var(--nx-ink)" />
          {/* LED activity lights */}
          <rect
            x="3"
            y="3"
            width="4"
            height="4"
            fill={isDown && bay === 0 ? "var(--nx-bad)" : "var(--nx-ok)"}
            className={isDown && bay === 0 ? "nx-blink" : undefined}
          />
          <rect x="9" y="3" width="4" height="4" fill={isDown ? "var(--nx-bad)" : "var(--nx-info)"} />
          {/* Drive slots */}
          <line x1="16" y1="5" x2="33" y2="5" stroke="var(--nx-line)" strokeWidth="2" strokeDasharray="2 2" />
        </g>
      ))}

      {/* Incident warning badge if down */}
      {isDown && (
        <g transform="translate(32, -2)">
          <rect width="14" height="14" fill="var(--nx-bad)" stroke="var(--nx-ink)" strokeWidth="1.5" />
          <text
            x="7"
            y="11"
            textAnchor="middle"
            fill="var(--nx-ink)"
            fontFamily="var(--font-mono)"
            fontSize="10"
            fontWeight="bold"
          >
            !
          </text>
        </g>
      )}
    </svg>
  );
}

/** 64x32 Desk sprite with computer monitor, scrolling code, and blinking cursor */
function DeskSprite({ isAgent, seed = "desk" }: { isAgent: boolean; seed?: string }) {
  const h = hash(seed);
  return (
    <svg width="64" height="32" viewBox="0 0 64 32" style={{ imageRendering: "pixelated" }}>
      {/* Desk surface */}
      <rect x="2" y="10" width="60" height="20" fill="var(--nx-panel-2)" stroke="var(--nx-ink)" strokeWidth="2" />
      <rect x="4" y="12" width="56" height="4" fill={isAgent ? "var(--nx-line)" : "var(--nx-faint)"} />

      {/* Computer monitor */}
      <rect x="20" y="2" width="24" height="16" fill="var(--nx-ink)" stroke="var(--nx-line)" strokeWidth="1" />
      <rect
        x="22"
        y="4"
        width="20"
        height="12"
        fill={isAgent ? "rgba(108, 182, 255, 0.2)" : "rgba(126, 226, 168, 0.15)"}
      />
      {/* Animated scrolling code lines on screen */}
      <svg x="22" y="4" width="20" height="12" overflow="hidden">
        <g className="nx-scr" style={{ animationDelay: `-${(h % 24) / 10}s` }}>
          {[2, 6, 10, 14, 18, 22].map((yy, n) => (
            <rect
              key={yy}
              x="2"
              y={yy}
              width={6 + ((h + n * 5) % 4) * 2.5}
              height="2"
              fill={n % 2 ? "var(--nx-info)" : "var(--nx-ok)"}
            />
          ))}
        </g>
        <rect className="nx-cursor" x="2" y="8" width="3" height="2" fill="var(--nx-text)" />
      </svg>

      {/* Keyboard */}
      <rect x="22" y="20" width="20" height="6" fill="var(--nx-ink)" />
    </svg>
  );
}

function getRoomTheme(roomId: string) {
  const id = roomId.toLowerCase();
  if (id === AGENT_POD_ID || id.includes("agent")) {
    return {
      floor: "var(--room-agents-floor)",
      accent: "var(--room-agents)",
      name: "AGENT POD · AUTONOMOUS TRIAGE",
    };
  }
  if (id.includes("payment") || id.includes("ledger")) {
    return {
      floor: "var(--room-payments-floor)",
      accent: "var(--room-payments)",
      name: "CORE PAYMENTS & LEDGER",
    };
  }
  if (id.includes("platform") || id.includes("infra")) {
    return {
      floor: "var(--room-platform-floor)",
      accent: "var(--room-platform)",
      name: "PLATFORM INFRASTRUCTURE",
    };
  }
  if (id.includes("growth") || id.includes("checkout")) {
    return {
      floor: "var(--room-growth-floor)",
      accent: "var(--room-growth)",
      name: "GROWTH & CHECKOUT EXPERIENCE",
    };
  }
  if (id.includes("sre") || id.includes("reliability") || id.includes("ops")) {
    return {
      floor: "var(--room-sre-floor)",
      accent: "var(--room-sre)",
      name: "SITE RELIABILITY & OBSERVABILITY",
    };
  }
  return {
    floor: "var(--nx-panel)",
    accent: "var(--nx-info)",
    name: roomId.toUpperCase(),
  };
}

export function OfficeFloor({
  data,
  highlightIds,
  onNodeClick,
  event,
  latestStep,
  latestHandoff,
  activeAgent,
}: OfficeFloorProps) {
  const { rooms, supersededBy, incidents, personNote } = useMemo(() => buildRooms(data), [data]);
  const highlightSet = useMemo(() => new Set(highlightIds), [highlightIds]);
  const hasHighlights = highlightIds.length > 0;

  // Track hover for responsibilities bubble
  const [hover, setHover] = useState<string | null>(null);

  // Track active events/steps on people and agents (for hop, glow, speech bubble)
  const [active, setActive] = useState<Record<string, { seq: number; label: string; isAlert: boolean }>>({});

  // Flying envelopes queue
  const [envelopes, setEnvelopes] = useState<
    Array<{ id: number | string; kind?: string | null; fromX: string; fromY: string; toX: string; toY: string }>
  >([]);

  // Track flip animations when decisions are superseded
  const [supersededSet, setSupersededSet] = useState<Set<string>>(new Set());
  const [justFlipped, setJustFlipped] = useState<Set<string>>(new Set());
  const prevSuperseded = useRef<Set<string>>(new Set());

  useEffect(() => {
    const cur = new Set<string>();
    rooms.forEach((r) =>
      r.decisions.forEach((d) => {
        if (str(d.properties?.status) === "superseded" || supersededBy.has(d.id)) {
          cur.add(d.id);
        }
      })
    );

    // Identify newly superseded decisions to trigger 6-frame flip
    const newlyFlipped = new Set<string>();
    cur.forEach((id) => {
      if (!prevSuperseded.current.has(id) && prevSuperseded.current.size > 0) {
        newlyFlipped.add(id);
      }
    });

    if (newlyFlipped.size > 0) {
      setJustFlipped(newlyFlipped);
      const t = setTimeout(() => setJustFlipped(new Set()), 600);
      return () => clearTimeout(t);
    }

    setSupersededSet(cur);
    prevSuperseded.current = cur;
  }, [rooms, supersededBy]);

  // Handle live ingest events: avatar hop, halo glow, speech bubble, flying envelope
  useEffect(() => {
    if (!event) return undefined;
    const isIncident = event.kind === "incident";
    const label = describeEvent(event);
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Find person matching event.actor
    let matchedId: string | null = null;
    let roomIdx = 0;
    if (event.actor) {
      const actorLower = event.actor.toLowerCase();
      for (let r = 0; r < rooms.length; r += 1) {
        const room = rooms[r];
        for (const p of room.people) {
          const pName = (p.name || "").toLowerCase();
          const pId = p.id.toLowerCase();
          const pFirst = pName.split(" ")[0];
          if (
            pId === actorLower ||
            pName === actorLower ||
            pFirst === actorLower ||
            pId.includes(actorLower) ||
            actorLower.includes(pId)
          ) {
            matchedId = p.id;
            roomIdx = r;
            break;
          }
        }
        if (matchedId) break;
      }

      if (matchedId) {
        const id = matchedId;
        setActive((cur) => ({ ...cur, [id]: { seq: event.seq, label, isAlert: isIncident } }));
        timers.push(
          setTimeout(() => {
            setActive((cur) => {
              if (cur[id]?.seq !== event.seq) return cur;
              const { [id]: _removed, ...rest } = cur;
              return rest;
            });
          }, 2400)
        );
      }
    }

    // Spawn flying envelope across rooms
    const envId = event.seq || Date.now();
    // In 2x2 grid: room 0 top-left, room 1 top-right, room 2 mid-left, room 3 mid-right
    const isLeft = roomIdx % 2 === 0;
    const isTop = roomIdx < 2;
    const startX = isLeft ? "25%" : "75%";
    const startY = isTop ? "25%" : "55%";
    const targetX = isLeft ? "180px" : "-180px";
    const targetY = isIncident ? "-70px" : "60px";

    setEnvelopes((cur) => [
      ...cur.slice(-4),
      {
        id: envId,
        kind: event.kind,
        fromX: startX,
        fromY: startY,
        toX: targetX,
        toY: targetY,
      },
    ]);
    timers.push(
      setTimeout(() => {
        setEnvelopes((cur) => cur.filter((e) => e.id !== envId));
      }, 600)
    );

    return () => timers.forEach(clearTimeout);
  }, [event, rooms]);

  // Handle agent stream steps: hop & glow for triage robots
  useEffect(() => {
    if (!latestStep) return undefined;
    const agentName = (latestStep.agent || "").toLowerCase();
    let matchedId: string | null = null;
    for (const room of rooms) {
      for (const p of room.people) {
        if (
          p.properties?.is_agent &&
          (p.id.toLowerCase().includes(agentName) || p.name.toLowerCase().includes(agentName))
        ) {
          matchedId = p.id;
          break;
        }
      }
      if (matchedId) break;
    }
    if (matchedId) {
      const id = matchedId;
      const label = latestStep.tool ? `runs ${latestStep.tool}` : "triage step";
      const seq = Date.now();
      setActive((cur) => ({ ...cur, [id]: { seq, label, isAlert: false } }));
      const t = setTimeout(() => {
        setActive((cur) => {
          if (cur[id]?.seq !== seq) return cur;
          const { [id]: _removed, ...rest } = cur;
          return rest;
        });
      }, 2400);
      return () => clearTimeout(t);
    }
  }, [latestStep, rooms]);

  const isDimmed = (id: string) => {
    if (!hasHighlights) return false;
    return !highlightSet.has(id);
  };

  return (
    <div
      className="absolute inset-0 p-3 nx-scroll"
      data-testid="office-floor"
      style={{
        background: "var(--nx-bg)",
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gridTemplateRows: "1fr 1fr 0.75fr",
        gap: "var(--s4)",
        height: "100%",
        overflowY: "auto",
        position: "relative",
      }}
    >
      {rooms.length === 0 && (
        <div
          className="flex flex-col items-center justify-center p-8 text-center"
          style={{
            gridColumn: "1 / -1",
            gridRow: "1 / -1",
            border: "1px dashed var(--nx-line)",
            background: "var(--nx-panel)",
            margin: "auto",
            maxWidth: 420,
          }}
        >
          <div className="nx-display text-xs mb-2 flex items-center gap-2" style={{ color: "var(--nx-accent)" }}>
            <span className="nx-dot is-busy nx-blink" />
            <span>SYNCING OFFICE FLOOR...</span>
          </div>
          <p className="nx-mono text-[11px]" style={{ color: "var(--nx-muted)", margin: 0 }}>
            Fetching FalkorDB topology and reconstructing room desks.
          </p>
        </div>
      )}

      {rooms.map((room) => {
        const theme = getRoomTheme(room.id);
        const isAgentPod = room.id === AGENT_POD_ID;

        return (
          <section
            key={room.id}
            className="flex flex-col min-h-0"
            style={{
              background: theme.floor,
              backgroundImage:
                "linear-gradient(to right, var(--floor-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--floor-grid) 1px, transparent 1px)",
              backgroundSize: "16px 16px",
              borderTop: `4px solid ${theme.accent}`,
              borderLeft: "var(--bd)",
              borderRight: "var(--bd)",
              borderBottom: "var(--bd)",
              padding: "var(--s3)",
              gridColumn: isAgentPod ? "1 / -1" : undefined,
              position: "relative",
              overflow: "hidden",
            }}
            aria-label={theme.name}
          >
            {/* 28px Room Header */}
            <header
              className="flex items-center justify-between gap-2 shrink-0 mb-2 select-none"
              style={{ height: 28 }}
            >
              <h2
                className="nx-display text-xs"
                style={{
                  color: theme.accent,
                  margin: 0,
                  fontSize: 12,
                  letterSpacing: ".06em",
                }}
              >
                {theme.name}
              </h2>
              <span className="nx-mono text-[11px]" style={{ color: "var(--nx-muted)" }}>
                {isAgentPod
                  ? "3 AGENTS · FALKORDB MCP"
                  : `${room.people.length} PPL · ${room.services.length} SVC · ${room.decisions.length} DEC`}
              </span>
            </header>

            {/* Room Interior: Row 1 = Racks + Whiteboard, Row 2 = Desks */}
            <div className="flex-1 min-h-0 flex flex-col justify-between gap-1 overflow-hidden">
              {/* Row 1: Racks on left + Whiteboard on right (Back Wall) */}
              <div
                className="flex items-center justify-between gap-2 shrink-0"
                style={{
                  minHeight: 76,
                  paddingBottom: 2,
                  borderBottom: "1px dashed rgba(255, 255, 255, 0.08)",
                }}
              >
                {/* Racks */}
                <div className="flex items-center gap-2 flex-nowrap">
                  {room.services.map((svc) => {
                    const down = incidents.has(svc.id);
                    const lit = highlightSet.has(svc.id);
                    const dimmed = isDimmed(svc.id);
                    const short = getServiceShortName(svc.name);

                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => onNodeClick(svc)}
                        className={`flex flex-col items-center justify-center cursor-pointer nx-hover p-1 ${lit ? "nx-audit-pulse" : ""}`}
                        style={{
                          width: 76,
                          height: 72,
                          background: "none",
                          border: "none",
                          opacity: dimmed ? 0.35 : 1,
                          outline: lit ? "2px solid var(--nx-info)" : undefined,
                          boxShadow: lit ? "0 0 10px var(--nx-info)" : "none",
                          transition: "opacity 0.2s, outline 0.2s",
                        }}
                        title={`${svc.name} · Tier ${str(svc.properties?.tier) || "P1"}${down ? " · INCIDENT OPEN" : ""}`}
                        data-testid={`rack-${svc.id}`}
                      >
                        <RackSprite isDown={down} isHighlighted={lit} />
                        <span
                          className="nx-display mt-0.5 text-center"
                          style={{
                            fontSize: 11,
                            color: down ? "var(--nx-bad)" : "var(--nx-text)",
                            letterSpacing: ".06em",
                            maxWidth: 72,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {short}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Whiteboard / Decision Sticky Notes on Back Wall */}
                <div
                  className="flex items-center justify-center gap-1.5 px-2 py-1 shrink-0"
                  style={{
                    minWidth: 120,
                    maxWidth: 160,
                    height: 64,
                    background: "rgba(9, 12, 17, 0.55)",
                    border: "1px solid var(--nx-line)",
                    boxShadow: "inset 0 0 8px rgba(0,0,0,0.4)",
                  }}
                  title="Team Decision Whiteboard"
                >
                  {isAgentPod ? (
                    /* Playbook boards for Agent Pod */
                    <div className="flex items-center gap-2">
                      {room.decisions.map((pb) => {
                        const lit = highlightSet.has(pb.id);
                        const dimmed = isDimmed(pb.id);
                        return (
                          <button
                            key={pb.id}
                            type="button"
                            onClick={() => onNodeClick(pb)}
                            className="flex flex-col justify-between p-1 text-left nx-hover cursor-pointer"
                            style={{
                              width: 104,
                              height: 60,
                              background: "var(--nx-panel-2)",
                              border: "1px solid var(--nx-line)",
                              outline: lit ? "2px solid var(--nx-info)" : undefined,
                              opacity: dimmed ? 0.35 : 1,
                            }}
                            title={`${pb.name}: ${str(pb.properties?.summary)}`}
                          >
                            <span className="nx-display text-[10px]" style={{ color: "var(--nx-accent)" }}>
                              {pb.id}
                            </span>
                            <span className="nx-mono text-[9px] line-clamp-2" style={{ color: "var(--nx-muted)" }}>
                              {str(pb.properties?.summary).slice(0, 36)}
                            </span>
                            <span className="nx-chip text-[9px]" style={{ height: 16, padding: "0 4px", color: "var(--nx-ok)" }}>
                              ACTIVE
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : room.decisions.length === 0 ? (
                    <span className="nx-mono text-[11px] text-center w-full" style={{ color: "var(--nx-faint)" }}>
                      NO DECISIONS YET
                    </span>
                  ) : (
                    /* Sticky Notes for Decisions (24x20) */
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {room.decisions.slice(0, 4).map((d) => {
                        const isDead = supersededSet.has(d.id);
                        const isFlipped = justFlipped.has(d.id);
                        const lit = highlightSet.has(d.id);
                        const dimmed = isDimmed(d.id);
                        const summary = str(d.properties?.summary);

                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => onNodeClick(d)}
                            className={`flex flex-col items-center justify-center cursor-pointer relative ${isFlipped ? "nx-note-flip" : ""} ${lit ? "nx-audit-pulse" : ""}`}
                            style={{
                              width: 24,
                              height: 20,
                              background: isDead ? "var(--nx-warn)" : "var(--nx-note)",
                              color: "var(--nx-ink)",
                              border: "1px solid var(--nx-ink)",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
                              outline: lit ? "2px solid var(--nx-info)" : undefined,
                              opacity: dimmed ? 0.35 : 1,
                              transform: isDead ? "rotate(-2deg)" : "rotate(1deg)",
                            }}
                            title={`${d.id}: ${summary}${isDead ? " (SUPERSEDED)" : " (LIVE)"}`}
                            data-testid={`board-${d.id}`}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: -2,
                                width: 3,
                                height: 3,
                                background: isDead ? "var(--nx-muted)" : "var(--nx-bad)",
                                boxShadow: "0 0 0 1px var(--nx-ink)",
                              }}
                            />
                            <span
                              className="nx-mono font-bold"
                              style={{
                                fontSize: 8,
                                lineHeight: 1,
                                textDecoration: isDead ? "line-through" : "none",
                                color: "var(--nx-ink)",
                              }}
                            >
                              {d.id.replace("DEC-", "")}
                            </span>
                          </button>
                        );
                      })}
                      {room.decisions.length > 4 && (
                        <span className="nx-mono text-[10px] font-bold" style={{ color: "var(--nx-muted)" }}>
                          +{room.decisions.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: People at Desks */}
              <div
                className="flex items-center gap-2 flex-nowrap"
                style={{ minHeight: 76 }}
              >
                {room.people.map((person) => {
                  const firstName = (person.name || "").split(" ")[0];
                  const fullName = str(person.properties?.name) || person.name;
                  const role = str(person.properties?.role);
                  const isAgent = Boolean(person.properties?.is_agent);
                  const lit = highlightSet.has(person.id);
                  const dimmed = isDimmed(person.id);
                  const note = personNote.get(person.id);
                  const isActiveAgent = activeAgent === person.name.toLowerCase();
                  const act = active[person.id];
                  const hovered = hover === person.id;

                  let bubbleLines: string[] | null = null;
                  let isAlertBubble = false;
                  let isLiveBubble = false;

                  if (act) {
                    bubbleLines = wrap(act.label, 16, 2);
                    isAlertBubble = act.isAlert;
                    isLiveBubble = true;
                  } else if (hovered && note) {
                    bubbleLines = [note.verb, clip(note.target, 16)];
                    isAlertBubble = false;
                    isLiveBubble = false;
                  }

                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => onNodeClick(person)}
                      onMouseEnter={() => setHover(person.id)}
                      onMouseLeave={() => setHover((h) => (h === person.id ? null : h))}
                      onFocus={() => setHover(person.id)}
                      onBlur={() => setHover((h) => (h === person.id ? null : h))}
                      className={`flex flex-col items-center justify-end cursor-pointer nx-hover p-1 relative ${lit ? "nx-audit-pulse" : ""}`}
                      style={{
                        width: 76,
                        height: 76,
                        background: "none",
                        border: "none",
                        opacity: dimmed ? 0.35 : 1,
                        outline: lit ? "2px solid var(--nx-info)" : undefined,
                        boxShadow: lit ? "0 0 10px var(--nx-info)" : "none",
                        transition: "opacity 0.2s, outline 0.2s",
                      }}
                      title={`${fullName} · ${role || (isAgent ? "Agent" : "Engineer")}${note ? ` · ${note.verb} ${note.target}` : ""}`}
                      data-testid={`desk-${person.id}`}
                    >
                      {/* Speech Bubble on Event or Hover */}
                      {bubbleLines && (
                        <PixelBubble
                          lines={bubbleLines}
                          isAlert={isAlertBubble}
                          isLive={isLiveBubble}
                        />
                      )}

                      {/* Seated Avatar with 6px desk overlap */}
                      <div
                        style={{
                          position: "relative",
                          marginBottom: -6,
                          zIndex: 1,
                        }}
                      >
                        {/* Pulsing work halo glow behind avatar when active */}
                        {act && (
                          <span
                            key={`glow-${act.seq}`}
                            className="nx-glow"
                            style={{
                              position: "absolute",
                              inset: -4,
                              background: isAgent ? "var(--nx-info)" : "var(--nx-accent)",
                              opacity: 0.45,
                              pointerEvents: "none",
                              zIndex: 0,
                            }}
                          />
                        )}

                        <div key={act ? `hop-${act.seq}` : "rest"} className={act ? "nx-hop" : undefined}>
                          {isAgent ? (
                            <AgentRobotSprite seed={person.id} role={role} />
                          ) : (
                            <PersonSprite seed={person.id} shirt={theme.accent} />
                          )}
                        </div>
                      </div>

                      {/* Desk Base with scrolling code lines & blinking cursor */}
                      <DeskSprite isAgent={isAgent} seed={person.id} />

                      {/* Name Tag: First name only, max-width: 74px, 1px border */}
                      <div
                        className="nx-mono text-[11px] text-center truncate"
                        style={{
                          marginTop: 3,
                          maxWidth: 74,
                          background: "var(--nx-ink)",
                          border: `1px solid ${isActiveAgent ? "var(--nx-accent)" : "var(--nx-line)"}`,
                          padding: "1px 4px",
                          color: isAgent ? "var(--nx-info)" : "var(--nx-text)",
                        }}
                      >
                        {firstName}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}

      {/* Multi-colored flying envelopes across the office floor */}
      {envelopes.map((env) => (
        <div
          key={env.id}
          className="nx-flying-envelope absolute z-30 pointer-events-none"
          style={
            {
              top: env.fromY,
              left: env.fromX,
              "--tx": env.toX,
              "--ty": env.toY,
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          <svg width="22" height="15" viewBox="0 0 22 15" style={{ imageRendering: "pixelated" }}>
            <rect width="22" height="15" fill={getEnvelopeColor(env.kind)} stroke="var(--nx-ink)" strokeWidth="1.5" />
            <polyline points="2,2 11,8 20,2" fill="none" stroke="var(--nx-ink)" strokeWidth="1.5" />
          </svg>
        </div>
      ))}
    </div>
  );
}
