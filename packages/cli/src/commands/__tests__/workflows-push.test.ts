/**
 * Workflows Push Command Tests
 *
 * `push` must exit non-zero on validation failure, conflicts, sync errors and
 * a missing API target; show per-node validation messages; and say so when a
 * workflow was left paused.
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
vi.mock("../../utils/shared/lockfile.js", () => ({
  loadLockfile: vi.fn(),
  saveLockfile: vi.fn(),
}));
vi.mock("../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));
vi.mock("../../utils/shared/push-org.js", () => ({
  resolvePushOrg: vi.fn(),
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
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../utils/shared/api-target.js";
import { loadLockfile, saveLockfile } from "../../utils/shared/lockfile.js";
import { DeploymentProgress } from "../../utils/shared/output.js";
import { resolvePushOrg } from "../../utils/shared/push-org.js";
import { workflowsPush } from "../email/workflows/push.js";

function response(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("workflowsPush", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    setJsonMode(false);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    // biome-ignore lint/complexity/useArrowFunction: constructor mock requires regular function for `new`
    vi.mocked(DeploymentProgress).mockImplementation(function () {
      return mockProgress as never;
    });
    vi.mocked(prompts.log).success = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).warn = vi.fn();
    vi.mocked(prompts.log).info = vi.fn();

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(loadWrapsConfig).mockResolvedValue({ org: "acme" } as never);
    vi.mocked(discoverTemplates).mockResolvedValue([]);
    vi.mocked(discoverWorkflows).mockResolvedValue(["a.ts"]);
    vi.mocked(parseWorkflowTs).mockResolvedValue({
      definition: { name: "A" },
      sourceHash: "h",
      source: "",
    } as never);
    vi.mocked(transformWorkflow).mockReturnValue({
      steps: [],
      transitions: [],
      triggerType: "contact_created",
      triggerConfig: {},
    } as never);
    vi.mocked(validateTransformedWorkflow).mockReturnValue({
      errors: [],
    } as never);
    vi.mocked(loadLockfile).mockResolvedValue({
      workflows: {},
      templates: {},
    } as never);
    vi.mocked(saveLockfile).mockResolvedValue(undefined as never);
    vi.mocked(resolveApiTarget).mockResolvedValue({} as never);
    vi.mocked(resolvePushOrg).mockResolvedValue(null);
    vi.mocked(checkApiTarget).mockReturnValue({
      ok: true,
      target: { apiBase: "https://api.test", token: "t" },
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    setJsonMode(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exits 0 when the workflow syncs enabled", async () => {
    fetchMock.mockResolvedValue(
      response(200, { id: "1", slug: "a", status: "enabled" })
    );
    await workflowsPush({});
    expect(process.exitCode).toBeUndefined();
  });

  it("warns when a workflow was left paused, and still exits 0", async () => {
    fetchMock.mockResolvedValue(
      response(200, { id: "1", slug: "a", status: "paused" })
    );
    await workflowsPush({});
    expect(process.exitCode).toBeUndefined();
    const warnings = vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]));
    expect(warnings.some((m) => m.includes("left paused"))).toBe(true);
  });

  it("warns why a scheduled workflow was saved as draft", async () => {
    fetchMock.mockResolvedValue(
      response(200, {
        id: "1",
        slug: "a",
        status: "draft",
        scheduleError: "bad cron",
      })
    );
    await workflowsPush({});
    const warnings = vi
      .mocked(prompts.log.warn)
      .mock.calls.map((c) => String(c[0]));
    expect(
      warnings.some(
        (m) =>
          m.includes("schedule could not be registered") &&
          m.includes("bad cron")
      )
    ).toBe(true);
  });

  it("exits 1 on a dashboard conflict", async () => {
    fetchMock.mockResolvedValue(response(409, {}));
    await workflowsPush({});
    expect(process.exitCode).toBe(1);
  });

  it("exits 1 on an API error", async () => {
    fetchMock.mockResolvedValue(response(500, "server exploded"));
    await workflowsPush({});
    expect(process.exitCode).toBe(1);
  });

  it("exits 1 when there is no API target", async () => {
    vi.mocked(checkApiTarget).mockReturnValue({
      ok: false,
      reason: "No API token",
      suggestion: "Run: wraps auth login",
    } as never);
    await workflowsPush({});
    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exits 1 on validation errors, prints the node, and never calls the API", async () => {
    vi.mocked(validateTransformedWorkflow).mockReturnValue({
      errors: [{ severity: "error", nodeId: "node-1", message: "bad step" }],
    } as never);
    await workflowsPush({});
    expect(process.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const lines = consoleLogSpy.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes("[node-1]"))).toBe(true);
  });

  it("exits 0 on a valid dry run without calling the API", async () => {
    await workflowsPush({ dryRun: true });
    expect(process.exitCode).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
