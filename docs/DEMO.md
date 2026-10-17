# Demo: 2:45 video script and recording guide

Graph Hacks: Context for AI Agents (WeMakeDevs x FalkorDB). We enter **all three tracks**:

| Track | Name on the hackathon page | Where it shows in the demo |
|---|---|---|
| 1 | Agents That Act on Connected Data | Agent Pod: graph tools, algorithms, trace with Cypher, actions |
| 2 | Agent Memory and Coordination | Memory and Tasks tabs, handoffs, tenant switch |
| 3 | Company Brain | Office and graph, Replay sync, Ask Brain with sources |

## Before you record (10 minutes)

1. Put your key in `.env`: `GROQ_API_KEY=gsk_...` (leave `LLM_PROVIDER=groq`). No key also works: the header chip then says **offline answers** and answers come straight from the graph.
2. Start everything and load the pre-incident state:
   ```bash
   docker compose up -d --build     # or: make up
   make demo                        # company as of Sep 30; run it again before every take
   ```
3. Open `http://localhost:3000/nexus` in a 1920x1080 window. Close other tabs, hide bookmarks, turn off notifications.
4. Check the header chips: **graph** is green, the model chip says **groq** (or **offline answers**), **stream** says idle.
5. Ask Brain test: open **Ask Brain**, ask *Where do we store user sessions?* If the answer badge reads Groq, good. If it reads Offline although you set a key, restart the API: `docker compose up -d api`.
6. Do one full dry run, then `make demo` again so memory and the graph are clean for the real take. (A dry run leaves an episode and a playbook behind.)

## Script (about 380 words, under 3 minutes)

**0:00 to 0:15. Hook** (Office view, nothing clicked yet)
"Companies forget why they decided things, and when an incident hits, nobody knows what changed. NEXUS is a company brain on FalkorDB, and we are entering all three tracks: Company Brain, Agents That Act on Connected Data, and Agent Memory and Coordination."

**0:15 to 0:50. Track 3: Company Brain** (click **Replay Sync**)
"Slack, Linear, GitHub, incidents and ADRs stream into one graph. Watch the boards on the wall: when the Redis incident and ADR-042 arrive, decision DEC-017 is stamped replaced and DEC-021 appears. The graph keeps both, but only one is current."

(Open **Ask Brain**, click or type *Where do we store user sessions?*)
"Ask Brain answers from graph context, cites the current source, and flags the superseded one. Every source id is checked against the graph before you see it."

**0:50 to 1:35. Track 1: Agents That Act on Connected Data** (open **Agent Pod**, pick **INC-83**, click **Page Agents**)
"A new SEV-1: checkout is returning 5xx. Our agents walk the graph: blast radius over DEPENDS_ON edges, PageRank for criticality, who owns each service, and then a multi-hop query that finds the newest live decision affecting this service or anything it depends on."

(Click one trace step to expand it)
"Every step shows the Cypher that ran, the rows it returned and the time. The agents then act: they flag that decision for review, page the owner and open a ticket. The same tool registry is exposed over MCP, so any MCP client can call it."

(Switch to **Graph**, click **Tour** or **Fit view**)
"The same data as a graph: incidents, dependencies and decisions, with the touched nodes highlighted."

**1:35 to 2:25. Track 2: Agent Memory and Coordination** (back to **Agent Pod**, click **Tasks**)
"Scout hands the task to Planner, who hands it to Scribe. The task is a node in FalkorDB and claims are atomic, so two agents cannot take the same task."

(Click **Memory**)
"The run is saved three ways: an episode, facts with validity times, and a playbook of the tool sequence."

(Pick **INC-84**, click **Page Agents**; point at "playbook reused")
"A second incident recalls the first episode and finds the stored playbook."

(Switch the tenant selector to **Globex**)
"Same code, different tenant: Globex has its own memory graph, so it starts empty."

**2:25 to 2:45. Close** (back to **Acme**, Office view)
"Everything you saw reads and writes FalkorDB. Take it away and nothing runs. Setup, the data model and every query are in the README."

## Moving through the recording

1. Start on the Office view. Pause 2 seconds before you speak.
2. Move the mouse slowly. After each click wait about 1 second so the viewer sees the change.
3. **Replay Sync** runs about 25 seconds. Talk over it. If you started from `make demo`, boards flip near the end; do not leave the page until DEC-021 appears.
4. In **Agent Pod** the run takes about 3 seconds and steps appear one by one. Do not click until the Trace tab shows 10 steps.
5. Expand only one trace step. Pick `find_implicated_decisions` or `criticality_rank` because their Cypher is the most interesting.
6. Run **INC-83 first, then INC-84**. The second one is the one that shows a reused playbook.
7. Tenant switch last. After it, switch back to Acme before closing.
8. If a segment goes wrong, stop, run `make demo`, and re-record only that segment. Cut the clips together.

## What not to say

- Do not say the agents choose their own tools or that a model plans the run. Scout, Planner and Scribe run a fixed sequence; the graph decides which decision to review.
- Do not say the playbook makes the second run shorter. It is recalled and shown, not yet used to skip steps.
- Do not say Groq or Claude answers if the chip reads **offline answers**.
- The data is synthetic and arrives by replaying a file, not live Slack or Linear connections.

## If something looks wrong

| Symptom | Fix |
|---|---|
| Boards do not change during Replay | The graph was already fully seeded. Run `make demo`, then replay. |
| Header says **api offline** | `docker compose ps`; the API must be healthy. `make logs` shows why. |
| **offline answers** with a key set | Restart the API after editing `.env`: `docker compose up -d api`. |
| Ask Brain badge says Offline and the log shows a 401 or 429 | The Groq key is wrong or rate limited. Check the key at console.groq.com. |
| Agent Pod shows no steps | Pick an incident in the dropdown first, then click **Page Agents**. |
| Port already in use | Set `NEXUS_FALKORDB_PORT`, `NEXUS_API_PORT` or `NEXUS_WEB_PORT`, then `make up`. |

## Submission checklist

- Public repo with README, setup, graph data model (`docs/DATA_MODEL.md`) and queries (`docs/QUERIES.md`).
- Demo video under 3 minutes.
- All three tracks named in the submission form.
- AI assistance disclosed (README section "AI assistance disclosure").
- Deadline: October 18, 11:59 PM IST.
