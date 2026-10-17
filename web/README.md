# NEXUS Web

Next.js app. `/` is the landing page and `/nexus` is the office. `web/` started as a fork of FalkorDB Browser; see [../MODIFICATIONS.md](../MODIFICATIONS.md).

| Path | Purpose |
|---|---|
| `app/page.tsx`, `app/landing.css`, `components/landing/` | Landing page and its replay scene |
| `app/nexus/page.tsx` | Page layout: audits, floor, mail room, ask panel, decision ledger |
| `app/nexus/nexus.css` | Pixel theme tokens and base components |
| `components/nexus/` | `OfficeFloor`, `LiveTopology`, `AgentPanel`, `AskPanel`, `MergedFooter`, `NodeInspector`, `ProvenanceBadge`, `AuditBar`, `SimulateSyncButton`, `PixelIcons` |
| `lib/nexus/api.ts` | Typed client for the NEXUS API |
| `lib/nexus/office.ts` | Pure logic that groups graph nodes into rooms (unit tested) |
| `e2e/tests/nexus.spec.ts` | Playwright test for audits and the graph view |

`next.config.js` proxies `/api/nexus/*` and `/api/events/stream` to the API at `NEXUS_API_URL` (default `http://localhost:8000`). Next.js reads it at build time.

The app has no login. Put it behind your own auth proxy before exposing it.

## Develop

```bash
npm ci
npm run dev        # http://localhost:3000/nexus
npm test           # unit tests
npm run lint
npm run build
npm run test:e2e   # needs the app and API running
```
