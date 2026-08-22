import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * `email upgrade`'s deploy catch (`upgrade.ts:2126`) ended with
 *
 *   trackError("UPGRADE_FAILED", "email:upgrade", {
 *     step: "deploy",
 *     error_detail: redactSensitiveValues(msg).slice(0, 3000),
 *   });
 *   throw new Error(`Pulumi upgrade failed: ...`);
 *
 * The `throw` leaves `upgrade()` — there is no outer catch and no local
 * `process.exit(1)` — so it reaches cli.ts and `handleCLIError`, which now sets
 * `process.exitCode` rather than calling `process.exit(1)`. `run()`'s
 * `finally { await telemetry.shutdown() }` then drains the queue, which is what
 * made this payload live on this branch.
 *
 * `redactSensitiveValues` rewrites account IDs, email addresses and domain
 * names; it leaves absolute paths alone. So up to 3KB of Pulumi output —
 * including the local work directory, the OS username and the customer's
 * project directory — was POSTed alongside the org UUID.
 *
 * Observation point is the telemetry client's debug mode, which serializes the
 * exact event it would send.
 */

const PULUMI_ERROR = new Error(
  [
    "update failed",
    "  error: pulumi:pulumi:Stack wraps-email-dev create error:",
    "  failed reading state from /Users/alice/Projects/northstar-acquisition/.wraps/pulumi/state.json",
  ].join("\n")
);

const holder = vi.hoisted(() => ({
  client: undefined as { track: (e: string, p?: unknown) => void } | undefined,
}));

vi.mock("../../telemetry/client.js", () => ({
  getTelemetryClient: () => holder.client,
}));

vi.mock("@aws-sdk/client-route-53", () => ({
  Route53Client: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  ListHostedZonesByNameCommand: vi.fn(),
  ChangeResourceRecordSetsCommand: vi.fn(),
}));

vi.mock("../../utils/shared/s3-state.js", () => ({
  getStateBucketName: vi.fn(() => "wraps-state-123456789012-us-east-1"),
  getS3BackendUrl: vi.fn(() => "s3://wraps-state-123456789012-us-east-1"),
  stateBucketExists: vi.fn().mockResolvedValue(false),
  ensureStateBucket: vi.fn().mockResolvedValue(undefined),
  uploadMetadata: vi.fn().mockResolvedValue(undefined),
  deleteMetadata: vi.fn().mockResolvedValue(undefined),
  clearS3StackLocks: vi.fn().mockResolvedValue(undefined),
  downloadMetadata: vi.fn().mockResolvedValue(null),
  needsMigration: vi.fn().mockResolvedValue(false),
  migrateLocalPulumiState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: { createOrSelectStack: vi.fn() },
    installPulumiCli: vi.fn(),
  },
}));
vi.mock("@pulumi/pulumi/automation", () => ({
  LocalWorkspace: { createOrSelectStack: vi.fn() },
  installPulumiCli: vi.fn(),
}));
vi.mock("@clack/prompts");
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/pulumi.js");
vi.mock("../../utils/shared/fs.js");
vi.mock("../../utils/shared/metadata.js", async () => {
  const actual = await vi.importActual("../../utils/shared/metadata.js");
  return {
    ...actual,
    loadConnectionMetadata: vi.fn(),
    saveConnectionMetadata: vi.fn(),
    updateEmailConfig: vi.fn(),
    findConnectionsWithService: vi.fn().mockResolvedValue([]),
    findConnectionsForAccount: vi.fn().mockResolvedValue([]),
  };
});
vi.mock("../../utils/shared/prompts.js");
vi.mock("../../infrastructure/email-stack.js");
vi.mock("../../utils/email/event-pipeline-check.js", () => ({
  checkEventPipeline: vi.fn().mockResolvedValue([]),
}));

import * as prompts from "@clack/prompts";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import * as aws from "../../utils/shared/aws.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as metadata from "../../utils/shared/metadata.js";
import * as promptUtils from "../../utils/shared/prompts.js";
import * as pulumiUtils from "../../utils/shared/pulumi.js";
import { upgrade } from "../email/upgrade.js";

type ClientModule = typeof import("../../telemetry/client.js");
let TelemetryClient: ClientModule["TelemetryClient"];

beforeAll(async () => {
  const actual = await vi.importActual<ClientModule>(
    "../../telemetry/client.js"
  );
  TelemetryClient = actual.TelemetryClient;
});

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

function errorEvents(): Array<{
  event: string;
  properties: Record<string, unknown>;
}> {
  return consoleLogSpy.mock.calls
    .filter((call) => call[0] === "[Telemetry Debug] Event:")
    .map((call) => JSON.parse(call[1] as string))
    .filter((e) => e.event === "error:occurred");
}

const STARTER_CONFIG = {
  domain: "example.com",
  tracking: { enabled: true, opens: true, clicks: true },
  tlsRequired: true,
  reputationMetrics: false,
  suppressionList: { enabled: true, reasons: ["BOUNCE", "COMPLAINT"] },
  eventTracking: { enabled: false },
  emailArchiving: { enabled: false, retention: "30days" },
  sendingEnabled: true,
};

beforeEach(async () => {
  vi.clearAllMocks();
  holder.client = new TelemetryClient({ debug: true });

  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
    // captured, not printed
  });
  vi.spyOn(console, "error").mockImplementation(() => {
    // captured, not printed
  });

  const mockSpinner = { start: vi.fn(), stop: vi.fn(), message: vi.fn() };
  vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as never);
  vi.mocked(prompts.intro).mockImplementation(() => {
    // silent
  });
  vi.mocked(prompts.outro).mockImplementation(() => {
    // silent
  });
  vi.mocked(prompts.note).mockImplementation(() => {
    // silent
  });
  vi.mocked(prompts.log).info = vi.fn();
  vi.mocked(prompts.log).success = vi.fn();
  vi.mocked(prompts.log).error = vi.fn();
  vi.mocked(prompts.log).warn = vi.fn();
  vi.mocked(prompts.log).step = vi.fn();
  vi.mocked(prompts.isCancel).mockReturnValue(false);

  vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
    accountId: "123456789012",
    userId: "AIDACKCEVSQ6C2EXAMPLE",
    arn: "arn:aws:iam::123456789012:user/test",
  });
  vi.mocked(aws.getAWSRegion).mockResolvedValue("us-east-1");
  vi.mocked(aws.listSESDomains).mockResolvedValue([
    { domain: "example.com", verified: true },
  ]);

  vi.mocked(pulumiUtils.ensurePulumiInstalled).mockResolvedValue(false);
  vi.mocked(fsUtils.ensurePulumiWorkDir).mockReturnValue(undefined as never);
  vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");

  vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
    accountId: "123456789012",
    region: "us-east-1",
    provider: "vercel",
    timestamp: new Date().toISOString(),
    services: {
      email: {
        config: STARTER_CONFIG,
        preset: "starter",
        pulumiStackName: "wraps-123456789012-us-east-1",
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
  } as any);
  vi.mocked(metadata.saveConnectionMetadata).mockResolvedValue(undefined);
  vi.mocked(metadata.updateEmailConfig).mockImplementation(() => {
    // no-op
  });

  vi.mocked(promptUtils.promptVercelConfig).mockResolvedValue({
    teamSlug: "my-team",
  });

  vi.mocked(deployEmailStack).mockResolvedValue({
    roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
    configSetName: "wraps-email-tracking",
    tableName: "wraps-email-history",
    region: "us-east-1",
    lambdaFunctions: ["wraps-email-processor"],
    domain: "example.com",
    dkimTokens: ["token1", "token2", "token3"],
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
  } as any);

  // The Pulumi deploy that fails, taking upgrade.ts into its UPGRADE_FAILED
  // catch with a message that carries an absolute home path.
  const pulumi = await import("@pulumi/pulumi");
  const pulumiAutomation = await import("@pulumi/pulumi/automation");
  const mockStack = {
    workspace: { selectStack: vi.fn().mockResolvedValue(undefined) },
    setConfig: vi.fn().mockResolvedValue(undefined),
    refresh: vi
      .fn()
      .mockResolvedValue({ summary: { kind: "refresh", result: "succeeded" } }),
    up: vi.fn().mockRejectedValue(PULUMI_ERROR),
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
  } as any;
  // biome-ignore lint/suspicious/noExplicitAny: test fixture
  const createOrSelectStack = vi.fn().mockImplementation(async (args: any) => {
    if (args.program) {
      await args.program();
    }
    return mockStack;
  });
  vi.mocked(
    pulumi.automation.LocalWorkspace.createOrSelectStack
  ).mockImplementation(createOrSelectStack);
  vi.mocked(
    pulumiAutomation.LocalWorkspace.createOrSelectStack
  ).mockImplementation(createOrSelectStack);

  vi.mocked(prompts.select)
    .mockResolvedValueOnce("preset" as never)
    .mockResolvedValueOnce("production" as never);
  vi.mocked(prompts.confirm).mockResolvedValue(true as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("email upgrade error telemetry never carries the raw Pulumi output", () => {
  it("emits one UPGRADE_FAILED event (guards the assertions below)", async () => {
    await expect(upgrade({})).rejects.toThrow(/Pulumi upgrade failed/);

    const events = errorEvents();
    expect(events).toHaveLength(1);
    expect(events[0].properties.error_code).toBe("UPGRADE_FAILED");
    expect(events[0].properties.command).toBe("email:upgrade");
  });

  it("keeps the home path and project name out of the payload", async () => {
    await expect(upgrade({})).rejects.toThrow(/Pulumi upgrade failed/);

    const [sent] = errorEvents();
    expect(sent.properties).not.toHaveProperty("error_detail");
    const wire = JSON.stringify(sent);
    expect(wire).not.toContain("/Users/alice");
    expect(wire).not.toContain("northstar-acquisition");
  });

  it("still reports the step, so deploy failures stay buckettable", async () => {
    await expect(upgrade({})).rejects.toThrow(/Pulumi upgrade failed/);

    const [sent] = errorEvents();
    expect(sent.properties.step).toBe("deploy");
  });
});
