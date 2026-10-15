import type { TopologyData, TopologyNode } from "./api";

export interface Room {
  id: string;
  name: string;
  people: TopologyNode[];
  services: TopologyNode[];
  decisions: TopologyNode[];
}

export const RECORDS_ID = "__records__";

const idOf = (end: string | TopologyNode): string => (typeof end === "string" ? end : end.id);
export const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

const VERB: Record<string, string> = {
  OWNS: "owns",
  MAINTAINS: "maintains",
  RESOLVED: "resolved",
  RESPONDED_TO: "responded to",
  AUTHORED: "wrote",
  RATIFIED: "ratified",
  DECIDED: "decided",
};

export function buildRooms(data: TopologyData) {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const teams = new Map<string, Room>();
  const ensureTeam = (id: string, name?: string): Room => {
    let room = teams.get(id);
    if (!room) {
      room = { id, name: name || id, people: [], services: [], decisions: [] };
      teams.set(id, room);
    }
    return room;
  };

  data.nodes.filter((n) => n.group === "Team").forEach((t) => ensureTeam(t.id, str(t.properties?.name) || t.name));

  const personTeam = new Map<string, string>();
  const serviceOwners = new Map<string, string[]>();
  const decisionService = new Map<string, string>();
  const supersededBy = new Map<string, string>();
  const incidents = new Set<string>();
  const personNote = new Map<string, { verb: string; target: string; kind: "own" | "keep" }>();

  data.links.forEach((l) => {
    const s = idOf(l.source);
    const t = idOf(l.target);
    const sn = byId.get(s);
    const tn = byId.get(t);
    if (!sn || !tn) return;
    if (l.label === "MEMBER_OF" && sn.group === "Person" && tn.group === "Team") personTeam.set(s, t);
    if ((l.label === "OWNS" || l.label === "MAINTAINS") && sn.group === "Person" && tn.group === "Service") {
      serviceOwners.set(t, [...(serviceOwners.get(t) ?? []), s]);
      if (!personNote.has(s) || l.label === "OWNS") {
        personNote.set(s, { verb: VERB[l.label], target: tn.name, kind: l.label === "OWNS" ? "own" : "keep" });
      }
    }
    if (sn.group === "Person" && tn.group === "Incident" && VERB[l.label] && !personNote.has(s)) {
      personNote.set(s, { verb: VERB[l.label], target: tn.id, kind: "keep" });
    }
    if (sn.group === "Decision" && tn.group === "Service") decisionService.set(s, t);
    if (sn.group === "Service" && tn.group === "Decision" && !decisionService.has(t)) decisionService.set(t, s);
    if (l.label === "SUPERSEDES" && sn.group === "Decision" && tn.group === "Decision") supersededBy.set(t, s);
    if (sn.group === "Incident" && tn.group === "Service") incidents.add(t);
    if (tn.group === "Incident" && sn.group === "Service") incidents.add(s);
  });

  data.nodes.forEach((n) => {
    if (n.group !== "Person") return;
    const teamId = personTeam.get(n.id) || str(n.properties?.team_id) || str(n.properties?.team) || "unassigned";
    ensureTeam(teamId).people.push(n);
    personTeam.set(n.id, teamId);
  });

  const serviceTeam = new Map<string, string>();
  data.nodes.forEach((n) => {
    if (n.group !== "Service") return;
    const owners = serviceOwners.get(n.id) ?? [];
    const teamId =
      str(n.properties?.team_id) || (owners.length ? personTeam.get(owners[0]) : undefined) || "unassigned";
    ensureTeam(teamId).services.push(n);
    serviceTeam.set(n.id, teamId);
  });

  const records: Room = { id: RECORDS_ID, name: "Records room", people: [], services: [], decisions: [] };
  data.nodes.forEach((n) => {
    if (n.group !== "Decision") return;
    const svc = decisionService.get(n.id);
    const teamId = svc ? serviceTeam.get(svc) : undefined;
    if (teamId) ensureTeam(teamId).decisions.push(n);
    else records.decisions.push(n);
  });

  const rooms = Array.from(teams.values()).filter((r) => r.people.length + r.services.length + r.decisions.length > 0);
  rooms.sort((a, b) => b.people.length + b.services.length - (a.people.length + a.services.length));
  if (records.decisions.length) rooms.push(records);
  return { rooms, supersededBy, incidents, personNote, serviceOwners, decisionService, personTeam, serviceTeam };
}

