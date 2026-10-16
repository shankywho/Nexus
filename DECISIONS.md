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
