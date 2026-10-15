import { test, expect } from "@playwright/test";

test.describe("NEXUS Web Features", () => {
  test("clicks each Quick Audit button and verifies highlights and canvas", async ({ page }) => {
    // Mock audit responses to test UI independently of live backend if needed
    await page.route("**/api/nexus/audits/**", async (route) => {
      const url = route.request().url();
      if (url.includes("who-owns-what")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            nodes: [
              { id: "arjun", group: "Person" },
              { id: "session-store", group: "Service" },
            ],
            edges: [{ source: "arjun", target: "session-store", status: "active" }],
            highlight_ids: ["arjun", "session-store"],
            cypher: "MATCH (p:Person)-[:OWNS]->(s:Service) RETURN p, s",
            run_id: "run_audit_01",
          }),
        });
      } else if (url.includes("decision-trace")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            nodes: [{ id: "DEC-021", group: "Decision" }],
            edges: [],
            highlight_ids: ["DEC-021"],
            cypher: "MATCH p=(d:Decision)-[:SUPERSEDES]->() RETURN p",
            run_id: "run_audit_02",
          }),
        });
      } else if (url.includes("stale-knowledge")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            nodes: [
              { id: "DEC-017", group: "Decision", properties: { status: "superseded" } },
              { id: "DEC-024", group: "Decision", properties: { status: "superseded" } },
            ],
            edges: [],
            highlight_ids: ["DEC-017", "DEC-024"],
            cypher: "MATCH (d:Decision {status: 'superseded'}) RETURN d",
            run_id: "run_audit_03",
          }),
        });
      } else if (url.includes("bus-factor")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            nodes: [
              { id: "kabir", group: "Person" },
              { id: "ledger", group: "Service" },
            ],
            edges: [],
            highlight_ids: ["kabir", "ledger"],
            cypher: "MATCH (p:Person)-[:MAINTAINS]->(s:Service) RETURN p, count(s)",
            run_id: "run_audit_04",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/nexus");

    // 1. Check HUD Header elements
    await expect(page.locator("h1")).toContainText("NEXUS");
    await expect(page.locator('[data-testid="office-floor"]')).toBeVisible();
    await page.click('[data-testid="view-graph"]');
    await expect(page.locator('[data-testid="live-topology-canvas"]')).toBeVisible();

    // 2. Click WHO OWNS WHAT
    await page.click('[data-testid="audit-who-owns-what"]');
    await expect(page.locator("text=2 highlighted")).toBeVisible();

    // 3. Click DECISION TRACE
    await page.click('[data-testid="audit-decision-trace"]');
    await expect(page.locator("text=1 highlighted")).toBeVisible();

    // 4. Click STALE KNOWLEDGE
    await page.click('[data-testid="audit-stale-knowledge"]');
    await expect(page.locator("text=2 highlighted")).toBeVisible();

    // 5. Click BUS FACTOR
    await page.click('[data-testid="audit-bus-factor"]');
    await expect(page.locator("text=2 highlighted")).toBeVisible();
  });
});
