# NEXUS Core Cypher Queries & Graph Algorithms

This document enumerates the Cypher queries, graph traversals, and algorithms that power NEXUS across all three tracks.

---

## 1. Graph Algorithms & Structural Analysis (Track 1)

### A. Criticality & Dependency Centrality (`algo.pageRank` / `algo.betweenness`)
Identifies foundational services in the architecture that represent structural bottlenecks or critical failure domains.

```cypher
// Run PageRank over Service DEPENDS_ON network
CALL algo.pageRank('Service', 'DEPENDS_ON')
YIELD node, score
RETURN node.id AS service, node.name AS name, score
ORDER BY score DESC
```

```cypher
// Betweenness centrality to detect architectural bridges
CALL algo.betweenness()
YIELD node, score
WHERE 'Service' IN labels(node)
RETURN node.id AS service, score
ORDER BY score DESC
LIMIT 5
```

### B. Dependency Blast Radius (Breadth-First Multi-Hop Traversal)
Calculates all upstream services affected if a root service or downstream dependency fails.

```cypher
MATCH path = (root:Service {id: $service_id, org_id: $org_id})<-[:DEPENDS_ON*1..4]-(downstream:Service)
RETURN root.id AS root,
       downstream.id AS affected_service,
       downstream.name AS name,
       length(path) AS depth
ORDER BY depth ASC
```

### C. Bus Factor & Degree Centrality
Computes single points of failure where a single engineer possesses exclusive maintainer rights.

```cypher
MATCH (p:Person {org_id: $org_id})-[:MAINTAINS]->(s:Service {org_id: $org_id})
WITH s, collect(p) AS maintainers, count(p) AS maintainer_count
WHERE maintainer_count = 1
RETURN s.id AS service_id,
       s.name AS service_name,
       maintainers[0].id AS sole_maintainer,
       maintainers[0].name AS maintainer_name
```

---

## 2. Multi-Hop Decision & Provenance Tracing (Track 1 & Track 3)

### A. Multi-Hop Supersession Chain (Up to 3 Hops)
Traces an architectural decision back through incident reversals, pull requests, and previous decisions.

```cypher
MATCH (d:Decision {id: $decision_id, org_id: $org_id})
OPTIONAL MATCH (d)-[:SUPERSEDES*1..3]->(old:Decision)
OPTIONAL MATCH (d)<-[:DOCUMENTED_IN]-(doc:Document)
OPTIONAL MATCH (d)<-[:IMPLEMENTED_BY]-(pr:PullRequest)
OPTIONAL MATCH (pr)<-[:TRIGGERED]-(inc:Incident)
RETURN d.id AS current_decision,
       d.status AS status,
       collect(DISTINCT old.id) AS superseded_decisions,
       collect(DISTINCT pr.id) AS pull_requests,
       collect(DISTINCT inc.id) AS root_incidents
```

### B. Who Owns What & Domain Experts
Resolves the team, maintainers, and related decision owners for a service.

```cypher
MATCH (s:Service {id: $service_id, org_id: $org_id})
OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
OPTIONAL MATCH (p:Person)-[:MAINTAINS]->(s)
OPTIONAL MATCH (p2:Person)-[:KNOWS_ABOUT]->(s)
RETURN s.id AS service,
       t.name AS team,
       collect(DISTINCT p.name) AS maintainers,
       collect(DISTINCT p2.name) AS domain_experts
```

---

## 3. Agent Memory & Coordination Operations (Track 2)

All memory operations execute inside the tenant-isolated graph `nexus_memory_<tenant>`.

### A. Episodic Memory Search (Incident Overlap)
Recalls previous incident resolutions touching overlapping services or decisions.

```cypher
MATCH (e:Episode)-[:TOUCHED]->(s:Service {id: $service_id})
OPTIONAL MATCH (e)-[:PRODUCED]->(proc:Procedure)
RETURN e.id AS episode_id,
       e.goal AS goal,
       e.outcome AS outcome,
       proc.tool_sequence AS playbook,
       proc.success_count AS successes
ORDER BY e.ts DESC
LIMIT 3
```

### B. Semantic Fact Storage with Supersession
Stores new learned facts and invalidates contradictory earlier beliefs.

```cypher
// Invalidate prior contradictory fact
MATCH (f:Fact {subject: $subj, predicate: $pred, status: 'active'})
SET f.status = 'superseded', f.invalid_at = $ts
WITH f
CREATE (new_f:Fact {
    id: $new_id,
    subject: $subj,
    predicate: $pred,
    object: $obj,
    valid_at: $ts,
    status: 'active'
})
MERGE (new_f)-[:SUPERSEDES]->(f)
RETURN new_f.id AS fact_id
```

### C. Atomic Multi-Agent Task Claim (Race-Condition Free)
Enables concurrent agents to claim tasks with zero chance of double-handling.

```cypher
MATCH (t:Task {id: $task_id, status: 'open'})
SET t.status = 'claimed',
    t.assigned_to = $agent_id,
    t.claimed_at = $ts
RETURN t.id AS task_id, t.assigned_to AS claimant
```

### D. Procedural Memory Playbook Lookup
Finds the highest-rated procedure matching an incoming incident pattern.

```cypher
MATCH (p:Procedure {trigger_pattern: $pattern})
RETURN p.id AS procedure_id,
       p.tool_sequence AS tools,
       p.success_count AS success_count
ORDER BY p.success_count DESC
LIMIT 1
```

### E. Explainability Execution Trace
Reconstructs the full sequence of steps, tool calls, and touched nodes for an agent run.

```cypher
MATCH (run:AgentRun {id: $run_id})-[:STEP]->(tc:ToolCall)
OPTIONAL MATCH (tc)-[:TOUCHED]->(node)
RETURN tc.step_number AS step,
       tc.tool AS tool_name,
       tc.args AS arguments,
       tc.cypher AS cypher_executed,
       tc.rows_count AS rows,
       tc.latency_ms AS latency_ms,
       collect(DISTINCT coalesce(node.id, node.name)) AS touched_entities
ORDER BY tc.step_number ASC
```
