/** Shape of an ingested event as the API streams it, plus helpers to describe it in a few words. */
export interface IngestEvent {
  id: string;
  kind: string | null;
  actor: string | null;
  channel?: string | null;
  ts?: string | null;
  text: string;
  refs: {
    service_ids?: string[];
    decision_id?: string;
    ticket_id?: string;
    doc_id?: string;
    pr_id?: string;
  };
  supersedes?: string | null;
  /** Increases with every event received, so equal events can still re-trigger an animation. */
  seq: number;
}

/** What the actor is doing, in the present tense, using ids from the event itself. */
export function describeEvent(e: Pick<IngestEvent, "kind" | "channel" | "refs" | "text" | "id">): string {
  const incident = e.text.match(/^(INC-\d+)/)?.[1];
  switch (e.kind) {
    case "slack_message":
      return e.channel ? `posts in #${e.channel}` : "posts in Slack";
    case "linear_ticket":
      return `files ${e.refs.ticket_id ?? e.text.match(/^(LIN-\d+)/)?.[1] ?? "a ticket"}`;
    case "github_pr":
      return `opens ${e.refs.pr_id ?? e.text.match(/^PR[- #]*(\d+)/)?.[0] ?? "a PR"}`;
    case "adr":
      return `ratifies ${e.refs.doc_id ?? "an ADR"}`;
    case "incident":
      return `pages on ${incident ?? "an incident"}`;
    case "notion_doc":
      return `writes ${e.refs.doc_id ?? "a doc"}`;
    default:
      return `sends ${e.id}`;
  }
}

/** Envelope colour per kind: questions are cool, ratified records are warm, incidents are red. */
export const KIND_COLOR: Record<string, string> = {
  slack_message: "#5cc8f0",
  linear_ticket: "#ffd166",
  github_pr: "#6be3a5",
  adr: "#f6ebcb",
  notion_doc: "#b197fc",
  incident: "#ff6b6b",
};
