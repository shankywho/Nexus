# NEXUS Web

Next.js HUD for NEXUS. This is a fork of [FalkorDB Browser](https://github.com/FalkorDB/falkordb-browser) v2.3.1 (ELv2 / SSPL). Upstream changes are listed in [../MODIFICATIONS.md](../MODIFICATIONS.md) and the upstream license is kept in [LICENSE.txt](LICENSE.txt).

## NEXUS code

| Path | Purpose |
|---|---|
| `app/nexus/page.tsx` | HUD page at `/nexus` |
| `components/nexus/` | `AuditBar`, `LiveTopology`, `AskPanel`, `ProvenanceBadge`, `SimulateSyncButton`, `IngestionStreams`, `NodeInspector` |
| `lib/nexus/api.ts` | Typed client for the NEXUS API |
| `e2e/tests/nexus.spec.ts` | Playwright test for the audits and topology |

Everything else under `app/` is upstream FalkorDB Browser, kept for the Cypher explorer. `next.config.js` proxies `/api/nexus/*` and `/api/events/stream` to the API at `NEXUS_API_URL`.

## Develop

```bash
cp .env.local.template .env.local
npm ci
npm run dev        # http://localhost:3000/nexus
npm test           # unit tests
npm run lint
npm run build
npm run test:e2e   # Playwright; needs the app and API running
```
