import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import {
  GetIdentityVerificationAttributesCommand,
  ListIdentitiesCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import {
  GetAccountCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";
import { emailStatus } from "../email/status.js";

const stsMock = mockClient(STSClient);
const sesMock = mockClient(SESClient);
const sesv2Mock = mockClient(SESv2Client);
const cfnMock = mockClient(CloudFormationClient);

// Mock Pulumi
vi.mock("@pulumi/pulumi/automation", () => ({
  LocalWorkspace: {
    selectStack: vi.fn(),
  },
}));

vi.mock("@pulumi/pulumi", async () => {
  const automation = await import("@pulumi/pulumi/automation");
  return {
    automation,
  };
});

vi.mock("../../utils/shared/pulumi.js", () => ({
  ensurePulumiInstalled: vi.fn().mockResolvedValue(false),
}));

// Mock aws-detection to prevent real filesystem reads (SSO cache, AWS config)
vi.mock("../../utils/shared/aws-detection.js", () => ({
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

// Mock clack
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

// Mock output module
vi.mock("../../utils/shared/output.js", async () => {
  const actual = await vi.importActual("../../utils/shared/output.js");
  return {
    ...actual,
    displayStatus: vi.fn(),
  };
});

// Mock fs module
vi.mock("../../utils/shared/fs.js", () => ({
  getPulumiWorkDir: () => "/mock/pulumi/dir",
  ensurePulumiWorkDir: vi.fn().mockResolvedValue(undefined),
}));

// Mock metadata module
vi.mock("../../utils/shared/metadata.js", () => ({
  findConnectionsWithService: vi.fn().mockResolvedValue([]),
  loadConnectionMetadata: vi.fn().mockResolvedValue(null),
  listConnections: vi.fn().mockResolvedValue([]),
}));

describe("email status command", () => {
  let exitSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    stsMock.reset();
    sesMock.reset();
    sesv2Mock.reset();
    cfnMock.reset();
    vi.clearAllMocks();

    // Explicit default so every pre-existing test asserts against a value
    // someone chose, not the { ProductionAccessEnabled: undefined } an
    // unstubbed GetAccountCommand resolves to under aws-sdk-client-mock
    // (which getSESAccountStatus would otherwise read as sandbox: true).
    sesv2Mock.on(GetAccountCommand).resolves({
      ProductionAccessEnabled: true,
      SendQuota: {
        Max24HourSend: 50_000,
        MaxSendRate: 14,
        SentLast24Hours: 120,
      },
      EnforcementStatus: "HEALTHY",
    });

    // Default: no CloudFormation stacks, permission to check is present.
    cfnMock.on(DescribeStacksCommand).resolves({ Stacks: [] });

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it("should exit with error when AWS credentials are invalid", async () => {
    stsMock
      .on(GetCallerIdentityCommand)
      .rejects(new Error("Invalid credentials"));

    await expect(emailStatus({})).rejects.toThrow();
  });

  it("should exit when no Pulumi stack is found", async () => {
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: "123456789012",
      UserId: "AIDAI123456789",
      Arn: "arn:aws:iam::123456789012:user/test",
    });

    const { LocalWorkspace } = await import("@pulumi/pulumi/automation");
    vi.mocked(LocalWorkspace.selectStack).mockRejectedValue(
      new Error("Stack not found")
    );

    sesMock.on(ListIdentitiesCommand).resolves({ Identities: [] });

    await emailStatus({});

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should display email status when stack exists with dashboard-only integration", async () => {
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: "123456789012",
      UserId: "AIDAI123456789",
      Arn: "arn:aws:iam::123456789012:user/test",
    });

    const { LocalWorkspace } = await import("@pulumi/pulumi/automation");
    vi.mocked(LocalWorkspace.selectStack).mockResolvedValue({
      outputs: vi.fn().mockResolvedValue({
        roleArn: { value: "arn:aws:iam::123456789012:role/wraps-email-role" },
        region: { value: "us-east-1" },
      }),
    } as any);

    sesMock
      .on(ListIdentitiesCommand)
      .resolves({ Identities: ["example.com"] })
      .on(GetIdentityVerificationAttributesCommand)
      .resolves({
        VerificationAttributes: {
          "example.com": { VerificationStatus: "Success" },
        },
      });

    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      DkimAttributes: {
        Tokens: ["token1", "token2", "token3"],
        Status: "SUCCESS",
      },
    });

    const { displayStatus } = await import("../../utils/shared/output.js");

    await emailStatus({});

    expect(displayStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationLevel: "dashboard-only",
        region: "us-east-1",
      })
    );
  });

  it("should display email status with enhanced integration when configSet exists", async () => {
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: "123456789012",
      UserId: "AIDAI123456789",
      Arn: "arn:aws:iam::123456789012:user/test",
    });

    const { LocalWorkspace } = await import("@pulumi/pulumi/automation");
    vi.mocked(LocalWorkspace.selectStack).mockResolvedValue({
      outputs: vi.fn().mockResolvedValue({
        roleArn: { value: "arn:aws:iam::123456789012:role/wraps-email-role" },
        configSetName: { value: "wraps-tracking" },
        tableName: { value: "wraps-email-history" },
        lambdaFunctions: { value: ["fn1", "fn2"] },
        region: { value: "us-east-1" },
      }),
    } as any);

    sesMock
      .on(ListIdentitiesCommand)
      .resolves({ Identities: [] })
      .on(GetIdentityVerificationAttributesCommand)
      .resolves({ VerificationAttributes: {} });

    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      DkimAttributes: {
        Tokens: [],
        Status: "SUCCESS",
      },
    });

    const { displayStatus } = await import("../../utils/shared/output.js");

    await emailStatus({});

    expect(displayStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationLevel: "enhanced",
        resources: expect.objectContaining({
          configSetName: "wraps-tracking",
          tableName: "wraps-email-history",
        }),
      })
    );
  });

  it("should handle multiple domains with different verification email statuses", async () => {
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: "123456789012",
      UserId: "AIDAI123456789",
      Arn: "arn:aws:iam::123456789012:user/test",
    });

    const { LocalWorkspace } = await import("@pulumi/pulumi/automation");
    vi.mocked(LocalWorkspace.selectStack).mockResolvedValue({
      outputs: vi.fn().mockResolvedValue({
        roleArn: { value: "arn:aws:iam::123456789012:role/wraps-email-role" },
        region: { value: "us-east-1" },
      }),
    } as any);

    sesMock
      .on(ListIdentitiesCommand)
      .resolves({ Identities: ["verified.com", "pending.com"] })
      .on(GetIdentityVerificationAttributesCommand)
      .resolves({
        VerificationAttributes: {
          "verified.com": { VerificationStatus: "Success" },
          "pending.com": { VerificationStatus: "Pending" },
        },
      });

    sesv2Mock
      .on(GetEmailIdentityCommand, { EmailIdentity: "verified.com" })
      .resolves({
        DkimAttributes: {
          Tokens: ["token1", "token2", "token3"],
          Status: "SUCCESS",
        },
      })
      .on(GetEmailIdentityCommand, { EmailIdentity: "pending.com" })
      .resolves({
        DkimAttributes: {
          Tokens: ["token4", "token5", "token6"],
          Status: "PENDING",
        },
      });

    const { displayStatus } = await import("../../utils/shared/output.js");

    await emailStatus({});

    expect(displayStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        domains: expect.arrayContaining([
          expect.objectContaining({
            domain: "verified.com",
            status: "verified",
          }),
          expect.objectContaining({ domain: "pending.com", status: "pending" }),
        ]),
      })
    );
  });

  describe("SES sandbox reporting", () => {
    async function stubStackAndDomains() {
      stsMock.on(GetCallerIdentityCommand).resolves({
        Account: "123456789012",
        UserId: "AIDAI123456789",
        Arn: "arn:aws:iam::123456789012:user/test",
      });

      const { LocalWorkspace } = await import("@pulumi/pulumi/automation");
      vi.mocked(LocalWorkspace.selectStack).mockResolvedValue({
        outputs: vi.fn().mockResolvedValue({
          roleArn: {
            value: "arn:aws:iam::123456789012:role/wraps-email-role",
          },
          region: { value: "us-east-1" },
        }),
      } as any);

      sesMock.on(ListIdentitiesCommand).resolves({ Identities: [] });
    }

    it("reports sandbox: true, sandboxUncertain: false when SES is not in production", async () => {
      await stubStackAndDomains();
      sesv2Mock.on(GetAccountCommand).resolves({
        ProductionAccessEnabled: false,
      });

      const { displayStatus } = await import("../../utils/shared/output.js");

      await emailStatus({});

      expect(displayStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          sending: expect.objectContaining({
            sandbox: true,
            sandboxUncertain: false,
          }),
        })
      );
    });

    it("sets sandboxUncertain: true when GetAccount fails, and never renders 'production'", async () => {
      await stubStackAndDomains();
      sesv2Mock.on(GetAccountCommand).rejects(new Error("AccessDenied"));

      const outputModule = await vi.importActual<
        typeof import("../../utils/shared/output.js")
      >("../../utils/shared/output.js");
      const displayStatusMock = vi.mocked(
        (await import("../../utils/shared/output.js")).displayStatus
      );

      await emailStatus({});

      expect(displayStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sending: expect.objectContaining({
            sandbox: true,
            sandboxUncertain: true,
          }),
        })
      );

      // The regression that matters: render the payload we were actually
      // handed and confirm "production" never appears.
      const clack = await import("@clack/prompts");
      vi.mocked(clack.note).mockClear();
      const statusData = displayStatusMock.mock.calls.at(-1)?.[0];
      outputModule.displayStatus(statusData as any);

      const rendered = vi
        .mocked(clack.note)
        .mock.calls.map((call) => call[0])
        .join("\n");
      expect(rendered).not.toContain("production");
      expect(rendered).toContain("could not determine");
    });

    it("includes quota fields in the payload when SES reports a send quota", async () => {
      await stubStackAndDomains();
      sesv2Mock.on(GetAccountCommand).resolves({
        ProductionAccessEnabled: true,
        SendQuota: {
          Max24HourSend: 200_000,
          MaxSendRate: 42,
          SentLast24Hours: 999,
        },
      });

      const { displayStatus } = await import("../../utils/shared/output.js");

      await emailStatus({});

      expect(displayStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          sending: expect.objectContaining({
            max24HourSend: 200_000,
            maxSendRate: 42,
            sentLast24Hours: 999,
          }),
        })
      );
    });
  });

  describe("CloudFormation-owned deployments (no Pulumi stack)", () => {
    beforeEach(async () => {
      stsMock.on(GetCallerIdentityCommand).resolves({
        Account: "123456789012",
        UserId: "AIDAI123456789",
        Arn: "arn:aws:iam::123456789012:user/test",
      });

      const { LocalWorkspace } = await import("@pulumi/pulumi/automation");
      vi.mocked(LocalWorkspace.selectStack).mockRejectedValue(
        new Error("Stack not found")
      );

      sesMock.on(ListIdentitiesCommand).resolves({ Identities: [] });
    });

    it("does not exit 1 and reports the stack names when CloudFormation stacks are found", async () => {
      cfnMock.on(DescribeStacksCommand).resolves({
        Stacks: [
          {
            StackName: "wraps-email-prod",
            StackStatus: "CREATE_COMPLETE",
          },
        ],
      });

      const { displayStatus } = await import("../../utils/shared/output.js");

      await emailStatus({});

      expect(exitSpy).not.toHaveBeenCalledWith(1);
      expect(displayStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationLevel: "dashboard-only",
          cloudFormationStacks: ["wraps-email-prod"],
        })
      );
    });

    it("exits 1 and says the check could not be performed when CloudFormation access is denied", async () => {
      cfnMock
        .on(DescribeStacksCommand)
        .rejects(new Error("AccessDenied: cloudformation:DescribeStacks"));

      await emailStatus({});

      expect(exitSpy).toHaveBeenCalledWith(1);
      const loggedLines = consoleLogSpy.mock.calls
        .map((call) => String(call[0]))
        .join("\n");
      expect(loggedLines).toContain("Could not check for CloudFormation");
    });

    it("exits 1 with today's message when CloudFormation was checked and found nothing", async () => {
      cfnMock.on(DescribeStacksCommand).resolves({ Stacks: [] });

      const clack = await import("@clack/prompts");

      await emailStatus({});

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(clack.log.error).toHaveBeenCalledWith(
        "No email infrastructure found"
      );
      const loggedLines = consoleLogSpy.mock.calls
        .map((call) => String(call[0]))
        .join("\n");
      expect(loggedLines).not.toContain("Could not check for CloudFormation");
    });
  });

  describe("JSON output", () => {
    beforeEach(() => {
      setJsonMode(true);
    });

    afterEach(() => {
      setJsonMode(false);
    });

    it("should output JSON envelope when json mode is active", async () => {
      stsMock.on(GetCallerIdentityCommand).resolves({
        Account: "123456789012",
        UserId: "AIDAI123456789",
        Arn: "arn:aws:iam::123456789012:user/test",
      });

      const { LocalWorkspace } = await import("@pulumi/pulumi/automation");
      vi.mocked(LocalWorkspace.selectStack).mockResolvedValue({
        outputs: vi.fn().mockResolvedValue({
          roleArn: { value: "arn:aws:iam::123456789012:role/wraps-email-role" },
          region: { value: "us-east-1" },
        }),
      } as any);

      sesMock
        .on(ListIdentitiesCommand)
        .resolves({ Identities: ["example.com"] })
        .on(GetIdentityVerificationAttributesCommand)
        .resolves({
          VerificationAttributes: {
            "example.com": { VerificationStatus: "Success" },
          },
        });

      sesv2Mock.on(GetEmailIdentityCommand).resolves({
        DkimAttributes: {
          Tokens: ["token1", "token2", "token3"],
          Status: "SUCCESS",
        },
      });

      await emailStatus({ json: true });

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.command === "email.status";
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0]);
      expect(output.success).toBe(true);
      expect(output.command).toBe("email.status");
      expect(output.data).toBeDefined();
    });
  });

  describe("displayStatus rendering", () => {
    it("Unit 6: renders Tracking line when domain has trackingConfig", async () => {
      const { displayStatus } = await vi.importActual<
        typeof import("../../utils/shared/output.js")
      >("../../utils/shared/output.js");

      const clack = await import("@clack/prompts");

      displayStatus({
        integrationLevel: "dashboard-only",
        region: "us-east-1",
        domains: [
          {
            domain: "test.com",
            status: "verified",
            trackingConfig: { opens: true, clicks: false },
          },
        ],
        resources: {},
      });

      expect(clack.note).toHaveBeenCalledWith(
        expect.stringContaining("Tracking:"),
        expect.any(String)
      );
      const noteArg = vi.mocked(clack.note).mock.calls[0][0] as string;
      // opens: true → "on"; clicks: false → "off"
      expect(noteArg).toContain("on");
      expect(noteArg).toContain("off");
      // Verify renders differ: a hardcoded string couldn't satisfy both
      expect(noteArg).toMatch(/opens.*on/);
      expect(noteArg).toMatch(/clicks.*off/);
    });

    it("Unit 7: omits tracking line when domain has no trackingConfig", async () => {
      const { displayStatus } = await vi.importActual<
        typeof import("../../utils/shared/output.js")
      >("../../utils/shared/output.js");

      const clack = await import("@clack/prompts");
      vi.mocked(clack.note).mockClear();

      displayStatus({
        integrationLevel: "dashboard-only",
        region: "us-east-1",
        domains: [
          {
            domain: "test.com",
            status: "verified",
          },
        ],
        resources: {},
      });

      const noteArg = vi.mocked(clack.note).mock.calls[0]?.[0] as
        | string
        | undefined;
      expect(noteArg ?? "").not.toContain("Tracking:");
    });
  });
});
