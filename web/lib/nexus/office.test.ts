import test from "node:test";
import assert from "node:assert/strict";
import { buildRooms } from "./office.ts";

const node = (id: string, group: string, properties: Record<string, unknown> = {}) => ({
  id,
  name: String(properties.name ?? id),
  label: id,
  group,
  properties,
});
const link = (source: string, target: string, label: string) => ({
  id: `${source}_${target}_${label}`,
  source,
  target,
  label,
  status: "active",
});

const data = {
  nodes: [
    node("platform", "Team", { name: "Platform" }),
    node("arjun", "Person", { name: "Arjun" }),
    node("session-store", "Service", { name: "Session Store", team_id: "platform" }),
    node("DEC-017", "Decision", { status: "superseded" }),
    node("DEC-021", "Decision", { status: "active" }),
    node("DEC-099", "Decision", { status: "active" }),
    node("INC-77", "Incident"),
  ],
  links: [
    link("arjun", "platform", "MEMBER_OF"),
    link("arjun", "session-store", "OWNS"),
    link("DEC-017", "session-store", "AFFECTS"),
    link("DEC-021", "session-store", "AFFECTS"),
    link("DEC-021", "DEC-017", "SUPERSEDES"),
    link("INC-77", "session-store", "TRIGGERED"),
  ],
};

test("places people, services and decisions in their team room", () => {
  const { rooms } = buildRooms(data);
  const platform = rooms.find((r) => r.id === "platform");
  assert.ok(platform);
  assert.deepEqual(platform.people.map((p) => p.id), ["arjun"]);
  assert.deepEqual(platform.services.map((s) => s.id), ["session-store"]);
  assert.deepEqual(platform.decisions.map((d) => d.id).sort(), ["DEC-017", "DEC-021"]);
});

test("puts decisions with no service in the records room", () => {
  const { rooms } = buildRooms(data);
  const records = rooms.find((r) => r.name === "Records room");
  assert.deepEqual(records?.decisions.map((d) => d.id), ["DEC-099"]);
});

test("tracks which decision replaced which and which services have incidents", () => {
  const { supersededBy, incidents } = buildRooms(data);
  assert.equal(supersededBy.get("DEC-017"), "DEC-021");
  assert.ok(incidents.has("session-store"));
});

test("describes what a person owns", () => {
  const { personNote } = buildRooms(data);
  assert.deepEqual(personNote.get("arjun"), { verb: "owns", target: "Session Store", kind: "own" });
});

test("returns no rooms for an empty graph", () => {
  assert.deepEqual(buildRooms({ nodes: [], links: [] }).rooms, []);
});

test("graph layout draws teams, people, services, decisions, agents and incidents", async () => {
  const { layoutGraph } = await import("./graphLayout.ts");
  const g = layoutGraph(data);
  assert.deepEqual(
    new Set(g.nodes.map((n) => n.kind)),
    new Set(["team", "person", "service", "decision", "agent", "incident"])
  );
  assert.ok(g.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  assert.ok(g.links.some((l) => l.kind === "supersedes" && l.source === "DEC-021" && l.target === "DEC-017"));
  assert.ok(g.nodes.find((n) => n.id === "session-store")?.incident);
});
