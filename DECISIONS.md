# NEXUS Architecture & UI Redesign Decisions

This log records design decisions, tradeoffs, and judgment calls made during the development and redesign of NEXUS for the WeMakeDevs x FalkorDB Graph Hacks (Oct 2026).

---

## Redesign Phases (NEXUS_UI_REDESIGN.md)

### Baseline Audit & Setup
- **Goal:** Execute phases 1–9 of `NEXUS_UI_REDESIGN.md` to elevate the pixel-office theme into a cohesive, production-grade interface without altering API contracts or behavior.
- **Headless Chrome Screenshot Pipeline:** Configured `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless --screenshot=... --window-size=W,H` to capture authentic 1440×900 and 1920×1080 screenshots directly from the Next.js runtime.

### Phase 1: Tokens, Fonts & Component Classes
- **Single Source of Truth:** Transferred all design tokens into `app/globals.css` under `:root` and mirrored in `lib/nexus/tokens.ts` for Canvas 2D contexts.
- **Strict Lint Compliance:** Verified that `grep -rn` for `rounded`, `font-sans`, emojis, and raw `#[0-9a-fA-F]{3,6}` across `web/components/nexus/**` returns exactly **0 hits**.
- **Font Strategy:** Installed `@fontsource/silkscreen` and `@fontsource/jetbrains-mono` for fully self-hosted, offline-resilient typography with zero CDN dependency or layout shift.
- **Pixel Icons:** Replaced all OS emoji with crisp pixelart SVGs (`PixelRobot`, `PixelLightbulb`, `PixelZap`, `PixelPlay`, `PixelClose`, `PixelInfo`) in `web/components/nexus/PixelIcons.tsx`.
- **Theme Floors:** Replaced saturated pastel room floors with dark tinted tiles and bright accent stripes (`--room-payments-floor`, `--room-platform-floor`, etc.).
- **Deliverables:** Built without errors (`npm run lint && npm run build`), captured screenshots at 1440×900 and 1920×1080 to `docs/img/ui/phase-1-*.png`.

### Phase 2: Page Grid, Single-Row Header, Toolbar-Merged Audits & Merged Footer
- **Single-Row Non-Wrapping Header (56px):** Consolidated header elements to strictly avoid secondary rows or wrapping at 1440px and 1920px. Moved Track qualifications out of a cluttered text badge into an accessible `ⓘ` pixel popover dialog. Replaced separate view buttons with an aligned `.nx-seg` segmented control (`OFFICE | GRAPH`).
- **Compound Status Chip:** Consolidated system state into a unified chip (`● graph · ● claude · ● stream idle`) fed by `useSystemStatus()` with rich contextual tooltips.
- **Audits Toolbar Integration:** Relocated the `AUDITS` bar (`OWNERS`, `TRACE`, `STALE`, `BUS FACTOR`) directly into the left side of the floor panel's 44px toolbar (`nx-panel-head`), placing summary statistics (`27 things · 42 links · 0 replaced`) on the right. This completely eliminated the redundant full-width second toolbar row.
- **Side Panel & Decision Ledger Drawer:** Structured side panel at 420px (responsive to 360px <= 1280px). Implemented a persistent 240px Decision Ledger drawer pinned at the bottom, collapsible to 36px via pixel chevron (`PixelChevronDown` / `PixelChevronUp`). Removed duplicate `Tenant: acme` badge from the side panel to eliminate redundancy with the header select.
- **Merged Footer (36px):** Replaced disjoint status bars with a single unified 36px footer combining SSE stream status, live source event telemetry counts (Slack, Linear, PRs, ADRs, Docs, Inc), and a dynamically dimmed graph legend on the right.
- **Deliverables:** Verified zero-wrap at 1440×900 and 1920×1080, verified TypeScript and ESLint (`npm run lint && npm run build`), and saved screenshots to `docs/img/ui/phase-2-1440x900.png` and `docs/img/ui/phase-2-1920x1080.png`.

### Phase 3: Status Semantics & Zero-State Colours
- **Unified Single-Source Status:** Centralized all status computations into `useSystemStatus()`. Eliminates discrepancy between header and footer status reporting.
- **Cold-Start Red Elimination:** Resolved the race condition where SSE stream disconnected status was displayed as red `stream down` on cold start even when FalkorDB and API are healthy. Set stream status to muted grey `stream idle` on cold start.
- **Supersede Replay Flash:** Added `nx-flash` 8-frame `steps(8, end)` CSS animation on the replaced decisions counter chip when superseded decisions increase during sync replay.
- **Tenant Display Consistency:** Ensured tenant display strictly uses brand name ("Acme Payments") on screen, with internal identifier `acme` restricted solely to tooltips and API parameters.
- **Deliverables:** Verified zero red on cold start while API is up, verified clean build with 0 ESLint warnings, and saved screenshots to `docs/img/ui/phase-3-1440x900.png` and `docs/img/ui/phase-3-1920x1080.png`.


