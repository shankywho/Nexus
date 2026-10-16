# NEXUS UI Redesign: Pixel Office, Done Right

> **For AntiGravity.** Redesign the NEXUS web UI in place. **Keep the pixel-office theme**: rooms, desks, pixel avatars, server racks, flying envelopes, the Agent Pod. **Do not change any API, data, or behaviour.** This is a visual and layout pass only.
> Work through the phases in order. After each phase, run `npm run lint && npm run build`, take screenshots at **1440×900** and **1920×1080** of Office and Graph view (cold start and after Replay sync), save them to `docs/img/ui/phase-N-*.png`, and commit.
> Log every judgment call in `DECISIONS.md`.

---

## 0. What's wrong now (audit of current screenshots)

| # | Problem | Why it looks odd |
|---|---|---|
| 1 | **Three font families**: pixel display (NEXUS, AUDITS, room titles), monospace (chips), plain sans (buttons, tabs, empty states, room meta) | The sans text breaks the pixel world. This is the #1 cause of "odd". |
| 2 | **Room floors are saturated pastels** (tan, sage, periwinkle, lavender) on a dark navy HUD | They read as flat stickers pasted onto the dark UI, not rooms in the same building. |
| 3 | **The floor doesn't fill its panel.** Rooms sit in a fixed ~1300px block, leaving dead space on the right and a hole beside the Agent Pod room (5 rooms in a 2-col grid) | Looks unfinished. |
| 4 | **Rooms have uneven internals.** Platform's right half is empty, Growth is mostly empty, and racks and desks don't line up between rooms | No grid, so nothing aligns. |
| 5 | **Truncated labels**: "Core Banking …", "Notification …", "Telemetry & M…", "Web Checkout …" | Cheap-looking, and loses information. |
| 6 | **Contradictory status**: header says `graph online` + `Claude live`; footer says red `offline`; right panel says `standby` | Judges will ask "is it broken?" |
| 7 | **Red at zero**: "0 of 0 decisions replaced" has a red square | Alarm colour with nothing to alarm about. |
| 8 | **Tenant shown twice, named differently**: "Acme Payments" (header) vs "acme" (panel) | Redundant, and inconsistent. |
| 9 | **Two control rows** (header + a mostly empty AUDITS row) plus **two footer rows** (status + legend) | Wastes ~110px vertically; the floor gets squeezed. |
| 10 | **Emoji icons** (🤖 💡 ⚡) beside pixel art | Mismatched rendering style, and they look different per OS. |
| 11 | **Heavy double-ring borders nested 3 deep** (panel inside panel inside panel) | Visual noise; everything shouts. |
| 12 | **Right panel is ~80% empty state**; the Decision Ledger is a header with no body | Dead area on the most important side. |
| 13 | **Graph view**: clusters use fixed ellipses in a small block, nodes ~10px, labels ~8px and unreadable, playbook nodes overlap the "AGENT POD" hull title ("AYBOOK" clipped), huge empty canvas | Fit and scale are both broken. |
| 14 | **Cold start shows no decisions anywhere**, though the legend advertises "Live decision / Replaced decision" | The legend promises things that aren't on screen. |

---

## 1. Design tokens (single source of truth)

Put these in `app/globals.css` under `:root`. Delete every hard-coded hex in `components/nexus/**` and use the tokens instead. Grep for `#` and `rounded` afterwards; both should return zero hits in NEXUS components.

```css
:root {
  /* chrome */
  --nx-bg:        #0e131a;   /* page */
  --nx-panel:     #151c25;   /* panels */
  --nx-panel-2:   #1b2430;   /* raised: tabs, chips, inputs */
  --nx-ink:       #090c11;   /* pixel outline */
  --nx-line:      #2b3747;   /* inner border */
  --nx-text:      #dde5ee;
  --nx-muted:     #7f8da0;
  --nx-faint:     #4a5668;

  /* semantic */
  --nx-accent:    #f2c94c;   /* brand yellow: NEXUS, primary CTA */
  --nx-ok:        #7ee2a8;   /* live / healthy / active decision */
  --nx-info:      #6cb6ff;   /* agents, links, selection */
  --nx-warn:      #f2a65a;   /* replaced decision, busy */
  --nx-bad:       #eb5757;   /* errors, open incident ONLY */

  /* team floors: dark tinted tiles + bright stripe (night office) */
  --room-payments-floor: #2e2a20;  --room-payments: #e0b866;
  --room-platform-floor: #1f2c27;  --room-platform: #7ec4a0;
  --room-growth-floor:   #212838;  --room-growth:   #93a6e6;
  --room-sre-floor:      #2b2331;  --room-sre:      #c79be0;
  --room-agents-floor:   #18212f;  --room-agents:   #6cb6ff;
  --floor-grid: rgba(255,255,255,0.045);

  /* type */
  --font-pixel: "Silkscreen", monospace;        /* titles & labels only, UPPERCASE */
  --font-mono:  "JetBrains Mono", monospace;    /* everything else */
  --fs-xs: 11px; --fs-sm: 12px; --fs-md: 13px; --fs-lg: 15px; --fs-xl: 20px;

  /* spacing (4px grid) */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;

  /* borders */
  --bd: 2px solid var(--nx-line);
  --ring: 0 0 0 2px var(--nx-ink), 0 0 0 4px var(--nx-line);  /* outer panels ONLY */

  /* layout */
  --header-h: 56px; --footer-h: 36px; --side-w: 420px;
}
```

**Rules**
- **Exactly two fonts.**
  - `--font-pixel` for: brand, panel titles, room titles, tab labels, button labels, and chip labels. Always uppercase, `letter-spacing: .06em`, sizes 11/12/15/20 only.
  - `--font-mono` for: body text, numbers, Cypher, agent traces, empty states, and tooltips.
  - **No sans-serif anywhere.** Remove any `font-sans` or Inter/Geist usage in NEXUS.
  - Load Silkscreen and JetBrains Mono via `next/font/google`. If the current pixel font is a different one, keep it and map it to `--font-pixel`; log that.
- `border-radius: 0` everywhere.
- **Double ring (`--ring`) only on the 3 top-level panels** (Floor, Side, and the Graph container). Everything inside uses a single `--bd`.
- **Colour meaning is fixed:**
  - red = error or open incident
  - amber = replaced decision or busy
  - mint = live or healthy
  - blue = agents or selection
  - yellow = brand or primary CTA
  - Zero counts are `--nx-muted`, never coloured.

---

## 2. Page layout

```
┌─ HEADER 56px ─────────────────────────────────────────────────────────────────────────┐
│ NEXUS  company brain   [● graph ● claude ● stream]   [Acme Payments ▾]  [OFFICE|GRAPH]  [▶ REPLAY SYNC] │
├────────────────────────────────────────────────────────────────┬──────────────────────┤
│ FLOOR PANEL (1fr)                                              │ SIDE PANEL (420px)   │
│ ┌ toolbar 44px ──────────────────────────────────────────────┐ │ [AGENT POD|ASK BRAIN]│
│ │ AUDITS [OWNERS][TRACE][STALE][BUS FACTOR]   27 things · 42 links · 0 replaced │ │  ...content (flex)   │
│ └────────────────────────────────────────────────────────────┘ │                      │
│   rooms grid / graph canvas (fills remaining height)           │ ─ DECISION LEDGER ─  │
│                                                                │  (drawer, 240px)     │
├────────────────────────────────────────────────────────────────┴──────────────────────┤
│ FOOTER 36px: ● stream idle  Slack 0 Linear 0 PRs 0 ADRs 0 Docs 0 Inc 0 │ legend ▢live ▢replaced ▢incident │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- Root: `display:grid; grid-template-rows: var(--header-h) 1fr var(--footer-h); height:100dvh; overflow:hidden; background:var(--nx-bg)`.
- Body: `grid-template-columns: minmax(0,1fr) var(--side-w); gap: var(--s4); padding: var(--s4)`.
  - Below 1280px wide: `--side-w: 360px`.
  - Below 1100px: the side panel becomes a slide-over toggled from the header.
- **The AUDITS row moves into the floor panel's toolbar** (left side). The stat chips go on the right of the same toolbar. This deletes one full row.
- **The status bar and legend merge into one 36px footer.** The legend goes on the right.
- **Header, single row, never wraps** (`flex-wrap: nowrap`).
  - Status: one compound chip with 3 dots, `graph · claude · stream`, each with a tooltip.
  - Remove the "Tracks 1, 2 & 3" chip from the header. Move it into an `ⓘ` about-popover next to the brand, where it lists the track mapping.
  - Tenant select: `max-width: 220px`.
- Office/Graph becomes one **segmented control** (two buttons sharing borders; active = `--nx-ok` fill with ink text). It replaces the two separate buttons.
- `REPLAY SYNC` is the only yellow (`--nx-accent`) button on the page. While running it shows a pixel progress bar inside the button (`23/50`) and is disabled.

---

## 3. Status semantics (fixes #6 and #7)

One hook, `useSystemStatus()`, feeds every status UI. Nothing else may compute status.

| Signal | States | Dot colour | Label |
|---|---|---|---|
| graph | up / down | mint / red | `graph` |
| claude | live / offline-answers | mint / amber | `claude` / `offline answers` |
| stream (SSE) | connected-idle / streaming / disconnected | muted / mint pulsing / red | `stream idle` / `streaming` / `stream down` |
| pod | standby / running / done / error | muted / blue pulsing / mint / red | shown only in the Agent Pod tab |

- The footer's left chip shows the **stream** state. A red `offline` while the API is up is a bug; it should read grey `stream idle`.
- "0 replaced" is muted. When the count is above 0, it turns amber and **flashes once** (an 8-frame steps() animation) at the moment a decision is superseded during replay.
- Tenant appears **once**, in the header. Delete the `Tenant: acme` chip in the side panel. Every display uses the tenant's display name ("Acme Payments"); the id `acme` appears only in tooltips.

---

## 4. Office floor (fixes #2, #3, #4, #5, #14)

### 4a. Rooms grid
- Floor container: `display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); grid-auto-rows: minmax(0,1fr); gap: var(--s4); height:100%`.
  - Rows: the 4 team rooms fill a 2×2 grid. **The Agent Pod room spans both columns** as a shorter bottom strip (`grid-column: 1 / -1`, `grid-template-rows: 1fr 1fr 0.7fr`). No hole, no dead right-side space.
  - The rooms grid scales to fill the panel. It must not be a fixed-width centred block.
- Each room: background `var(--room-X-floor)` with a tile pattern made from `--floor-grid` lines every 16px; 4px top stripe in `var(--room-X)`; single `--bd` border; padding `var(--s3)`.
- Room header: one line, 28px tall.
  - Left: `--font-pixel` 12px title in `var(--room-X)`.
  - Right: `--font-mono` 11px muted meta `4 PPL · 3 SVC · 0 DEC`.
- **The Agent Pod room keeps its identity**: darker floor, blue stripe, the agents' desks styled as "terminals", and playbook boards pinned on its back wall (top-right, inside the room, never overlapping the header).

### 4b. Room interior: fixed sprite grid
- Each room's interior is a CSS grid of **96×88px cells**: `grid-template-columns: repeat(auto-fill, 96px); justify-content: start; gap: var(--s3) var(--s4)`.
  - Rack row first ("back wall"), then desk rows.
  - Racks always occupy row 1. People start on row 2. This makes every room's racks and desks line up horizontally across the floor.
- Sprite sizes, used everywhere (integer scale, `image-rendering: pixelated`):
  - rack 48×48
  - desk 64×32
  - avatar 32×32, seated on the desk with 0px gap so the avatar's bottom overlaps the desk top by 6px
- **Name tag:** below the desk with a `var(--s1)` gap. `--font-mono` 11px, ink background, 1px `--nx-line` border, `max-width: 96px`, centred, single line. Show first name only ("Kabir"); the full name goes in the tooltip and inspector.
- **Rack label:** add a `shortName` to each service in the UI mapping:

  | Service | `shortName` |
  |---|---|
  | Core Banking Ledger | LEDGER |
  | Payouts Engine | PAYOUTS |
  | Fraud & Risk Scorer | FRAUD |
  | Session Store | SESSIONS |
  | Auth Gateway | AUTH |
  | Notification Dispatcher | NOTIFY |
  | Web Checkout Frontend | CHECKOUT |
  | Telemetry & Metrics | TELEMETRY |

  Render it in `--font-pixel` 11px. **No ellipses anywhere on the floor.** Full names go in the tooltip.
- Empty floor area is fine **only** if the room's cell grid is left-aligned and racks and desks align with neighbouring rooms.

### 4c. Decisions on the floor (fixes #14)
- Each team room gets a **whiteboard** on its back wall (right side of the rack row).
  - Decisions affecting that team's services pin to it as small sticky notes (24×20 sprites, max 4; then `+N`).
  - Live decision = cream note. Replaced = amber note with a pixel strike-through.
- **Cold start:** the board shows a faint "NO DECISIONS YET" in `--nx-faint`. The legend in the footer dims (opacity .5) any item with 0 instances on screen.
- **During replay:** envelopes fly desk → board. On supersede, the old note flips amber with a 6-frame animation. This is the money-shot moment, so it must be visible on the floor and not only in the side panel.

### 4d. Interactions
- Hover a desk, rack, or note: 2px `--nx-info` outline plus a tooltip.
- Click: opens the inspector in the side panel. The ledger drawer stays visible.
- Audit buttons highlight results **on the floor too**. Matching desks, racks, and notes get a pulsing `--nx-info` outline; everything else dims to 35% opacity. Press Esc or click the active audit again to clear.

---

## 5. Side panel (fixes #8, #10, #12)

- Structure: `grid-template-rows: auto 1fr auto`, i.e. tabs, content (scrolls), and the Decision Ledger drawer.
- **Tabs:** segmented `AGENT POD | ASK BRAIN` with pixel icons. The pod status chip sits right-aligned in the same row.
- **Icons:** replace all emoji with **pixelarticons** (`npm i pixelarticons`, MIT; inline SVG, 16px, `currentColor`): robot→`android`, bulb→`lightbulb`, bolt→`zap`, play→`play`, clock→`clock`. Grep for emoji ranges; there should be zero hits in `components/nexus/**`.
- **Agent Pod tab:**
  - Row 1: the incident `<select>` (flex 1) and `⚡ PAGE AGENTS` (`--nx-warn` fill), same 36px height, with no extra gap or border mismatch.
  - Sub-tabs `TRACE · MEMORY · TASKS`: show counts as `(n)`, muted when 0.
  - **Empty state** is compact: max 3 lines, centred vertically in a 160px block, with a pixel robot sprite. Example: "Pod on standby. Pick an incident and page the agents." Below it, show the **3 agent cards (Scout / Planner / Scribe)** with their role in one line each, so the panel is never blank.
- **Ask Brain tab:**
  - 3–4 preset question chips above the input.
  - Answers render as a mono card with the **provenance badge** under each answer:
    - `✓ CURRENT` lines in mint
    - `✗ SUPERSEDED` lines in amber with strike-through on the source label
- **Decision Ledger drawer:** always mounted, 240px tall, collapsible to a 36px header via a chevron.
  - Rows: `DEC-ID · title · date · status chip`. The status chip is mint `LIVE` or amber `REPLACED → DEC-xxx`.
  - Empty state is one muted line: "Replay the company sync to populate decisions."
  - Clicking a row highlights that decision's note on the floor and its trace.

---

## 6. Graph view (fixes #13)

- The canvas fills the floor panel. On mount, on resize (ResizeObserver), and after every replay batch, call `zoomToFit(400ms, padding 48)`. Never show a small graph in a big empty canvas.
- **Clusters:**
  - Draw team hulls as **padded convex hulls** of member positions, recomputed each tick and throttled to every 4 ticks. Do not use fixed ellipses.
  - Hull fill = `var(--room-X-floor)` at 0.6 alpha. Hull stroke = `var(--room-X)` 2px, dashed `4 4`.
  - Cluster label: a pixel-font badge placed **above the hull's top-most point** with an 8px offset. Run collision avoidance against other labels and nodes.
- **Node sizes** (fixed screen size via `nodeCanvasObject` and `globalScale`):
  - person 14px circle with initials
  - service 16px rack square
  - decision 14px diamond (mint live / amber replaced)
  - team hub 18px
  - incident 14px red square
  - agent 14px blue
- **Labels:**
  - `--font-mono` 11px with a 3px ink halo (`strokeText` first).
  - Always shown for hubs, services, and decisions. Person labels show at `globalScale ≥ 1.2` or on hover.
  - No ellipses; use `shortName`.
- **Edges:**
  - owns = solid `--nx-line`
  - maintains = dashed `--nx-line`
  - affects = solid `--nx-info` at 0.6
  - replaces = dashed `--nx-warn` with an arrow
  - superseded-source edges = dashed `--nx-bad` at 0.7
  - The legend chip at top-left uses the exact same strokes.
- **Playbook nodes:** positioned inside the Agent Pod hull through the force simulation (`forceX`/`forceY` toward the hull centroid). Never pin them to the hull title.
- **Forces:** `charge -180`, link distance 48 (intra-team) / 140 (cross-team), plus a `forceCollide(r+6)`. Freeze the simulation after it settles (`cooldownTicks: 200`) so the layout doesn't jitter during the demo.
- Fit view button: bottom-right, same style as the other secondary buttons.

---

## 7. Components: one style each

| Component | Spec |
|---|---|
| `.nx-btn` | h 32px, padding 0 12px, `--font-pixel` 12px, bg `--nx-panel-2`, `--bd`, 2px bottom ink shadow; `:active`/`.is-on` = translateY(2px), no shadow, `--nx-ok` bg + ink text |
| `.nx-btn--primary` | `--nx-accent` bg, ink text (used only for Replay Sync) |
| `.nx-btn--warn` | `--nx-warn` bg (used only for Page Agents) |
| `.nx-chip` | h 24px, padding 0 8px, `--font-mono` 11px, `--nx-panel-2`, 1px `--nx-line` border, optional 8px square dot |
| `.nx-seg` | segmented group of `.nx-btn`; shared borders (`margin-left:-2px`) |
| `.nx-panel` | `--nx-panel` bg, `--ring`; title bar 44px with `--font-pixel` 15px title |
| inputs/selects | h 36px, `--nx-panel-2`, `--bd`, mono 13px, custom pixel chevron (no native arrow) |
| tooltip | ink bg, 1px `--nx-line`, mono 11px, 150ms delay |
| focus | `outline: 2px solid var(--nx-info); outline-offset: 2px` on every interactive element |

---

## 8. Motion
- All pixel animations use `steps()` timing (no smooth easing on sprites). Envelope flight: 600ms. Note flip: 6 steps / 300ms. Count flash: 8 steps / 400ms.
- Respect `prefers-reduced-motion`: disable flights and flips, and keep instant state changes.

---

## 9. Build order

| Phase | Deliverable | Done when |
|---|---|---|
| 1 | Tokens + fonts + component classes (§1, §7); remove sans, emoji, and rounded classes | grep for `rounded`, `font-sans`, emoji, and raw `#hex` in `components/nexus/**` returns 0 |
| 2 | Page grid, single-row header, toolbar-merged audits, merged footer (§2) | 1440×900 screenshot shows no wrap and no second control row |
| 3 | `useSystemStatus` + status chips + zero-state colours (§3) | cold start shows no red anywhere while the API is up |
| 4 | Floor grid, room tiles, sprite cell grid, shortNames, name tags (§4a–b) | racks and desks align across rooms; zero truncated labels; no dead space at 1920×1080 |
| 5 | Whiteboards + decision notes + floor highlights for audits (§4c–d) | during replay, the DEC-017 note flips amber on the Platform board |
| 6 | Side panel: tabs, pixel icons, non-empty pod state, ledger drawer (§5) | no panel area >40% empty at cold start |
| 7 | Graph view fixes (§6) | graph fills canvas; all hub/service/decision labels readable at 1440×900; no label overlaps |
| 8 | Motion + reduced-motion + focus states (§8) | keyboard can reach every control; reduced-motion verified |
| 9 | Screenshot pass + `DECISIONS.md` summary | before/after screenshots for both views committed in `docs/img/ui/` |

**Acceptance check (final):** at 1440×900 and 1920×1080, in both views, before and after replay:
- one header row
- two fonts only
- no ellipsis on the floor
- no red unless something is actually broken or an incident is open
- every legend item visible on screen or dimmed
- the supersede moment visible on the floor, in the graph, and in the ledger at the same time
