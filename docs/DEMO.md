# Demo script

About four minutes. Needs Docker. An Anthropic API key is optional.

## Before recording

```bash
cp .env.example .env
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env    # optional; without it answers are offline
make up
make demo                                     # the company before the incidents
open http://localhost:3000
```

The header chip reads **Claude live** with a key and **offline answers** without one. Both work for the demo.

## Flow

1. **The floor.** Four teams, their people, services and the decisions on the wall. Two boards are live.
2. **Replay company sync.** 76 events stream in. Boards flip to *Now DEC-0xx*, and red beacons appear on services with incidents (session store, notifications).
3. **Audits.** Click *Who owns what*, then *Bus factor*. Non-matching desks fade.
4. **Ask, then follow the sources.** Try these. Each answer cites a current source and the superseded one it replaced.
   - Where do we store user sessions?
   - Which signing algorithm does the auth gateway use now, and what did it replace?
   - What happened to the single SMS provider setup?
   - Why did we adopt the OpenTelemetry collector?
5. **Graph view.** The same data as team islands. The dashed red arrows are *replaces*.
6. **Show the grounding.** Open *Cypher used* under an answer, then ask something the graph cannot answer ("What is our parental leave policy?"). The answer says the graph has nothing on it and confidence drops.

## Stories in the data

| Story | Old decision | Trigger | New decision |
|---|---|---|---|
| Sessions | DEC-017 Redis | INC-77 eviction | DEC-021 Postgres (ADR-042) |
| Fraud scoring | DEC-024 heuristics | LIN-402 | DEC-026 XGBoost (ADR-045) |
| Auth gateway | DEC-030 shared HS256 secret | INC-81 secret in a log | DEC-033 RS256 with KMS rotation (ADR-049) |
| Notifications | DEC-028 one SMS provider | INC-79 outage | DEC-032 failover (ADR-048) |
| Metrics | none | n/a | DEC-035 OpenTelemetry collector (ADR-050), live |

## If something looks wrong

| Symptom | Fix |
|---|---|
| Boards do not change during replay | The graph was fully seeded. Run `make demo`, then replay. |
| Header says "api offline" | `docker compose ps`; the API must be healthy. `make logs` shows why. |
| "offline answers" with a key set | Restart the API after editing `.env`: `docker compose up -d api`. |
| Port already in use | Set `NEXUS_FALKORDB_PORT`, `NEXUS_API_PORT` or `NEXUS_WEB_PORT`, then `make up`. |
