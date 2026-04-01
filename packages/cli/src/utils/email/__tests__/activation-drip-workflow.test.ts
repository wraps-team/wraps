import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { StepDefinition } from "../workflow-transform.js";

let activationDripSteps: StepDefinition[] = [];

function getNestedStep(
  steps: StepDefinition[],
  stepId: string,
): StepDefinition | undefined {
  for (const step of steps) {
    if (step.id === stepId) {
      return step;
    }

    const nestedBranches = [step.branches?.yes, step.branches?.no];
    for (const branchSteps of nestedBranches) {
      if (!branchSteps) {
        continue;
      }

      const nestedMatch = getNestedStep(branchSteps, stepId);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return undefined;
}

function getBranchStepIds(
  step: StepDefinition,
  branch: "yes" | "no",
): string[] {
  const branchSteps = step.branches?.[branch];
  if (!branchSteps) {
    return [];
  }

  return branchSteps.map((branchStep) => branchStep.id);
}

beforeAll(async () => {
  const testDir = join(tmpdir(), `wraps-activation-drip-${Date.now()}`);
  const wrapsDir = join(testDir, "wraps");
  const workflowsDir = join(wrapsDir, "workflows");

  await mkdir(workflowsDir, { recursive: true });

  const testFileDir = dirname(fileURLToPath(import.meta.url));
  const sourcePath = join(
    testFileDir,
    "../../../../../../wraps/workflows/activation-drip.ts",
  );
  const source = await readFile(sourcePath, "utf-8");
  const tempWorkflowPath = join(workflowsDir, "activation-drip.ts");

  await writeFile(tempWorkflowPath, source, "utf-8");

  const { parseWorkflowTs } = await import("../workflow-ts.js");
  const parsed = await parseWorkflowTs(tempWorkflowPath, wrapsDir);

  activationDripSteps = parsed.definition.steps;
});

describe("activation drip workflow", () => {
  it("keeps the celebration email behind all three activation milestones", () => {
    const velocityGate = getNestedStep(activationDripSteps, "check-velocity");
    const sentEmailGate = getNestedStep(activationDripSteps, "check-sent-email");
    const workflowGate = getNestedStep(activationDripSteps, "check-has-workflow");
    const broadcastGate = getNestedStep(activationDripSteps, "check-has-broadcast");
    const celebrationStep = getNestedStep(activationDripSteps, "celebration");

    expect(velocityGate).toBeDefined();
    expect(sentEmailGate).toBeDefined();
    expect(workflowGate).toBeDefined();
    expect(broadcastGate).toBeDefined();
    expect(celebrationStep).toBeDefined();

    expect(getBranchStepIds(velocityGate!, "yes")).toEqual([
      "power-user",
      "power-activated",
    ]);
    expect(getBranchStepIds(velocityGate!, "no")).toEqual([]);

    expect(sentEmailGate?.config).toMatchObject({
      field: "contact.hasSentEmail",
      operator: "is_true",
    });
    expect(getBranchStepIds(sentEmailGate!, "yes")).toEqual([
      "check-has-workflow",
    ]);
    expect(getBranchStepIds(sentEmailGate!, "no")).toEqual([]);

    expect(workflowGate?.config).toMatchObject({
      field: "contact.hasCreatedWorkflow",
      operator: "is_true",
    });
    expect(getBranchStepIds(workflowGate!, "yes")).toEqual([
      "check-has-broadcast",
    ]);
    expect(getBranchStepIds(workflowGate!, "no")).toEqual([]);

    expect(broadcastGate?.config).toMatchObject({
      field: "contact.hasSentBroadcast",
      operator: "is_true",
    });
    expect(getBranchStepIds(broadcastGate!, "yes")).toEqual(["celebration"]);
    expect(getBranchStepIds(broadcastGate!, "no")).toEqual([]);

    expect(celebrationStep).toMatchObject({
      id: "celebration",
      type: "send_email",
      config: { template: "activation-crushing-it" },
    });
  });
});
