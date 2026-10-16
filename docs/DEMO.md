# NEXUS 4-Minute Demo Script: All Three Tracks

Follow this script to record the submission video for the WeMakeDevs x FalkorDB Graph Hacks Hackathon.

---

## Prerequisites & Setup (30 Seconds Before Recording)

```bash
# 1. Start containers and services
docker compose up -d

# 2. Seed pristine graph state
uv run --project api python scripts/seed.py

# 3. Open browser
open http://localhost:3000/nexus
```

---

## Demo Walkthrough (4 Minutes)

### Minute 0:00 – 0:45: The Office Floor & The Agent Pod (Track 3)
1. **Show the UI:**
   - "This is NEXUS. On the left is the live office floor of Acme Payments: teams are rooms, people sit at desks, microservices are server racks, and architectural decisions are boards on the wall."
   - Point to the **Agent Pod** in the top left:
   - "Here is our autonomous triage pod with three specialized agents: **Scout** (the graph investigator), **Planner** (the strategist), and **Scribe** (who takes actions and writes to memory)."
   - Show the header chips: "Tracks 1, 2 & 3 Active", "Tenant: Acme Payments".

### Minute 0:45 – 2:00: Incident INC-83 & MCP Graph Tools (Track 1 & Track 2)
1. **Trigger Incident:**
   - In the right sidebar under **Agent Pod**, select `INC-83: web-checkout 5xx spike`.
   - Click **Page Agents**.
2. **Watch the live coordination:**
   - Scout's speech bubble pops: `calling blast_radius`, then `calling criticality_rank`.
   - An envelope flies across the office floor from Scout to the `web-checkout` server rack and upstream dependencies.
   - A golden envelope flies from Scout's desk to Planner's desk: **Task Handoff**.
   - Planner checks episodic memory, flags stale decision `DEC-017` for review, and pages the on-call owner (`Sarah`).
   - Planner hands off to Scribe: Scribe opens an incident ticket and records the episode into FalkorDB memory.
3. **Show the Live Trace:**
   - Click the first step in the **Live Trace** panel.
   - Expand the Cypher query: "Notice how every step is explainable. Scout called `algo.pageRank('Service', 'DEPENDS_ON')` directly in FalkorDB to rank upstream criticality."
   - Click touched nodes to see them light up on the Office Floor.

### Minute 2:00 – 2:45: Episodic & Procedural Memory (Track 2)
1. **Inspect Memory:**
   - Switch to the **Memory** sub-tab in the Agent Panel.
   - Show the newly recorded **Episode** for `INC-83`: goal, outcome, and touched entities.
   - Show the **Procedural Playbook** registered: `incident_inc` with the ordered tool sequence.
2. **Trigger Second Incident:**
   - Select `INC-84: notifications delivery failures`.
   - Click **Page Agents**.
   - Show that the agent recalls the previous episode and recognizes the incident pattern, executing the playbook with accelerated speed!

### Minute 2:45 – 3:30: Hard Tenant Isolation (Track 2)
1. **Switch Tenant:**
   - In the top header, switch the Tenant dropdown from **Acme Payments** to **Globex Corp (Isolated)**.
   - Point to the Memory tab:
   - "Notice the episode count, semantic facts, and playbooks are completely empty (0 items). Because NEXUS partitions memory natively into `nexus_memory_<tenant>`, Globex Corp has zero access to Acme's incidents or runbooks."

### Minute 3:30 – 4:00: Rule 3 Proof & MCP Inspection (Rule Compliance)
1. **Rule 3 Verification in Terminal:**
   - Switch to terminal and run:
     ```bash
     uv run --project api python scripts/demo_agents.py --graph-off
     ```
   - Show output:
     ```text
     ✓ RULE 3 PASSED: Agent runtime failed immediately with graph offline:
       ConnectionError: Connection refused.
       The entire agent reasoning loop depends strictly on FalkorDB.
     ```
   - "This proves Rule 3: NEXUS cannot function without FalkorDB. The graph does real work on every step."
2. **Close:**
   - "NEXUS unites all three tracks: multi-hop agent reasoning on connected data, native memory and coordination, and a living company brain."
