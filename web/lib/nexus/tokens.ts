/**
 * Single source of truth design tokens for Canvas 2D and JS contexts.
 * All UI CSS tokens are defined in app/globals.css under :root.
 */
export const NX = {
  bg: "#0e131a",
  panel: "#151c25",
  panel2: "#1b2430",
  ink: "#090c11",
  line: "#2b3747",
  text: "#dde5ee",
  muted: "#7f8da0",
  faint: "#4a5668",
  accent: "#f2c94c",
  ok: "#7ee2a8",
  info: "#6cb6ff",
  warn: "#f2a65a",
  bad: "#eb5757",

  // Team floor colors for graph clusters
  paymentsFloor: "#2e2a20",
  payments: "#e0b866",
  platformFloor: "#1f2c27",
  platform: "#7ec4a0",
  growthFloor: "#212838",
  growth: "#93a6e6",
  sreFloor: "#2b2331",
  sre: "#c79be0",
  agentsFloor: "#18212f",
  agents: "#6cb6ff",
} as const;

export const SPRITE_SKIN = ["#f2c9a0", "#d9a577", "#b87d52", "#8a5a3b"] as const;
export const SPRITE_HAIR = ["#2a1b14", "#5a3a22", "#c9a24a", "#9a4a2a", "#1b1f2a"] as const;
