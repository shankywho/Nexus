import test from "node:test";
import assert from "node:assert/strict";
import { describeEvent } from "./events.ts";

const base = { id: "evt-1", channel: null, refs: {}, text: "" };

test("describes each kind with ids taken from the event", () => {
  assert.equal(describeEvent({ ...base, kind: "slack_message", channel: "eng-backend" }), "posts in #eng-backend");
  assert.equal(describeEvent({ ...base, kind: "linear_ticket", refs: { ticket_id: "LIN-418" } }), "files LIN-418");
  assert.equal(describeEvent({ ...base, kind: "github_pr", refs: { pr_id: "PR-1203" } }), "opens PR-1203");
  assert.equal(describeEvent({ ...base, kind: "adr", refs: { doc_id: "ADR-049" } }), "ratifies ADR-049");
  assert.equal(describeEvent({ ...base, kind: "incident", text: "INC-81: secret leaked" }), "pages on INC-81");
});

test("falls back to generic wording when ids are missing", () => {
  assert.equal(describeEvent({ ...base, kind: "adr" }), "ratifies an ADR");
  assert.equal(describeEvent({ ...base, kind: "weird" }), "sends evt-1");
});
