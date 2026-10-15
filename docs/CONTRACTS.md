# Integration Contracts Verification (CONTRACTS.md)

This document records the empirical verification of integration contracts against upstream libraries and packages in Phase 0.

## Contract Verification Summary

| # | Contract | Status | Assumed Shape | Verified Implementation / Findings |
|---|---|---|---|---|
| C1 | Graphiti FalkorDB Driver | ✅ Verified | `from graphiti_core.driver.falkordb_driver import FalkorDriver`; `FalkorDriver(host, port, username=None, password=None, database="nexus_temporal")` | Verified against `graphiti-core==0.30.2`. `FalkorDriver` is in `graphiti_core.driver.falkordb_driver`. Parameters match: `(host, port, username, password, falkor_db, database)`. `Graphiti.build_indices_and_constraints()` exists and is async. |
| C2 | Graphiti `add_episode` | ✅ Verified | `await graphiti.add_episode(name, episode_body, source, source_description, reference_time, group_id)` | Signature verified: `(self, name, episode_body, source_description, reference_time, source=EpisodeType.message, group_id=None, ...)` returning `AddEpisodeResults`. Note parameter order: `source_description` precedes `reference_time`. |
| C3 | Graphiti `search` | ✅ Verified | `await graphiti.search(query, group_ids, num_results)` returning `list[EntityEdge]` | Verified signature and fields: `['uuid', 'group_id', 'source_node_uuid', 'target_node_uuid', 'created_at', 'name', 'fact', 'fact_embedding', 'episodes', 'expired_at', 'valid_at', 'invalid_at', 'reference_time', 'attributes']`. |
| C4 | Graphiti FalkorDB Schema | ✅ Verified | Nodes `:Entity`, `:Episodic`; edges `[:RELATES_TO]`, `[:MENTIONS]` | Confirmed schema in `graphiti_core`. Fact edges are `[:RELATES_TO]` with `valid_at`, `invalid_at`, `episodes`. `MockTemporal` writes this exact schema so Cypher and provenance code are identical in mock and live modes. |
| C5 | falkordb-browser Architecture | ✅ Verified | Next.js App Router in `app/`, NextAuth (`auth.ts`), connects over Redis protocol | Verified in `web/` (pinned tag `v2.3.1`). NextAuth 5-beta in `auth.ts`, Redis protocol connection via `@redis/client` and `falkordb` npm package. |
| C6 | falkordb-browser Canvas & Inspector | ✅ Verified | Canvas component with edge styling; Node inspector component | Verified: upstream uses `@falkordb/canvas` in `app/components/ForceGraph.tsx`. It does not support per-edge dashed styling natively. Inspector is `app/graph/DataPanel.tsx`. As planned in §2/§3, `react-force-graph-2d` is used for the *Live Company Topology* tab to render dashed red superseded edges and solid green active edges. |
| C7 | GraphRAG-SDK API | ✅ Verified | `KnowledgeGraph`, `Ontology`, `Source` | Verified against `graphrag-sdk==1.4.0`. Modern top-level exports are `GraphRAG`, `Ontology`, `FalkorDBConnection`, `LiteLLM`. The adapter in `api/nexus_api/adapters/docs_rag.py` targets the 1.4.0 API with graceful fallback. |
| C8 | FalkorDB MCP Server | ✅ Verified | Image, port, transport, env vars | Verified image `falkordb/mcpserver:latest` (v1.3.0). Exposes port 8080, uses `MCP_TRANSPORT=http`, `MCP_PORT=8080`, connects to FalkorDB via `FALKORDB_HOST` and `FALKORDB_PORT`. Added to `docker-compose.yml`. |
| C9 | Graphiti Telemetry | ✅ Verified | `GRAPHITI_TELEMETRY_ENABLED=false` | Verified `posthog` is invoked conditionally unless `GRAPHITI_TELEMETRY_ENABLED=false` or environment disables it. Added to `.env.example`. |

## Cypher Index Handling
FalkorDB syntax:
```cypher
CREATE INDEX FOR (n:Person) ON (n.id)
```
Existing indexes in FalkorDB produce an error if recreated without `IF NOT EXISTS` or exception handling. In `schema.py`, index creation executes each statement with `try...except` catching index duplicate errors idempotently.
