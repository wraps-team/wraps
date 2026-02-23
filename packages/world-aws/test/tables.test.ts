import { describe, expect, it } from "vitest";
import { GSI, getTableNames } from "../src/dynamodb/tables.js";

describe("getTableNames", () => {
  it("prefixes all table names", () => {
    const tables = getTableNames("workflow");
    expect(tables).toEqual({
      runs: "workflow-runs",
      steps: "workflow-steps",
      events: "workflow-events",
      hooks: "workflow-hooks",
      waits: "workflow-waits",
      streams: "workflow-streams",
    });
  });

  it("works with custom prefix", () => {
    const tables = getTableNames("myapp-prod");
    expect(tables.runs).toBe("myapp-prod-runs");
    expect(tables.events).toBe("myapp-prod-events");
  });

  it("returns all six entity tables", () => {
    const tables = getTableNames("t");
    expect(Object.keys(tables)).toHaveLength(6);
    expect(Object.keys(tables).sort()).toEqual([
      "events",
      "hooks",
      "runs",
      "steps",
      "streams",
      "waits",
    ]);
  });
});

describe("GSI constants", () => {
  it("defines run GSIs", () => {
    expect(GSI.runs.workflowName).toBe("gsi-workflow-name");
    expect(GSI.runs.status).toBe("gsi-status");
  });

  it("defines step GSIs", () => {
    expect(GSI.steps.run).toBe("gsi-run");
  });

  it("defines event GSIs", () => {
    expect(GSI.events.correlation).toBe("gsi-correlation");
  });

  it("defines hook GSIs", () => {
    expect(GSI.hooks.run).toBe("gsi-run");
    expect(GSI.hooks.token).toBe("gsi-token");
  });

  it("defines wait GSIs", () => {
    expect(GSI.waits.run).toBe("gsi-run");
  });

  it("defines stream GSIs", () => {
    expect(GSI.streams.run).toBe("gsi-run");
  });
});
