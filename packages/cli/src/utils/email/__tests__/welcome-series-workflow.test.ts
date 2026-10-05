import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { StepDefinition } from "../workflow-transform.js";

let welcomeSeriesSteps: StepDefinition[] = [];

const HOURS_PER_UNIT: Record<string, number> = {
  minutes: 1 / 60,
  hours: 1,
  days: 24,
  weeks: 24 * 7,
};

// Every route a contact can take, with each condition's branch inlined ahead
// of the steps that follow it. An exit ends the route.
function routes(steps: StepDefinition[]): StepDefinition[][] {
  if (steps.length === 0) {
    return [[]];
  }
  const [step, ...rest] = steps;
  if (step.type === "exit") {
    return [[step]];
  }
  if (step.type === "condition") {
    return [step.branches?.yes ?? [], step.branches?.no ?? []].flatMap(
      (branch) => routes([...branch, ...rest]).map((r) => [step, ...r])
    );
  }
  return routes(rest).map((r) => [step, ...r]);
}

function sendHours(route: StepDefinition[]): number[] {
  let elapsed = 0;
  const sends: number[] = [];
  for (const step of route) {
    if (step.type === "delay") {
      const { amount, unit } = step.config as { amount: number; unit: string };
      elapsed += amount * HOURS_PER_UNIT[unit];
    }
    if (step.type === "send_email") {
      sends.push(elapsed);
    }
  }
  return sends;
}

beforeAll(async () => {
  const testDir = join(tmpdir(), `wraps-welcome-series-${Date.now()}`);
  const wrapsDir = join(testDir, "wraps");
  const workflowsDir = join(wrapsDir, "workflows");

  await mkdir(workflowsDir, { recursive: true });

  const testFileDir = dirname(fileURLToPath(import.meta.url));
  const sourcePath = join(
    testFileDir,
    "../../../../../../wraps/workflows/welcome-series.ts"
  );
  const source = await readFile(sourcePath, "utf-8");
  const tempWorkflowPath = join(workflowsDir, "welcome-series.ts");

  await writeFile(tempWorkflowPath, source, "utf-8");

  const { parseWorkflowTs } = await import("../workflow-ts.js");
  const parsed = await parseWorkflowTs(tempWorkflowPath, wrapsDir);

  welcomeSeriesSteps = parsed.definition.steps;
});

describe("welcome series workflow", () => {
  it("never sends two emails within 24 hours on any route", () => {
    const allRoutes = routes(welcomeSeriesSteps);
    expect(allRoutes.length).toBeGreaterThan(1);

    for (const route of allRoutes) {
      const sends = sendHours(route);
      for (let i = 1; i < sends.length; i++) {
        expect(sends[i] - sends[i - 1]).toBeGreaterThanOrEqual(24);
      }
    }
  });

  it("sends at most three emails on any route", () => {
    const counts = routes(welcomeSeriesSteps).map((r) => sendHours(r).length);
    expect(Math.max(...counts)).toBe(3);
  });

  it("stops after the welcome once AWS is connected", () => {
    const connectedEarly = routes(welcomeSeriesSteps).find((r) =>
      r.some((s) => s.id === "connected-early")
    );
    expect(connectedEarly?.filter((s) => s.type === "send_email")).toEqual([
      expect.objectContaining({ id: "welcome" }),
    ]);
  });
});
