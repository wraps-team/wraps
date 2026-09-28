/**
 * Unit tests for `wraps email vdm` — show, and (with `--enable`/`--disable`)
 * switch, Virtual Deliverability Manager for the account.
 *
 * Mocking shape follows `plan.test.ts`: the AWS SDK boundary is mocked via
 * `aws-sdk-client-mock` (SESv2 + STS), while the real `emailVdm` control
 * flow — including the `aws.ts` helpers it calls — runs unmocked.
 */

import {
  GetAccountCommand,
  PutAccountVdmAttributesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../../utils/shared/json-output.js";

const stsMock = mockClient(STSClient);
const sesv2Mock = mockClient(SESv2Client);

vi.mock("../../../utils/shared/aws-detection.js", () => ({
  detectAWSState: vi.fn().mockResolvedValue({
    cliInstalled: true,
    cliVersion: "2.15.0",
    credentialsConfigured: true,
    credentialSource: "environment",
    profileName: "default",
    accountId: "123456789012",
    detectedProvider: null,
    region: "us-east-1",
    sso: {
      configured: false,
      profiles: [],
      sessions: [],
      tokenStatus: null,
      activeProfile: null,
    },
  }),
  getCurrentProfile: vi.fn().mockReturnValue("default"),
  getConfiguredProfiles: vi.fn().mockReturnValue([]),
  getSSOLoginCommand: vi.fn().mockReturnValue("aws sso login"),
}));

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
  confirm: vi.fn(),
  select: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    step: vi.fn(),
  },
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock("../../../telemetry/client.js", () => ({
  getTelemetryClient: vi.fn().mockReturnValue({
    showFooterOnce: vi.fn(),
    track: vi.fn(),
    shutdown: vi.fn(),
  }),
}));

vi.mock("../../../telemetry/events.js", () => ({
  trackCommand: vi.fn(),
}));

vi.mock("../../../utils/shared/metadata.js", () => ({
  findConnectionsWithService: vi
    .fn()
    .mockResolvedValue([{ accountId: "123456789012", region: "us-east-1" }]),
}));

// Imports after mocks so `emailVdm` and its dependencies pick up the mocked
// modules.
import * as clack from "@clack/prompts";
import { emailVdm } from "../vdm.js";

const ACCOUNT_ID = "123456789012";

function defaultIdentity() {
  return {
    Account: ACCOUNT_ID,
    UserId: "AIDAI123456789",
    Arn: `arn:aws:iam::${ACCOUNT_ID}:user/test`,
  };
}

/** Concatenate every console.log call into one string, for substring assertions. */
function loggedText(consoleLogSpy: ReturnType<typeof vi.spyOn>): string {
  return consoleLogSpy.mock.calls.map((call) => String(call[0])).join("\n");
}

describe("email vdm command", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stsMock.reset();
    sesv2Mock.reset();
    vi.clearAllMocks();

    stsMock.on(GetCallerIdentityCommand).resolves(defaultIdentity());

    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // swallow
    });

    setJsonMode(false);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleLogSpy.mockRestore();
    setJsonMode(false);
  });

  it("read path, VDM off on ESSENTIALS, prints the included-but-off line and makes zero Put calls", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      PricingAttributes: { CurrentPlan: "ESSENTIALS" },
      VdmAttributes: { VdmEnabled: "DISABLED" },
    });

    await emailVdm({});

    const text = loggedText(consoleLogSpy);
    expect(text).toContain("included in your Essentials plan");
    expect(text).toContain("switched off");
    expect(sesv2Mock.commandCalls(PutAccountVdmAttributesCommand)).toHaveLength(
      0
    );
  });

  it("read path on à la carte (NONE) prints the add-on line", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      PricingAttributes: { CurrentPlan: "NONE" },
      VdmAttributes: { VdmEnabled: "DISABLED" },
    });

    await emailVdm({});

    const text = loggedText(consoleLogSpy);
    expect(text).toContain("billed as an add-on");
  });

  it("--enable --yes from fully off sends one Put with all three attributes ENABLED and re-reads", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      PricingAttributes: { CurrentPlan: "ESSENTIALS" },
      VdmAttributes: { VdmEnabled: "DISABLED" },
    });
    sesv2Mock.on(PutAccountVdmAttributesCommand).resolves({});

    await emailVdm({ enable: true, yes: true });

    const putCalls = sesv2Mock.commandCalls(PutAccountVdmAttributesCommand);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].args[0].input).toEqual({
      VdmAttributes: {
        VdmEnabled: "ENABLED",
        DashboardAttributes: { EngagementMetrics: "ENABLED" },
        GuardianAttributes: { OptimizedSharedDelivery: "ENABLED" },
      },
    });
    expect(
      sesv2Mock.commandCalls(GetAccountCommand).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("--enable --no-optimized-delivery --yes disables OptimizedSharedDelivery in the Put", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      PricingAttributes: { CurrentPlan: "ESSENTIALS" },
      VdmAttributes: { VdmEnabled: "DISABLED" },
    });
    sesv2Mock.on(PutAccountVdmAttributesCommand).resolves({});

    await emailVdm({ enable: true, optimizedDelivery: false, yes: true });

    const putCalls = sesv2Mock.commandCalls(PutAccountVdmAttributesCommand);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].args[0].input).toMatchObject({
      VdmAttributes: {
        GuardianAttributes: { OptimizedSharedDelivery: "DISABLED" },
      },
    });
  });

  it("makes zero Put calls when the requested state already matches the current state", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      PricingAttributes: { CurrentPlan: "ESSENTIALS" },
      VdmAttributes: {
        VdmEnabled: "ENABLED",
        DashboardAttributes: { EngagementMetrics: "ENABLED" },
        GuardianAttributes: { OptimizedSharedDelivery: "ENABLED" },
      },
    });

    await emailVdm({ enable: true, yes: true });

    expect(sesv2Mock.commandCalls(PutAccountVdmAttributesCommand)).toHaveLength(
      0
    );
  });

  it("--enable --disable throws CONFLICTING_VDM_FLAGS", async () => {
    let caught: unknown;
    try {
      await emailVdm({ enable: true, disable: true, yes: true });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error & { code?: string }).code).toBe(
      "CONFLICTING_VDM_FLAGS"
    );
    expect(sesv2Mock.commandCalls(GetAccountCommand)).toHaveLength(0);
  });

  it("--enable non-interactive without --yes throws CONFIRMATION_REQUIRED and makes zero Put calls", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      PricingAttributes: { CurrentPlan: "ESSENTIALS" },
      VdmAttributes: { VdmEnabled: "DISABLED" },
    });

    let caught: unknown;
    try {
      await emailVdm({ enable: true });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error & { code?: string }).code).toBe(
      "CONFIRMATION_REQUIRED"
    );
    expect(sesv2Mock.commandCalls(PutAccountVdmAttributesCommand)).toHaveLength(
      0
    );
  });

  it("Put rejected with a name:Error / message-carried BadRequestException throws SES_VDM_CHANGE_REJECTED", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      PricingAttributes: { CurrentPlan: "ESSENTIALS" },
      VdmAttributes: { VdmEnabled: "DISABLED" },
    });
    const rejected = new Error("BadRequestException: plan does not allow VDM");
    rejected.name = "Error";
    sesv2Mock.on(PutAccountVdmAttributesCommand).rejects(rejected);

    let caught: unknown;
    try {
      await emailVdm({ enable: true, yes: true });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error & { code?: string }).code).toBe(
      "SES_VDM_CHANGE_REJECTED"
    );
  });

  it("GetAccount access-denied surfaces the IAM permission error, not a silent 'VDM off'", async () => {
    const denied = new Error("User is not authorized to perform this action");
    denied.name = "AccessDeniedException";
    sesv2Mock.on(GetAccountCommand).rejects(denied);

    let caught: unknown;
    try {
      await emailVdm({});
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    const message = (caught as Error).message;
    expect(message).toContain("ses:GetAccount");
  });

  it("--disable while VDM is currently on prints the 'enabled outside Wraps' warning before confirming", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      PricingAttributes: { CurrentPlan: "ESSENTIALS" },
      VdmAttributes: {
        VdmEnabled: "ENABLED",
        DashboardAttributes: { EngagementMetrics: "ENABLED" },
        GuardianAttributes: { OptimizedSharedDelivery: "ENABLED" },
      },
    });
    sesv2Mock.on(PutAccountVdmAttributesCommand).resolves({});

    await emailVdm({ disable: true, yes: true });

    const text = loggedText(consoleLogSpy);
    expect(text).toContain("may have been enabled outside Wraps");
    expect(clack.confirm).not.toHaveBeenCalled();
  });
});
