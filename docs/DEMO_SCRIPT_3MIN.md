# NEXUS: 3-Minute Video Demo & Presentation Script
### WeMakeDevs x FalkorDB Graph Hacks (Oct 2026)
**Eligibility:** All 3 Tracks — **Track 1** (Autonomous AI Agents), **Track 2** (Graph Algorithms & Workflows), **Track 3** (Graph RAG / Company Brain).  
**Target Video Duration:** 2 minutes 45 seconds (Strictly under 3 minutes).  
**Estimated Spoken Words:** ~395 words (~140 wpm natural delivery).

---

## Pre-Recording Checklist (1 Minute Before Hitting Record)

1. **Verify Services Running:**
   - FalkorDB: `localhost:6379` (Docker / native daemon)
   - FastAPI Backend: `http://localhost:8000`
   - Next.js Web: `http://localhost:3000/nexus`
2. **Browser Window:**
   - Chrome set to **1920×1080** or **1440×900** full viewport.
   - Start on **`OFFICE`** view with the **`AGENT POD`** tab open.
   - Initial state: Incident `INC-83` selected in dropdown.

---

## Timeline & Scene-by-Scene Script

```
[0:00 - 0:25] ACT I: The Hook & System Architecture (All 3 Tracks)
[0:25 - 1:15] ACT II: Track 1 (AI Agents) & Track 2 (Graph Algorithms) — INC-83 Triage
[1:15 - 2:00] ACT III: Track 2 — Directional Particles, 1-Click Guided Tour & Hop Filter
[2:00 - 2:38] ACT IV: Track 3 — Graph RAG With Provenance & Real-Time Sync Replay
[2:38 - 2:55] ACT V: FalkorDB Rule 3 Compliance & Conclusion
```

---

### Act I: The Hook & Introduction [0:00 – 0:25]
**Tracks Covered:** General Overview · Track 1, Track 2, Track 3

| Timestamp | Visual Action (What to Click / Show) | Spoken Narration (What to Say) |
|---|---|---|
| **0:00 – 0:12** | • Camera starts on `http://localhost:3000/nexus`.<br>• Mouse moves smoothly across the pixel office floor: 4 team rooms with seated engineers, monitors with animated scrolling code, server racks, and the bottom Agent Pod. | *"Most software companies lose institutional memory in disconnected Slack threads and stale docs. When a production outage hits, on-call engineers guess who owns what and repeat past architectural mistakes."* |
| **0:12 – 0:25** | • Click the small pixel `ⓘ` icon in the top header next to the title `NEXUS company brain` to show the modal qualifying all 3 tracks.<br>• Close modal with `Esc` or `✕`. | *"This is **NEXUS** — an autonomous company brain and incident triage platform built natively on **FalkorDB**. NEXUS qualifies for all three Graph Hacks tracks: Autonomous AI Agents, Graph Algorithms, and Graph RAG."* |

---

### Act II: Track 1 (Agents) & Track 2 (Graph Algorithms) [0:25 – 1:15]
**Tracks Covered:** **Track 1** (Autonomous Agents) + **Track 2** (Graph Algorithms & Memory)

| Timestamp | Visual Action (What to Click / Show) | Spoken Narration (What to Say) |
|---|---|---|
| **0:25 – 0:40** | • In the right sidebar under **AGENT POD**, ensure `INC-83: web-checkout 5xx spike (SEV-1)` is selected.<br>• Click the orange **`⚡ PAGE AGENTS`** button.<br>• Watch the floor: Scout, Planner, and Scribe avatars hop with pulsing work halos (`nx-glow`). | *"Let's trigger a live SEV-1 incident: `INC-83`, a checkout 5xx spike. In our Agent Pod, we page our autonomous agent team. Watch them collaborate in real time on FalkorDB."* |
| **0:40 – 0:58** | • In the side panel, click through the newly populated **TRACE** steps.<br>• Click Step 1 (`blast_radius`) and Step 4 (`criticality_rank`).<br>• Point to the touched entity highlights on the floor and the raw Cypher query: `algo.pageRank('Service', 'DEPENDS_ON')`. | *"First, **Scout** crawls FalkorDB to map the blast radius and runs graph PageRank to rank upstream services. Scout hands off to **Planner**, who traverses temporal edges to identify on-call owner Sarah Chen. Planner hands off to **Scribe**, who pages the engineer and records the episode into FalkorDB memory in under 700 milliseconds."* |
| **0:58 – 1:15** | • Click the **MEMORY** sub-tab in the Agent Pod.<br>• Expand the newly recorded **Episode** for `INC-83` and the registered procedural playbook (`incident_triage`). | *"Every single step is 100% explainable. The agents don't hallucinate: their memory, task handoffs, and learned procedures are stored directly as native graph nodes in FalkorDB."* |

---

### Act III: Track 2 — Graph Showcase, Particles & 1-Click Tour [1:15 – 2:00]
**Tracks Covered:** **Track 2** (Graph Algorithms & Workflows)

| Timestamp | Visual Action (What to Click / Show) | Spoken Narration (What to Say) |
|---|---|---|
| **1:15 – 1:30** | • Click **`GRAPH`** in the top header segmented control.<br>• The 2D canvas displays the living company graph: convex hull clusters, glowing service racks, people, and decisions.<br>• Point to the glowing directional particles flowing along edges. | *"Switching to Graph View, NEXUS visualizes the living company topology. Directional particles stream along edges in real time: red particles race along incident blast radii, amber along supersedes arcs, and cyan along service ownership."* |
| **1:30 – 1:48** | • In the canvas top-left, click **`▶ TOUR`**.<br>• Click through **Next Chapter (1 → 2 → 3 → 4)**.<br>• Watch the camera smoothly pan and zoom into `INC-83`, `web-checkout`, on-call SREs, and the `DEC-017 → DEC-021` supersede relationship. | *"To help on-call teams cut through graph complexity, our 1-click Guided Incident Tour navigates straight through the outage: from alert epicenter, to dependency blast radius, to ownership resolution, down to the root-cause decision."* |
| **1:48 – 2:00** | • In the top-right canvas toolbar, toggle **`DEPTH: 1-HOP`** and click a service node.<br>• In the Audits bar, click **`OWNERS`** and **`BUS FACTOR`**.<br>• Notice the floating FalkorDB Cypher banner at bottom-left displaying queries with latency tags (`0.4ms`). | *"Our Ego-Network Hop filter instantly isolates 1-hop or 2-hop neighborhoods, dissolving irrelevant nodes. Plus, our Audits toolbar executes instant graph algorithms for bus factor and ownership in 0.4 milliseconds."* |

---

### Act IV: Track 3 — Graph RAG & Real-Time Sync Replay [2:00 – 2:38]
**Tracks Covered:** **Track 3** (Graph RAG / Temporal Company Brain)

| Timestamp | Visual Action (What to Click / Show) | Spoken Narration (What to Say) |
|---|---|---|
| **2:00 – 2:18** | • In the right sidebar, switch to the **`ASK BRAIN`** tab.<br>• Click the preset chip: *"Who owns the payments ledger?"* or type a question.<br>• Show the result card with mint `✓ CURRENT` source chips and amber `✗ SUPERSEDED` strikethrough chips. | *"Next: Graph RAG with our **Ask Brain**. Unlike standard vector RAG that hallucinates stale answers from old docs, NEXUS walks temporal graph paths in FalkorDB. It knows exactly which decisions are current, which are superseded, and attributes every fact to its verified owner."* |
| **2:18 – 2:38** | • Switch back to **`OFFICE`** view.<br>• In the top-right header, click the golden **`▷ REPLAY SYNC`** button.<br>• Watch the floor: multi-colored pixel envelopes fly across team rooms from people to services.<br>• On the Platform Infrastructure back wall, sticky note `DEC-017` flips from cream to amber with a 6-frame flip animation. | *"When engineering happens, NEXUS keeps pace. Clicking 'Replay Sync' streams live Git, Linear, Slack, and ADR events via server-sent events. Envelopes fly across rooms, and when decision DEC-021 supersedes DEC-017, the sticky note on the team whiteboard flips to amber live on screen."* |

---

### Act V: FalkorDB Rule 3 Compliance & Conclusion [2:38 – 2:55]
**Tracks Covered:** Hackathon Rule 3 Compliance · All 3 Tracks Summary

| Timestamp | Visual Action (What to Click / Show) | Spoken Narration (What to Say) |
|---|---|---|
| **2:38 – 2:48** | • Hover over the bottom footer showing:<br>`● graph · ● 185 things · 139 temporal links`.<br>• Show the entire cohesive pixel-art UI. | *"Under Hackathon Rule 3: FalkorDB is not a cosmetic cache. It executes the PageRank algorithms, holds the multi-agent episodic memory, and powers the temporal RAG traversals. If you remove FalkorDB, NEXUS cannot function."* |
| **2:48 – 2:55** | • Conclude on a confident, high-energy note.<br>• Display the repo URL and team credits. | *"NEXUS turns organizational chaos into a living, reasoning company brain. Built for WeMakeDevs x FalkorDB Graph Hacks 2026. Thank you!"* |

---

## Presenter Delivery Tips

- **Pacing:** Speak at an energetic, conversational tempo. Avoid pausing on transitions — let the visuals match your voiceover seamlessly.
- **Mouse Clicks:** Keep cursor movements deliberate and smooth. Avoid rapid shaking or wandering with the mouse.
- **Audio Quality:** Use an external microphone or headset with minimal room echo.
- **Resolution:** Record at 1080p (1920×1080) 60fps for crisp pixel art and smooth directional particle animations.
