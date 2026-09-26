/**
 * Unit tests for `wraps email production-access` — show the account's SES
 * production-access / review state and (with `--request`) file the request.
 *
 * Mocking shape follows `plan.test.ts`: the AWS SDK boundary is mocked via
 * `aws-sdk-client-mock` (SESv2 + STS), while the real `emailProductionAccess`
 * control flow — including the `aws.ts` helpers it calls — runs unmocked.
 */

import {
  GetAccountCommand,
  PutAccountDetailsCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../../utils/shared/json-output.js";

const stsMock = mockClient(STSClient);
const sesv2Mock = mockClient(SESv2Client);

// Mock aws-detection to prevent real filesystem reads (SSO cache, AWS config).
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
  text: vi.fn(),
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

vi.mock("../../../utils/shared/prompts.js", () => ({
  isInteractive: vi.fn().mockReturnValue(false),
}));

// Imports after mocks so `emailProductionAccess` and its dependencies pick up
// the mocked modules.
import * as clack from "@clack/prompts";
import * as metadata from "../../../utils/shared/metadata.js";
import * as prompts from "../../../utils/shared/prompts.js";
import { emailProductionAccess } from "../production-access.js";

const ACCOUNT_ID = "123456789012";

function defaultIdentity() {
  return {
    Account: ACCOUNT_ID,
    UserId: "AIDAI123456789",
    Arn: `arn:aws:iam::${ACCOUNT_ID}:user/test`,
  };
}

/** Pull the `email.production-access` JSON envelope out of the console.log spy. */
function readJsonEnvelope(consoleLogSpy: ReturnType<typeof vi.spyOn>) {
  const call = consoleLogSpy.mock.calls.find(([arg]) => {
    if (typeof arg !== "string") {
      return false;
    }
    try {
      return JSON.parse(arg).command === "email.production-access";
    } catch {
      return false;
    }
  });
  if (!call) {
    throw new Error("No email.production-access JSON envelope was logged");
  }
  return JSON.parse(call[0] as string);
}

describe("email production-access command", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stsMock.reset();
    sesv2Mock.reset();
    vi.clearAllMocks();

    stsMock.on(GetCallerIdentityCommand).resolves(defaultIdentity());
    vi.mocked(metadata.findConnectionsWithService).mockResolvedValue([
      { accountId: ACCOUNT_ID, region: "us-east-1" },
    ] as never);
    vi.mocked(clack.isCancel).mockReturnValue(false);
    vi.mocked(prompts.isInteractive).mockReturnValue(false);

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

  it("read path, sandbox, no review", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: false,
    });

    setJsonMode(true);
    await emailProductionAccess({ json: true });

    const envelope = readJsonEnvelope(consoleLogSpy);
    expect(envelope.data.mode).toBe("read");
    expect(envelope.data.productionAccessEnabled).toBe(false);
    expect(envelope.data.review).toBeNull();
    expect(envelope.data.nextAction).toContain("--request");
    const region = "us-east-1";
    expect(envelope.data.nextAction).toContain(
      `https://${region}.console.aws.amazon.com/ses/home?region=${region}#/account`
    );

    expect(sesv2Mock.commandCalls(PutAccountDetailsCommand)).toHaveLength(0);
  });

  it("read path, PENDING with case id", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: false,
      Details: {
        ReviewDetails: { Status: "PENDING", CaseId: "1234" },
      },
    });

    setJsonMode(true);
    await emailProductionAccess({ json: true });

    const envelope = readJsonEnvelope(consoleLogSpy);
    expect(envelope.data.review.status).toBe("PENDING");
    expect(envelope.data.review.caseId).toBe("1234");
    expect(envelope.data.nextAction).toContain("24h");
  });

  it("--request when already enabled rejects without prompting or mutating", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: true,
    });

    let caught: unknown;
    try {
      await emailProductionAccess({
        request: true,
        yes: true,
        website: "https://x.dev",
        mailType: "transactional",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as Error & { code?: string }).code).toBe(
      "PRODUCTION_ACCESS_ALREADY_ENABLED"
    );
    expect(clack.confirm).not.toHaveBeenCalled();
    expect(sesv2Mock.commandCalls(PutAccountDetailsCommand)).toHaveLength(0);
  });

  it("--request when PENDING rejects without mutating", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: false,
      Details: {
        ReviewDetails: { Status: "PENDING", CaseId: "5678" },
      },
    });

    let caught: unknown;
    try {
      await emailProductionAccess({
        request: true,
        yes: true,
        website: "https://x.dev",
        mailType: "transactional",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as Error & { code?: string }).code).toBe(
      "PRODUCTION_ACCESS_PENDING"
    );
    expect(sesv2Mock.commandCalls(PutAccountDetailsCommand)).toHaveLength(0);
  });

  it("--request non-interactive without --yes does not mutate", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: false,
    });

    await expect(
      emailProductionAccess({
        request: true,
        website: "https://x.dev",
        mailType: "transactional",
      })
    ).rejects.toThrow();

    expect(clack.confirm).not.toHaveBeenCalled();
    expect(sesv2Mock.commandCalls(PutAccountDetailsCommand)).toHaveLength(0);
  });

  it("--request --yes --website --mail-type --contact sends exactly one Put and re-reads GetAccount", async () => {
    sesv2Mock
      .on(GetAccountCommand)
      .resolvesOnce({ ProductionAccessEnabled: false })
      .resolvesOnce({
        ProductionAccessEnabled: false,
        Details: { ReviewDetails: { Status: "PENDING" } },
      });
    sesv2Mock.on(PutAccountDetailsCommand).resolves({});

    setJsonMode(true);
    await emailProductionAccess({
      request: true,
      yes: true,
      website: "https://x.dev",
      mailType: "transactional",
      contact: "a@x.dev",
      json: true,
    });

    const putCalls = sesv2Mock.commandCalls(PutAccountDetailsCommand);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].args[0].input).toEqual({
      MailType: "TRANSACTIONAL",
      WebsiteURL: "https://x.dev",
      ContactLanguage: "EN",
      AdditionalContactEmailAddresses: ["a@x.dev"],
      ProductionAccessEnabled: true,
    });

    expect(sesv2Mock.commandCalls(GetAccountCommand)).toHaveLength(2);

    const envelope = readJsonEnvelope(consoleLogSpy);
    expect(envelope.data.mode).toBe("request");
    expect(envelope.data.after.reviewStatus).toBe("PENDING");
  });

  it("--request --yes with --mail-type bogus rejects INVALID_MAIL_TYPE and makes no Put", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: false,
    });

    let caught: unknown;
    try {
      await emailProductionAccess({
        request: true,
        yes: true,
        website: "https://x.dev",
        mailType: "bogus",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as Error & { code?: string }).code).toBe(
      "INVALID_MAIL_TYPE"
    );
    expect(sesv2Mock.commandCalls(PutAccountDetailsCommand)).toHaveLength(0);
  });

  it("--request --yes with 5 contacts rejects INVALID_CONTACT_EMAIL and makes no Put", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: false,
    });

    let caught: unknown;
    try {
      await emailProductionAccess({
        request: true,
        yes: true,
        website: "https://x.dev",
        mailType: "transactional",
        contact: "a@x.dev,b@x.dev,c@x.dev,d@x.dev,e@x.dev",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as Error & { code?: string }).code).toBe(
      "INVALID_CONTACT_EMAIL"
    );
    expect(sesv2Mock.commandCalls(PutAccountDetailsCommand)).toHaveLength(0);
  });

  it("surfaces an actionable access-denied message when Put is denied (name: Error trap)", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: false,
    });
    const denied = Object.assign(new Error("AccessDeniedException"), {
      name: "Error",
    });
    sesv2Mock.on(PutAccountDetailsCommand).rejects(denied);

    let caught: unknown;
    try {
      await emailProductionAccess({
        request: true,
        yes: true,
        website: "https://x.dev",
        mailType: "transactional",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as Error & { code?: string }).code).toBe(
      "IAM_PERMISSION_DENIED"
    );
    expect((caught as Error).message).toContain("ses:PutAccountDetails");
  });

  it("Put conflict maps to PRODUCTION_ACCESS_PENDING", async () => {
    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: false,
    });
    const conflict = Object.assign(new Error("Conflict"), {
      name: "ConflictException",
    });
    sesv2Mock.on(PutAccountDetailsCommand).rejects(conflict);

    let caught: unknown;
    try {
      await emailProductionAccess({
        request: true,
        yes: true,
        website: "https://x.dev",
        mailType: "transactional",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as Error & { code?: string }).code).toBe(
      "PRODUCTION_ACCESS_PENDING"
    );
  });

  it("interactive prompts collect website and mail type, then submit", async () => {
    vi.mocked(prompts.isInteractive).mockReturnValue(true);
    vi.mocked(clack.text).mockResolvedValue("https://x.dev" as never);
    vi.mocked(clack.select).mockResolvedValue("marketing" as never);
    vi.mocked(clack.confirm).mockResolvedValue(true as never);

    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: false,
    });
    sesv2Mock.on(PutAccountDetailsCommand).resolves({});

    await emailProductionAccess({ request: true });

    const putCalls = sesv2Mock.commandCalls(PutAccountDetailsCommand);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].args[0].input.MailType).toBe("MARKETING");
    expect(putCalls[0].args[0].input.WebsiteURL).toBe("https://x.dev");
  });
});
