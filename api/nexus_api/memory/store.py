"""Native FalkorDB Agent Memory Engine for Track 02.

Implements tenant-isolated memory in `nexus_memory_<tenant>`:
1. Episodic Memory: Incidents, goals, outcomes, and touched entities.
2. Semantic Memory: Learned facts with bi-temporal validity and supersession.
3. Procedural Memory: Playbooks / tool sequences that improve with success counts.
4. Conversation History: Persistent multi-turn conversations and turns per user.
5. Shared State & Handoffs: Tasks with atomic Cypher claims and handoff links.
"""

import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.config import get_settings

logger = logging.getLogger(__name__)


class MemoryStore:
    """Tenant-scoped memory store running natively on FalkorDB."""

    def __init__(self, tenant: str = "acme") -> None:
        self.tenant = (tenant or "acme").lower().strip()
        self.graph_name = f"nexus_memory_{self.tenant}"
        self.falkor = get_falkor_client()
        self._ensure_indexes()

    def _ensure_indexes(self) -> None:
        """Create indexes idempotently for fast retrieval."""
        index_queries = [
            "CREATE INDEX FOR (e:Episode) ON (e.id)",
            "CREATE INDEX FOR (f:Fact) ON (f.id)",
            "CREATE INDEX FOR (p:Procedure) ON (p.id)",
            "CREATE INDEX FOR (t:Task) ON (t.id)",
            "CREATE INDEX FOR (t:Task) ON (t.status)",
            "CREATE INDEX FOR (c:Conversation) ON (c.id)",
            "CREATE INDEX FOR (r:AgentRun) ON (r.id)",
        ]
        for q in index_queries:
            try:
                self.falkor.query(self.graph_name, q)
            except Exception:
                pass

    # --- 1. Episodic Memory ---

    def record_episode(
        self,
        incident_id: str,
        goal: str,
        outcome: str,
        touched_entities: list[str],
        procedure_id: str | None = None,
    ) -> str:
        """Record an episodic memory node linked to touched entities."""
        ep_id = f"ep_{uuid.uuid4().hex[:10]}"
        now = datetime.now(UTC).isoformat()

        cypher = """
        MERGE (ep:Episode {id: $ep_id})
        SET ep.incident_id = $incident_id,
            ep.goal = $goal,
            ep.outcome = $outcome,
            ep.ts = $now,
            ep.tenant = $tenant
        RETURN ep.id
        """
        self.falkor.query(
            self.graph_name,
            cypher,
            {
                "ep_id": ep_id,
                "incident_id": incident_id,
                "goal": goal,
                "outcome": outcome,
                "now": now,
                "tenant": self.tenant,
            },
        )

        # Link touched entities
        for entity in touched_entities:
            self.falkor.query(
                self.graph_name,
                """
                MATCH (ep:Episode {id: $ep_id})
                MERGE (ent:EntityRef {id: $ent_id, tenant: $tenant})
                MERGE (ep)-[:TOUCHED]->(ent)
                """,
                {"ep_id": ep_id, "ent_id": entity, "tenant": self.tenant},
            )

        # Link to procedure if produced/used
        if procedure_id:
            self.falkor.query(
                self.graph_name,
                """
                MATCH (ep:Episode {id: $ep_id})
                MATCH (p:Procedure {id: $proc_id})
                MERGE (ep)-[:PRODUCED]->(p)
                """,
                {"ep_id": ep_id, "proc_id": procedure_id},
            )

        return ep_id

    def recall_episodes(self, entities: list[str], limit: int = 3) -> list[dict[str, Any]]:
        """Recall episodes overlapping with given entities or service IDs."""
        if not entities:
            # Return most recent episodes
            cypher = """
            MATCH (ep:Episode {tenant: $tenant})
            OPTIONAL MATCH (ep)-[:PRODUCED]->(p:Procedure)
            RETURN ep.id AS id, ep.incident_id AS incident_id, ep.goal AS goal,
                   ep.outcome AS outcome, ep.ts AS ts, p.id AS procedure_id,
                   p.tool_sequence AS playbook
            ORDER BY ep.ts DESC
            LIMIT $limit
            """
            res = self.falkor.query(self.graph_name, cypher, {"tenant": self.tenant, "limit": limit})
        else:
            cypher = """
            MATCH (ep:Episode {tenant: $tenant})-[:TOUCHED]->(ent:EntityRef)
            WHERE ent.id IN $entities
            OPTIONAL MATCH (ep)-[:PRODUCED]->(p:Procedure)
            RETURN ep.id AS id, ep.incident_id AS incident_id, ep.goal AS goal,
                   ep.outcome AS outcome, ep.ts AS ts, count(ent) AS overlap,
                   p.id AS procedure_id, p.tool_sequence AS playbook
            ORDER BY overlap DESC, ep.ts DESC
            LIMIT $limit
            """
            res = self.falkor.query(
                self.graph_name, cypher, {"tenant": self.tenant, "entities": entities, "limit": limit}
            )

        episodes = []
        if res and res.result_set:
            for row in res.result_set:
                episodes.append({
                    "id": row[0],
                    "incident_id": row[1],
                    "goal": row[2],
                    "outcome": row[3],
                    "ts": row[4],
                    "procedure_id": row[5] if len(row) > 5 else None,
                    "playbook": row[6] if len(row) > 6 else None,
                })
        return episodes

    # --- 2. Semantic Memory ---

    def save_fact(self, subject: str, predicate: str, obj: str) -> str:
        """Store a semantic fact. Automatically supersedes prior contradictory active facts."""
        fact_id = f"fact_{uuid.uuid4().hex[:10]}"
        now = datetime.now(UTC).isoformat()

        # Invalidate existing active fact matching subject & predicate
        inv_cypher = """
        MATCH (f:Fact {subject: $subj, predicate: $pred, tenant: $tenant, status: 'active'})
        SET f.status = 'superseded', f.invalid_at = $now
        RETURN f.id
        """
        old_res = self.falkor.query(
            self.graph_name, inv_cypher, {"subj": subject, "pred": predicate, "tenant": self.tenant, "now": now}
        )

        create_cypher = """
        CREATE (new_f:Fact {
            id: $fact_id,
            subject: $subj,
            predicate: $pred,
            object: $obj,
            valid_at: $now,
            status: 'active',
            tenant: $tenant
        })
        RETURN new_f.id
        """
        self.falkor.query(
            self.graph_name,
            create_cypher,
            {"fact_id": fact_id, "subj": subject, "pred": predicate, "obj": obj, "now": now, "tenant": self.tenant},
        )

        if old_res and old_res.result_set:
            for row in old_res.result_set:
                old_id = row[0]
                self.falkor.query(
                    self.graph_name,
                    """
                    MATCH (new_f:Fact {id: $new_id})
                    MATCH (old_f:Fact {id: $old_id})
                    MERGE (new_f)-[:SUPERSEDES]->(old_f)
                    """,
                    {"new_id": fact_id, "old_id": old_id},
                )

        return fact_id

    def list_facts(self, active_only: bool = True) -> list[dict[str, Any]]:
        """List learned semantic facts."""
        filter_clause = "WHERE f.status = 'active'" if active_only else ""
        cypher = f"""
        MATCH (f:Fact {{tenant: $tenant}})
        {filter_clause}
        RETURN f.id AS id, f.subject AS subject, f.predicate AS predicate,
               f.object AS object, f.valid_at AS valid_at, f.invalid_at AS invalid_at,
               f.status AS status
        ORDER BY f.valid_at DESC
        """
        res = self.falkor.query(self.graph_name, cypher, {"tenant": self.tenant})
        facts = []
        if res and res.result_set:
            for row in res.result_set:
                facts.append({
                    "id": row[0],
                    "subject": row[1],
                    "predicate": row[2],
                    "object": row[3],
                    "valid_at": row[4],
                    "invalid_at": row[5],
                    "status": row[6],
                })
        return facts

    # --- 3. Procedural Memory (Playbooks) ---

    def register_procedure(self, trigger_pattern: str, tool_sequence: list[str]) -> str:
        """Register or increment a successful procedural playbook."""
        proc_id = f"proc_{uuid.uuid4().hex[:8]}"
        now = datetime.now(UTC).isoformat()
        import json

        tools_json = json.dumps(tool_sequence)
        cypher = """
        MERGE (p:Procedure {trigger_pattern: $pattern, tenant: $tenant})
        ON CREATE SET p.id = $proc_id,
                      p.tool_sequence = $tools,
                      p.success_count = 1,
                      p.created_at = $now,
                      p.last_used = $now
        ON MATCH SET p.success_count = p.success_count + 1,
                     p.tool_sequence = $tools,
                     p.last_used = $now
        RETURN p.id, p.success_count
        """
        res = self.falkor.query(
            self.graph_name,
            cypher,
            {
                "proc_id": proc_id,
                "pattern": trigger_pattern,
                "tools": tools_json,
                "now": now,
                "tenant": self.tenant,
            },
        )
        if res and res.result_set:
            return str(res.result_set[0][0])
        return proc_id

    def find_procedure(self, trigger_pattern: str) -> dict[str, Any] | None:
        """Lookup an existing procedure playbook by pattern."""
        import json

        cypher = """
        MATCH (p:Procedure {tenant: $tenant})
        WHERE p.trigger_pattern = $pattern OR $pattern CONTAINS p.trigger_pattern
        RETURN p.id, p.trigger_pattern, p.tool_sequence, p.success_count
        ORDER BY p.success_count DESC
        LIMIT 1
        """
        res = self.falkor.query(self.graph_name, cypher, {"tenant": self.tenant, "pattern": trigger_pattern})
        if res and res.result_set:
            row = res.result_set[0]
            try:
                seq = json.loads(row[2]) if isinstance(row[2], str) else row[2]
            except Exception:
                seq = []
            return {
                "id": row[0],
                "trigger_pattern": row[1],
                "tool_sequence": seq,
                "success_count": row[3],
            }
        return None

    def list_procedures(self) -> list[dict[str, Any]]:
        """List all stored procedures."""
        import json

        cypher = """
        MATCH (p:Procedure {tenant: $tenant})
        RETURN p.id, p.trigger_pattern, p.tool_sequence, p.success_count, p.last_used
        ORDER BY p.success_count DESC
        """
        res = self.falkor.query(self.graph_name, cypher, {"tenant": self.tenant})
        procs = []
        if res and res.result_set:
            for row in res.result_set:
                try:
                    tools = json.loads(row[2]) if isinstance(row[2], str) else row[2]
                except Exception:
                    tools = []
                procs.append({
                    "id": row[0],
                    "trigger_pattern": row[1],
                    "tool_sequence": tools,
                    "success_count": row[3],
                    "last_used": row[4],
                })
        return procs

    # --- 4. Shared State & Atomic Task Claims ---

    def create_task(self, title: str, description: str, incident_id: str, assigned_to: str = "Scout") -> str:
        """Create a shared task node for agent handoff."""
        task_id = f"task_{uuid.uuid4().hex[:8]}"
        now = datetime.now(UTC).isoformat()
        cypher = """
        CREATE (t:Task {
            id: $task_id,
            title: $title,
            description: $desc,
            incident_id: $incident_id,
            status: 'open',
            assigned_to: $assigned_to,
            created_at: $now,
            tenant: $tenant
        })
        RETURN t.id
        """
        self.falkor.query(
            self.graph_name,
            cypher,
            {
                "task_id": task_id,
                "title": title,
                "desc": description,
                "incident_id": incident_id,
                "assigned_to": assigned_to,
                "now": now,
                "tenant": self.tenant,
            },
        )
        return task_id

    def claim_task_atomic(self, task_id: str, agent_id: str) -> bool:
        """Atomically claim an open task using Cypher lock conditions. Prevents double handling."""
        now = datetime.now(UTC).isoformat()
        cypher = """
        MATCH (t:Task {id: $task_id, tenant: $tenant, status: 'open'})
        SET t.status = 'claimed',
            t.assigned_to = $agent_id,
            t.claimed_at = $now
        RETURN t.id
        """
        res = self.falkor.query(
            self.graph_name,
            cypher,
            {"task_id": task_id, "tenant": self.tenant, "agent_id": agent_id, "now": now},
        )
        return bool(res and res.result_set and len(res.result_set) > 0)

    def handoff_task(self, task_id: str, from_agent: str, to_agent: str, note: str) -> bool:
        """Record an explicit handoff from one agent to another."""
        now = datetime.now(UTC).isoformat()
        cypher = """
        MATCH (t:Task {id: $task_id, tenant: $tenant})
        MERGE (a1:Agent {name: $from_agent, tenant: $tenant})
        MERGE (a2:Agent {name: $to_agent, tenant: $tenant})
        CREATE (a1)-[:HANDOFF {task_id: $task_id, note: $note, ts: $now}]->(a2)
        SET t.status = 'open',
            t.assigned_to = $to_agent,
            t.last_note = $note
        RETURN t.id
        """
        res = self.falkor.query(
            self.graph_name,
            cypher,
            {
                "task_id": task_id,
                "tenant": self.tenant,
                "from_agent": from_agent,
                "to_agent": to_agent,
                "note": note,
                "now": now,
            },
        )
        return bool(res and res.result_set)

    def complete_task(self, task_id: str, resolution: str) -> bool:
        """Mark task completed."""
        now = datetime.now(UTC).isoformat()
        cypher = """
        MATCH (t:Task {id: $task_id, tenant: $tenant})
        SET t.status = 'completed',
            t.resolution = $res,
            t.completed_at = $now
        RETURN t.id
        """
        res = self.falkor.query(
            self.graph_name,
            cypher,
            {"task_id": task_id, "tenant": self.tenant, "res": resolution, "now": now},
        )
        return bool(res and res.result_set)

    def list_tasks(self) -> list[dict[str, Any]]:
        """List active and historical tasks and handoffs."""
        cypher = """
        MATCH (t:Task {tenant: $tenant})
        OPTIONAL MATCH (a1:Agent)-[h:HANDOFF {task_id: t.id}]->(a2:Agent)
        RETURN t.id, t.title, t.status, t.assigned_to, t.incident_id, t.created_at,
               collect(DISTINCT {from: a1.name, to: a2.name, note: h.note, ts: h.ts}) AS handoffs
        ORDER BY t.created_at DESC
        """
        res = self.falkor.query(self.graph_name, cypher, {"tenant": self.tenant})
        tasks = []
        if res and res.result_set:
            for row in res.result_set:
                handoffs = [h for h in row[6] if h.get("from")] if row[6] else []
                tasks.append({
                    "id": row[0],
                    "title": row[1],
                    "status": row[2],
                    "assigned_to": row[3],
                    "incident_id": row[4],
                    "created_at": row[5],
                    "handoffs": handoffs,
                })
        return tasks

    # --- 5. Conversation History ---

    def append_turn(self, conversation_id: str, user_id: str, role: str, content: str) -> str:
        """Append turn to persistent conversation."""
        turn_id = f"turn_{uuid.uuid4().hex[:8]}"
        now = datetime.now(UTC).isoformat()

        cypher = """
        MERGE (u:User {id: $user_id, tenant: $tenant})
        MERGE (c:Conversation {id: $conv_id, tenant: $tenant})
        SET c.updated_at = $now
        MERGE (u)-[:OWNS_CONVERSATION]->(c)
        CREATE (turn:Turn {
            id: $turn_id,
            role: $role,
            content: $content,
            ts: $now
        })
        MERGE (c)-[:HAS_TURN]->(turn)
        RETURN turn.id
        """
        self.falkor.query(
            self.graph_name,
            cypher,
            {
                "user_id": user_id,
                "conv_id": conversation_id,
                "turn_id": turn_id,
                "role": role,
                "content": content,
                "now": now,
                "tenant": self.tenant,
            },
        )
        return turn_id

    def get_conversation_history(self, conversation_id: str, limit: int = 20) -> list[dict[str, Any]]:
        """Retrieve conversation history turns in chronological order."""
        cypher = """
        MATCH (c:Conversation {id: $conv_id, tenant: $tenant})-[:HAS_TURN]->(t:Turn)
        RETURN t.id AS id, t.role AS role, t.content AS content, t.ts AS ts
        ORDER BY t.ts ASC
        LIMIT $limit
        """
        res = self.falkor.query(self.graph_name, cypher, {"conv_id": conversation_id, "tenant": self.tenant, "limit": limit})
        turns = []
        if res and res.result_set:
            for row in res.result_set:
                turns.append({"id": row[0], "role": row[1], "content": row[2], "ts": row[3]})
        return turns

    # --- 6. Execution Trace (Explainability) ---

    def record_tool_call(
        self,
        run_id: str,
        step: int,
        agent: str,
        tool: str,
        args: dict[str, Any],
        cypher: str,
        rows: int,
        latency_ms: int,
        touched_ids: list[str],
    ) -> str:
        """Record an explainable ToolCall node with execution telemetry."""
        tc_id = f"tc_{uuid.uuid4().hex[:8]}"
        import json

        args_str = json.dumps(args, default=str)
        cypher_stmt = """
        MERGE (r:AgentRun {id: $run_id, tenant: $tenant})
        MERGE (a:Agent {name: $agent, tenant: $tenant})
        CREATE (tc:ToolCall {
            id: $tc_id,
            step_number: $step,
            tool: $tool,
            args: $args,
            cypher: $cypher,
            rows_count: $rows,
            latency_ms: $latency_ms,
            agent: $agent
        })
        MERGE (r)-[:STEP {n: $step}]->(tc)
        MERGE (a)-[:EXECUTED]->(tc)
        RETURN tc.id
        """
        self.falkor.query(
            self.graph_name,
            cypher_stmt,
            {
                "run_id": run_id,
                "tenant": self.tenant,
                "agent": agent,
                "tc_id": tc_id,
                "step": step,
                "tool": tool,
                "args": args_str,
                "cypher": cypher,
                "rows": rows,
                "latency_ms": latency_ms,
            },
        )

        for tid in touched_ids:
            if tid:
                self.falkor.query(
                    self.graph_name,
                    """
                    MATCH (tc:ToolCall {id: $tc_id})
                    MERGE (ent:EntityRef {id: $tid, tenant: $tenant})
                    MERGE (tc)-[:TOUCHED]->(ent)
                    """,
                    {"tc_id": tc_id, "tid": str(tid), "tenant": self.tenant},
                )
        return tc_id

    def get_run_trace(self, run_id: str) -> list[dict[str, Any]]:
        """Retrieve full explainability trace of an agent run."""
        import json

        cypher = """
        MATCH (r:AgentRun {id: $run_id, tenant: $tenant})-[:STEP]->(tc:ToolCall)
        OPTIONAL MATCH (tc)-[:TOUCHED]->(ent:EntityRef)
        RETURN tc.step_number AS step,
               tc.agent AS agent,
               tc.tool AS tool,
               tc.args AS args,
               tc.cypher AS cypher,
               tc.rows_count AS rows,
               tc.latency_ms AS latency_ms,
               collect(DISTINCT ent.id) AS touched
        ORDER BY tc.step_number ASC
        """
        res = self.falkor.query(self.graph_name, cypher, {"run_id": run_id, "tenant": self.tenant})
        steps = []
        if res and res.result_set:
            for row in res.result_set:
                try:
                    parsed_args = json.loads(row[3]) if isinstance(row[3], str) else row[3]
                except Exception:
                    parsed_args = {}
                steps.append({
                    "step": row[0],
                    "agent": row[1],
                    "tool": row[2],
                    "args": parsed_args,
                    "cypher": row[3],
                    "rows": row[5],
                    "latency_ms": row[6],
                    "touched": row[7] or [],
                })
        return steps

    def reset(self) -> None:
        """Wipe memory graph for this tenant."""
        try:
            self.falkor.query(self.graph_name, "MATCH (n) DETACH DELETE n")
        except Exception:
            pass


_memory_stores: dict[str, MemoryStore] = {}


def get_memory_store(tenant: str = "acme") -> MemoryStore:
    """Get or create singleton MemoryStore for a tenant."""
    tenant_key = (tenant or "acme").lower().strip()
    if tenant_key not in _memory_stores:
        _memory_stores[tenant_key] = MemoryStore(tenant=tenant_key)
    return _memory_stores[tenant_key]
