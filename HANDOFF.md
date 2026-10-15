# Handoff

State as of 2026-10-15. Suggest `/clear` before the next phase.

## Done
- `web/` holds only the NEXUS HUD (`/nexus`). Upstream browser and auth removed (D-011).
- Office floor fits all rooms in view (no scroll); graph view is team islands (D-012).
- Claude provider: `ANTHROPIC_API_KEY` turns on grounded answers (D-013). Offline answers remain.
- Data: 76 events, 5 ADR/runbook docs, 12 gold questions, 5 decision stories (`scripts/stories.py`).

## Verified
- API: `uv run pytest tests` 26 pass (integration needs FalkorDB; the tests reset the graph), ruff, mypy.
- Web: eslint, `npm test` 6 pass, `npm run build`.
- `make eval`: NEXUS 1.00 accuracy, 0.00 stale; flat RAG 0.08 / 0.42.

- Live floor motion (D-014); SSE now reaches the browser (named events plus `no-transform`).

- Backend hardening: admin and ingest guards, input limits, 503 on graph outage, exact episode delete, Docker image with fixtures and a non-root user, compose healthchecks, `.env` honoured.
- Full `docker compose` run verified: seed, ask, SSE through the web proxy, eval, guards.

## Not verified
- A real Anthropic call. The live path was exercised with a faked model reply only.
- Playwright e2e (`web/e2e/tests/nexus.spec.ts`).

## Local setup used
- FalkorDB for NEXUS runs as `nexus-falkordb` on 6390 (6379 was taken). API: `FALKORDB_PORT=6390`.
- Reseed after tests: `cd api && FALKORDB_PORT=6390 uv run python ../scripts/seed.py --reset`.

## Next
- Run with a real key, record the demo with `docs/DEMO.md`, tune `agents/prompts/answer.md` if answers drift.
- Ask panel: add a visible "key missing" hint if the chip says offline.
