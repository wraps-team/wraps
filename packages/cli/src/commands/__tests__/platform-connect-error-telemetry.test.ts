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
 * `platform connect` has two failure catches — the authenticated flow's
 * (`connect.ts:967`) and the unauthenticated copy/paste fallback's
 * (`connect.ts:1332`) — and both ended with `trackError(errorCode,
 * "platform:connect", { message: sanitizeErrorMessage(error) })`.
 *
 * Both catches re-`throw error`, so neither is dead-lettered behind a local
 * `process.exit(1)` the way the `sms verify-number` / `email test` sites are.
 * The throw propagates to cli.ts, which hands it to `handleCLIError`, which now
 * sets `process.exitCode` instead of calling `process.exit(1)` — so `run()`'s
 * `finally { await telemetry.shutdown() }` drains the queue and the event is
 * POSTed. This branch is what made these two live.
 *
 * `sanitizeErrorMessage` rewrites 12-digit account IDs, email addresses,
 * domain names and the account segment of an ARN. It does not touch an
 * absolute path, so the OS username and the customer's project directory left
 * the machine attached to the org UUID.
 *
 * Observation point is the telemetry client's debug mode, which serializes the
 * exact event it would send: the real errors.ts -> events.ts -> client.ts
 * chain with the socket swapped for a console.log.
 */

const HOME_PATH_ERROR = new Error(
  "ENOENT: no such file or directory, open '/Users/alice/Projects/northstar-acquisition/.wraps/state'"
);

const holder = vi.hoisted(() => ({
  client: undefined as { track: (e: string, p?: unknown) => void } | undefined,
}));

vi.mock("../../telemetry/client.js", () => ({
  getTelemetryClient: () => holder.client,
}));

vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: { createOrSelectStack: vi.fn() },
    installPulumiCli: vi.fn(),
  },
}));
vi.mock("@aws-sdk/client-iam");
vi.mock("@clack/prompts");
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/config.js");
vi.mock("../../utils/shared/pulumi.js");

import * as clack from "@clack/prompts";
import * as aws from "../../utils/shared/aws.js";
import * as config from "../../utils/shared/config.js";
import { setJsonMode } from "../../utils/shared/json-output.js";
import * as pulumiUtils from "../../utils/shared/pulumi.js";
import { connect } from "../platform/connect.js";

type ClientModule = typeof import("../../telemetry/client.js");
let TelemetryClient: ClientModule["TelemetryClient"];

beforeAll(async () => {
  const actual = await vi.importActual<ClientModule>(
    "../../telemetry/client.js"
  );
  TelemetryClient = actual.TelemetryClient;
});

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

function capturedEvents(): Array<{
  event: string;
  properties: Record<string, unknown>;
}> {
  return consoleLogSpy.mock.calls
    .filter((call) => call[0] === "[Telemetry Debug] Event:")
    .map((call) => JSON.parse(call[1] as string));
}

function errorEvents() {
  return capturedEvents().filter((e) => e.event === "error:occurred");
}

beforeEach(() => {
  vi.clearAllMocks();
  holder.client = new TelemetryClient({ debug: true });

  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
    // captured, not printed
  });
  vi.spyOn(console, "error").mockImplementation(() => {
    // captured, not printed
  });

  const spinner = { start: vi.fn(), stop: vi.fn(), message: vi.fn() };
  vi.mocked(clack.spinner).mockReturnValue(spinner as never);
  vi.mocked(clack.intro).mockImplementation(() => {
    // silent
  });
  vi.mocked(clack.outro).mockImplementation(() => {
    // silent
  });
  vi.mocked(clack.isCancel).mockReturnValue(false);
  vi.mocked(clack.log).info = vi.fn();
  vi.mocked(clack.log).success = vi.fn();
  vi.mocked(clack.log).error = vi.fn();
  vi.mocked(clack.log).warn = vi.fn();
  vi.mocked(clack.log).step = vi.fn();

  vi.mocked(pulumiUtils.ensurePulumiInstalled).mockResolvedValue(false);
  // The step that fails, in both flows.
  vi.mocked(aws.validateAWSCredentials).mockRejectedValue(HOME_PATH_ERROR);
});

afterEach(() => {
  setJsonMode(false);
  vi.restoreAllMocks();
});

function expectPayloadIsClean(sent: {
  event: string;
  properties: Record<string, unknown>;
}) {
  expect(sent.properties).not.toHaveProperty("message");
  const wire = JSON.stringify(sent);
  expect(wire).not.toContain("/Users/alice");
  expect(wire).not.toContain("northstar-acquisition");
  expect(wire).not.toContain("ENOENT");
}

describe("platform connect error telemetry never carries the raw error text", () => {
  it("emits one error:occurred from the authenticated flow (guards the assertions below)", async () => {
    vi.mocked(config.resolveTokenAsync).mockResolvedValue("test-token-123");

    await expect(connect({} as never)).rejects.toThrow();

    const events = errorEvents();
    expect(events).toHaveLength(1);
    expect(events[0].properties.command).toBe("platform:connect");
  });

  it("keeps the home path and project name out of the authenticated flow's payload", async () => {
    vi.mocked(config.resolveTokenAsync).mockResolvedValue("test-token-123");

    await expect(connect({} as never)).rejects.toThrow();

    const [sent] = errorEvents();
    expectPayloadIsClean(sent);
  });

  it("emits one error:occurred from the unauthenticated fallback (guards the assertions below)", async () => {
    vi.mocked(config.resolveTokenAsync).mockResolvedValue(null as never);

    await expect(connect({} as never)).rejects.toThrow();

    const events = errorEvents();
    expect(events).toHaveLength(1);
    expect(events[0].properties.command).toBe("platform:connect");
  });

  it("keeps them out of the unauthenticated fallback's payload too", async () => {
    vi.mocked(config.resolveTokenAsync).mockResolvedValue(null as never);

    await expect(connect({} as never)).rejects.toThrow();

    const [sent] = errorEvents();
    expectPayloadIsClean(sent);
  });

  it("still reports the error code, so connect failures stay buckettable", async () => {
    vi.mocked(config.resolveTokenAsync).mockResolvedValue("test-token-123");

    await expect(connect({} as never)).rejects.toThrow();

    const [sent] = errorEvents();
    expect(sent.properties.error_code).toBe("Error");
  });
});
