"""Multi-Agent Runtime (Scout -> Planner -> Scribe) for Track 01 and Track 02.

Executes incident triage using MCP tool selection, multi-hop graph walks,
shared task handoffs, and native episodic/procedural memory storage.
"""

import asyncio
import json
import logging
import time
import uuid
from typing import Any

from nexus_api.adapters.falkor import get_falkor_client
from nexus_api.adapters.llm import llm_mode
from nexus_api.agents.tools import TOOLS_BY_NAME
from nexus_api.config import get_settings
from nexus_api.memory.store import get_memory_store
from nexus_api.services.eventbus import get_eventbus

logger = logging.getLogger(__name__)


class AgentRuntime:
    """Orchestrates multi-agent incident investigation, tool execution, and memory."""

    def __init__(self, tenant: str = "acme") -> None:
        self.tenant = (tenant or "acme").lower().strip()
        self.memory = get_memory_store(tenant=self.tenant)
        self.eventbus = get_eventbus()
        self.settings = get_settings()

    async def run_incident_triage(
        self,
        incident_id: str,
        title: str,
        service_id: str,
        description: str = "",
    ) -> dict[str, Any]:
        """Execute coordinated multi-agent triage: Scout -> Planner -> Scribe."""
        run_id = f"run_{uuid.uuid4().hex[:8]}"
        t_start = time.time()
        steps_record: list[dict[str, Any]] = []
        all_touched: set[str] = {service_id, incident_id}
        tool_sequence: list[str] = []

        await self.eventbus.publish(
            "agent.started",
            {
                "run_id": run_id,
                "tenant": self.tenant,
                "incident_id": incident_id,
                "title": title,
                "service_id": service_id,
            },
        )

        step_num = 1

        async def execute_step(agent: str, tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
            nonlocal step_num
            fn = TOOLS_BY_NAME.get(tool_name)
            if not fn:
                raise ValueError(f"Unknown tool: {tool_name}")

            t0 = time.time()
            output = fn(**args)
            lat = int((time.time() - t0) * 1000)

            cypher_used = output.get("cypher", "")
            rows_count = output.get("rows", 0)
            touched = output.get("touched_ids", [])
            all_touched.update(touched)
            tool_sequence.append(tool_name)

            step_entry = {
                "step": step_num,
                "agent": agent,
                "tool": tool_name,
                "args": args,
                "result": output.get("result"),
                "cypher": cypher_used,
                "rows": rows_count,
                "latency_ms": lat,
                "touched": touched,
            }
            steps_record.append(step_entry)

            # Record in native FalkorDB memory
            self.memory.record_tool_call(
                run_id=run_id,
                step=step_num,
                agent=agent,
                tool=tool_name,
                args=args,
                cypher=cypher_used,
                rows=rows_count,
                latency_ms=lat,
                touched_ids=touched,
            )

            # Publish over SSE for real-time office floor animations
            await self.eventbus.publish(
                "agent.step",
                {
                    "run_id": run_id,
                    "tenant": self.tenant,
                    "step": step_num,
                    "agent": agent,
                    "tool": tool_name,
                    "cypher": cypher_used,
                    "rows": rows_count,
                    "latency_ms": lat,
                    "touched": touched,
                    "summary": f"{agent} executed {tool_name} on {args}",
                },
            )
            step_num += 1
            await asyncio.sleep(0.05)  # cooperative yield
            return output

        # -------------------------------------------------------------
        # 1. SCOUT AGENT: Graph exploration and blast radius analysis
        # -------------------------------------------------------------
        # Scout creates the shared task
        task_id = self.memory.create_task(
            title=f"Investigate {incident_id}: {title}",
            description=description,
            incident_id=incident_id,
            assigned_to="Scout",
        )
        self.memory.claim_task_atomic(task_id, "Scout")

        # Step 1: Calculate dependency blast radius
        await execute_step("Scout", "blast_radius", {"service_id": service_id, "org_id": self.tenant})

        # Step 2: Check ownership and maintainers
        await execute_step("Scout", "who_owns", {"service_id": service_id, "org_id": self.tenant})

        # Step 3: Check structural criticality (PageRank / betweenness)
        await execute_step("Scout", "criticality_rank", {"org_id": self.tenant})

        # Step 4: If upstream/downstream has known decisions, trace them
        dec_to_trace = "DEC-017" if "session" in service_id or "checkout" in service_id else "DEC-028"
        await execute_step("Scout", "decision_trace", {"decision_id": dec_to_trace, "org_id": self.tenant})

        # Handoff: Scout -> Planner
        scout_summary = f"Root service {service_id} affects checkout cascade. Maintainers identified. Decision {dec_to_trace} is implicated."
        self.memory.handoff_task(task_id, from_agent="Scout", to_agent="Planner", note=scout_summary)
        await self.eventbus.publish(
            "task.handoff",
            {
                "run_id": run_id,
                "tenant": self.tenant,
                "task_id": task_id,
                "from_agent": "Scout",
                "to_agent": "Planner",
                "note": scout_summary,
            },
        )

        # -------------------------------------------------------------
        # 2. PLANNER AGENT: Memory recall & remedial decision planning
        # -------------------------------------------------------------
        self.memory.claim_task_atomic(task_id, "Planner")

        # Step 5: Recall past episodes and reusable procedures
        recall_out = await execute_step("Planner", "recall", {"entities": list(all_touched), "tenant": self.tenant})
        has_playbook = recall_out.get("result", {}).get("has_matching_playbook", False)

        # Step 6: Flag implicated decision for review
        await execute_step(
            "Planner",
            "flag_decision_for_review",
            {
                "decision_id": dec_to_trace,
                "reason": f"Implicated in {incident_id} ({title})",
                "org_id": self.tenant,
            },
        )

        # Step 7: Page owner
        await execute_step(
            "Planner",
            "page_owner",
            {
                "service_id": service_id,
                "message": f"Urgent: {incident_id} {title} requires triage. Maintainers paged.",
                "org_id": self.tenant,
            },
        )

        planner_summary = f"Page dispatched to on-call. Flagged {dec_to_trace} for review. Reused playbook: {has_playbook}."
        self.memory.handoff_task(task_id, from_agent="Planner", to_agent="Scribe", note=planner_summary)
        await self.eventbus.publish(
            "task.handoff",
            {
                "run_id": run_id,
                "tenant": self.tenant,
                "task_id": task_id,
                "from_agent": "Planner",
                "to_agent": "Scribe",
                "note": planner_summary,
            },
        )

        # -------------------------------------------------------------
        # 3. SCRIBE AGENT: Remediation action & memory persistence
        # -------------------------------------------------------------
        self.memory.claim_task_atomic(task_id, "Scribe")

        # Step 8: Open remediation tracking ticket
        await execute_step(
            "Scribe",
            "open_ticket",
            {
                "title": f"Remediate {incident_id}: {title}",
                "service_id": service_id,
                "priority": "high",
                "org_id": self.tenant,
            },
        )

        # Complete task
        self.memory.complete_task(task_id, resolution=f"Triage complete for {incident_id}. Actions recorded.")

        # Step 9: Store learned episode and register/reinforce procedural playbook
        goal = f"Resolve {incident_id} service degradation on {service_id}"
        outcome = f"Blast radius mapped ({len(all_touched)} nodes), maintainers paged, action ticket created, {dec_to_trace} flagged."
        await execute_step(
            "Scribe",
            "remember",
            {
                "incident_id": incident_id,
                "goal": goal,
                "outcome": outcome,
                "entities": list(all_touched),
                "tool_sequence": tool_sequence,
                "tenant": self.tenant,
            },
        )

        # Also store a semantic memory fact
        self.memory.save_fact(
            subject=service_id,
            predicate="STABILIZED_AFTER",
            obj=incident_id,
        )

        total_ms = int((time.time() - t_start) * 1000)
        final_output = (
            f"Remediation plan executed for {incident_id} ({service_id}): "
            "Blast radius and PageRank criticality mapped via FalkorDB graph algorithms; "
            "stale decision flagged for review; owner paged; ticket opened; "
            "episodic memory and procedural playbook recorded."
        )
        tasks_record = self.memory.list_tasks()

        final_payload = {
            "run_id": run_id,
            "tenant": self.tenant,
            "incident_id": incident_id,
            "title": title,
            "status": "completed",
            "task_id": task_id,
            "final_output": final_output,
            "steps_count": len(steps_record),
            "steps": steps_record,
            "tasks": tasks_record,
            "tool_sequence": tool_sequence,
            "touched_entities": list(all_touched),
            "reused_playbook": has_playbook,
            "total_latency_ms": total_ms,
        }

        await self.eventbus.publish("agent.completed", final_payload)
        return final_payload

