# Notice of Modification

Date: 2026-10-15
Author: Shankar Pratap Singh (NEXUS Team)

This repository contains modifications to `FalkorDB/falkordb-browser` (version 2.3.1), licensed under the Elastic License 2.0 (ELv2) / Server Side Public License (SSPL).

In accordance with the license conditions, this notice affirms that files in the `web/` directory have been modified from the original upstream repository (https://github.com/FalkorDB/falkordb-browser).

### Modified Upstream Files:
- `web/app/globals.css`: Applied tactical dark industrial HUD styling (`--radius: 0px`, `#0a0a0a` background, `#141414` panels, `#27272a` borders, `#10b981` emerald, `#f59e0b` amber, `#ef4444` superseded), imported and applied JetBrains Mono monospace font across all components.
- `web/tailwind.config.js`: Configured `borderRadius: 0px` globally, added `nexus` color palette and `mono` font family.
- `web/app/layout.tsx`: Rebranded page metadata title to "NEXUS // Organizational Telemetry & Decision Graph" and updated description.
- `web/app/components/Header.tsx`: Added NEXUS telemetry branding badge and uppercase tracked font styling (`text-xs tracking-widest uppercase font-mono`).
- `web/app/components/Navbar.tsx`: Renamed navigation items to "Decision Provenance Graph", "Ingestion Streams (Slack / Jira / Docs)", "Ownership Matrix", and "Cypher Explorer (Upstream Browser)".
- `web/app/loginVerification.tsx`: Added `/nexus` route to authentication bypass and routed root `/` to `/nexus`.
- `web/app/page.tsx`: Added industrial HUD initial loader and client-side redirect to `/nexus`.
- `web/next.config.js`: Added API rewrites forwarding `/api/nexus/*` and `/api/events/stream` to the FastAPI backend.
- `web/package.json`: Added `react-force-graph-2d` for interactive topological graph rendering.

### Added NEXUS Files:
- `web/app/nexus/page.tsx`: Primary interactive NEXUS Industrial Telemetry HUD dashboard with Live Company Topology, Quick Audits bar, Ingestion Streams rail, and Provenance Badge.
- `web/components/nexus/AuditBar.tsx`: Quick Audit selector for WHO OWNS WHAT, DECISION TRACE, STALE KNOWLEDGE, BUS FACTOR.
- `web/components/nexus/LiveTopology.tsx`: Force-directed 2D topology visualizer using `react-force-graph-2d` with red dashed superseded edges and emerald active edges.
- `web/components/nexus/AskPanel.tsx`: Synthesis panel for asking organizational questions with instant confidence scoring and Cypher traces.
- `web/components/nexus/ProvenanceBadge.tsx`: Hardcoded and dynamic bi-temporal conflict resolution provenance badge.
- `web/components/nexus/SimulateSyncButton.tsx`: Top navbar replay trigger with live SSE event progress.
- `web/components/nexus/IngestionStreams.tsx`: Left rail showing real-time event counts across Slack, Jira, GitHub, ADRs, and incidents.
- `web/components/nexus/NodeInspector.tsx`: Entity property and decision lifecycle inspection drawer.
- `web/lib/nexus/api.ts`: Typed TypeScript client for all NEXUS backend endpoints.
- `web/e2e/tests/nexus.spec.ts` & `web/e2e/nexus.spec.ts`: Playwright test suite for the 4 Quick Audits and Live Topology canvas.
- `docs/img/hud.png`: Screenshot of the reskinned tactical HUD.

All original copyright notices and `LICENSE.txt` have been preserved intact.
