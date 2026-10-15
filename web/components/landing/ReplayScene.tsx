"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

const STEPS = [
  { when: "Sep 26", text: "PR #1150 ships Redis for sessions. DEC-017 is live." },
  { when: "Oct 2, 03:15", text: "INC-77: Redis evicts keys under load and drops 12% of sessions." },
  { when: "Oct 2, 05:30", text: "PR #1184 reverts sessions to Postgres. DEC-017 is now contested." },
  { when: "Oct 12", text: "ADR-042 supersedes ADR-038. DEC-021 is live and DEC-017 is replaced." },
];

const INK = "#070c10";
const PAPER = "#f6efd6";
const PAPER_OLD = "#c4bea6";

/** The sessions story from the fixtures, played on one wall: two boards, one rack, one desk. */
export function ReplayScene() {
  const [step, setStep] = useState(3);
  const timer = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reduced = useRef(false);

  const clear = () => {
    timer.current.forEach(clearTimeout);
    timer.current = [];
  };

  const play = useCallback(() => {
    clear();
    setStep(0);
    if (reduced.current) {
      setStep(3);
      return;
    }
    [1, 2, 3].forEach((s, i) => {
      timer.current.push(setTimeout(() => setStep(s), 1500 * (i + 1)));
    });
  }, []);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = document.getElementById("replay-scene");
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          play();
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, [play]);

  const incident = step === 1 || step === 2;
  const oldDead = step >= 3;
  const newLive = step >= 3;

  return (
    <figure id="replay-scene" className="lp-scene">
      <svg viewBox="0 0 560 300" role="img" aria-label="A wall with two decision boards and a server rack. Redis sessions are replaced by Postgres sessions after an incident." className="lp-scene-svg">
        <rect width="560" height="300" fill="#8fb39a" />
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x={i * 48} y="120" width="2" height="180" fill="#7ea28e" />
        ))}
        <rect width="560" height="120" fill="#3a4a58" />
        <rect y="116" width="560" height="6" fill={INK} />
        <text x="20" y="34" className="lp-svg-sign" fontSize="10" fill="#f6ebcb">PLATFORM INFRASTRUCTURE</text>
        <rect x="0" y="0" width="8" height="116" fill="#5cc8f0" />

        {/* DEC-017 */}
        <g transform="translate(24, 52)">
          <rect x="3" y="4" width="150" height="82" fill={INK} opacity="0.3" />
          <rect width="150" height="82" fill={oldDead ? PAPER_OLD : PAPER} stroke={INK} strokeWidth="2" style={{ transition: "fill .4s" }} />
          <circle cx="75" cy="0" r="4" fill={oldDead ? "#6f6a58" : "#ff6b6b"} stroke={INK} strokeWidth="2" />
          <text x="10" y="22" className="lp-svg-ui" fontSize="15" fontWeight="700" fill={oldDead ? "#6f6a58" : INK}>DEC-017</text>
          <text x="10" y="42" className="lp-svg-ui" fontSize="13" fill={oldDead ? "#6f6a58" : "#2a2230"}>Sessions live in Redis</text>
          <text x="10" y="58" className="lp-svg-ui" fontSize="13" fill={oldDead ? "#6f6a58" : "#2a2230"}>for lower latency</text>
          {oldDead ? (
            <>
              <rect x="6" y="15" width="138" height="2" fill="#ff6b6b" />
              <text x="10" y="76" className="lp-svg-ui" fontSize="12" fontWeight="700" fill="#b23a3a">Now DEC-021</text>
            </>
          ) : step === 2 ? (
            <text x="10" y="76" className="lp-svg-ui" fontSize="12" fontWeight="700" fill="#b8860b">Contested by PR-1184</text>
          ) : (
            <>
              <rect x="10" y="64" width="38" height="14" fill="#1f8a5a" />
              <text x="29" y="75" textAnchor="middle" className="lp-svg-ui" fontSize="11" fontWeight="700" fill="#fff">LIVE</text>
            </>
          )}
        </g>

        {/* DEC-021 */}
        <g transform="translate(200, 52)">
          {newLive ? (
            <>
              <rect x="3" y="4" width="150" height="82" fill={INK} opacity="0.3" />
              <rect width="150" height="82" fill={PAPER} stroke={INK} strokeWidth="2" />
              <circle cx="75" cy="0" r="4" fill="#ff6b6b" stroke={INK} strokeWidth="2" />
              <text x="10" y="22" className="lp-svg-ui" fontSize="15" fontWeight="700" fill={INK}>DEC-021</text>
              <text x="10" y="42" className="lp-svg-ui" fontSize="13" fill="#2a2230">Sessions stay on</text>
              <text x="10" y="58" className="lp-svg-ui" fontSize="13" fill="#2a2230">Postgres, pooled</text>
              <rect x="10" y="64" width="38" height="14" fill="#1f8a5a" />
              <text x="29" y="75" textAnchor="middle" className="lp-svg-ui" fontSize="11" fontWeight="700" fill="#fff">LIVE</text>
            </>
          ) : (
            <rect x="1" y="1" width="148" height="80" fill="none" stroke="#f6ebcb" strokeWidth="2" strokeDasharray="6 5" opacity="0.5" />
          )}
        </g>

        {/* rack */}
        <g transform="translate(420, 62)">
          <circle cx="32" cy="28" r="52" fill={incident ? "#ff6b6b" : "#5cc8f0"} opacity="0.14" style={{ mixBlendMode: "screen" }} />
          <rect width="64" height="54" fill="#3b4a57" stroke={INK} strokeWidth="3" />
          {[0, 1, 2].map((r) => (
            <g key={r}>
              <rect x="5" y={5 + r * 15} width="54" height="11" fill="#26323c" />
              <rect x="9" y={8 + r * 15} width="5" height="5" fill={r === 0 && incident ? "#ff6b6b" : "#6be3a5"} className={r === 0 && incident ? "lp-blink" : undefined} />
              <rect x="20" y={9 + r * 15} width="30" height="3" fill="#4f6270" />
            </g>
          ))}
          {incident && (
            <g transform="translate(50,-12)">
              <rect width="22" height="18" fill="#ff6b6b" stroke={INK} strokeWidth="2" />
              <text x="11" y="14" textAnchor="middle" className="lp-svg-ui" fontSize="13" fontWeight="700" fill={INK}>!</text>
            </g>
          )}
          <text x="32" y="74" textAnchor="middle" className="lp-svg-ui" fontSize="13" fontWeight="700" fill={INK}>Session Store</text>
        </g>

        {/* desk */}
        <g transform="translate(250, 196)" shapeRendering="crispEdges">
          <rect x="2" y="30" width="116" height="40" fill={INK} />
          <rect x="4" y="32" width="112" height="36" fill="#8a5a3b" />
          <rect x="4" y="32" width="112" height="6" fill="#a56f48" />
          <rect x="46" y="34" width="28" height="20" fill={INK} />
          <rect x="48" y="36" width="24" height="14" fill="#0e4b55" />
          <rect x="51" y="39" width="12" height="2" fill="#6be3a5" />
          <rect x="51" y="43" width="17" height="2" fill="#5cc8f0" />
          <g transform="translate(45, 0)">
            {["..HHHHHH..", ".HHHHHHHH.", ".HSSSSSSH.", ".HSESSESH.", ".HSSSSSSH.", "..SSSSSS..", "..TTTTTT..", ".TTTTTTTT."].flatMap((row, y) =>
              row.split("").map((ch, x) =>
                ch === "." ? null : (
                  <rect key={`${x}-${y}`} x={x * 3} y={y * 3 + 4} width="3" height="3" fill={{ H: "#2a1b14", S: "#d9a577", E: INK, T: "#5cc8f0" }[ch]} />
                ),
              ),
            )}
          </g>
        </g>
        <rect x="262" y="272" width="96" height="20" fill="#f6ebcb" stroke={INK} strokeWidth="2" />
        <text x="310" y="286" textAnchor="middle" className="lp-svg-ui" fontSize="13" fontWeight="700" fill={INK}>Priya Sharma</text>
      </svg>

      <figcaption className="lp-scene-cap" aria-live="polite">
        <span className="lp-scene-when">{STEPS[step].when}</span>
        <span>{STEPS[step].text}</span>
        <button type="button" className="lp-btn lp-btn-quiet" onClick={play}>
          Replay
        </button>
      </figcaption>
    </figure>
  );
}
