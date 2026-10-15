# Demo script

About four minutes. Needs Docker, an Anthropic API key and a seeded graph.

## Before recording

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env
make up
(cd api && uv run python ../scripts/seed.py --reset --until 2026-09-30)   # the company before the incidents
open http://localhost:3000/nexus
```

Check that the header shows **Claude live**.

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
