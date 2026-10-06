/**
 * Workflows Validate Command Tests
 *
 * `validate` must exit non-zero when any workflow is invalid or fails to
 * parse, so `validate && push` in CI stops on broken workflows.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";

vi.mock("@clack/prompts");
vi.mock("node:fs");
vi.mock("../../telemetry/events.js");

const mockProgress = {
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  info: vi.fn(),
};
vi.mock("../../utils/shared/output.js", () => ({
  // biome-ignore lint/complexity/useArrowFunction: constructor mock needs lazy eval of mockProgress (vi.mock is hoisted)
  DeploymentProgress: vi.fn(function () {
    return mockProgress;
  }),
}));

vi.mock("../../utils/email/template-compiler.js", () => ({
  loadWrapsConfig: vi.fn(),
  discoverTemplates: vi.fn(),
}));
vi.mock("../../utils/email/workflow-ts.js", () => ({
  discoverWorkflows: vi.fn(),
  parseWorkflowTs: vi.fn(),
}));
vi.mock("../../utils/email/workflow-transform.js", () => ({
  transformWorkflow: vi.fn(),
}));
vi.mock("../../utils/email/workflow-validator.js", () => ({
  validateTransformedWorkflow: vi.fn(),
}));

import { existsSync } from "node:fs";
import * as prompts from "@clack/prompts";
import {
  discoverTemplates,
  loadWrapsConfig,
} from "../../utils/email/template-compiler.js";
import { transformWorkflow } from "../../utils/email/workflow-transform.js";
import {
  discoverWorkflows,
  parseWorkflowTs,
} from "../../utils/email/workflow-ts.js";
import { validateTransformedWorkflow } from "../../utils/email/workflow-validator.js";
import { DeploymentProgress } from "../../utils/shared/output.js";
import { workflowsValidate } from "../email/workflows/validate.js";

describe("workflowsValidate exit code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => {});

    // biome-ignore lint/complexity/useArrowFunction: constructor mock requires regular function for `new`
    vi.mocked(DeploymentProgress).mockImplementation(function () {
      return mockProgress as never;
    });
    vi.mocked(prompts.log).success = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).warn = vi.fn();
    vi.mocked(prompts.log).info = vi.fn();

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadWrapsConfig).mockResolvedValue({} as never);
    vi.mocked(discoverTemplates).mockResolvedValue([]);
    vi.mocked(discoverWorkflows).mockResolvedValue(["a.ts"]);
    vi.mocked(parseWorkflowTs).mockResolvedValue({
      definition: {},
      sourceHash: "h",
      source: "",
    } as never);
    vi.mocked(transformWorkflow).mockReturnValue({
      steps: [],
      transitions: [],
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    setJsonMode(false);
    vi.restoreAllMocks();
  });

  it("leaves the exit code alone when every workflow is valid", async () => {
    vi.mocked(validateTransformedWorkflow).mockReturnValue({
      errors: [],
    } as never);
    await workflowsValidate({});
    expect(process.exitCode).toBeUndefined();
  });

  it("exits 1 when a workflow has validation errors", async () => {
    vi.mocked(validateTransformedWorkflow).mockReturnValue({
      errors: [{ severity: "error", message: "x" }],
    } as never);
    await workflowsValidate({});
    expect(process.exitCode).toBe(1);
  });

  it("exits 1 when a workflow fails to parse", async () => {
    vi.mocked(parseWorkflowTs).mockRejectedValue(new Error("boom"));
    await workflowsValidate({});
    expect(process.exitCode).toBe(1);
  });

  it("exits 1 in JSON mode too", async () => {
    setJsonMode(true);
    vi.mocked(validateTransformedWorkflow).mockReturnValue({
      errors: [{ severity: "error", message: "x" }],
    } as never);
    await workflowsValidate({ json: true });
    expect(process.exitCode).toBe(1);
  });
});
