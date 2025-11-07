import {
  GetIdentityVerificationAttributesCommand,
  ListIdentitiesCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import { GetEmailIdentityCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { status } from "../status.js";

const stsMock = mockClient(STSClient);
const sesMock = mockClient(SESClient);
const sesv2Mock = mockClient(SESv2Client);

// Mock Pulumi
vi.mock("@pulumi/pulumi/automation", () => ({
  LocalWorkspace: {
    selectStack: vi.fn(),
  },
}));

// Mock clack
vi.mock("@clack/prompts", () => ({
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
vi.mock("../../utils/output.js", async () => {
  const actual = await vi.importActual("../../utils/output.js");
  return {
    ...actual,
    displayStatus: vi.fn(),
  };
});

// Mock fs module
vi.mock("../../utils/fs.js", () => ({
  getPulumiWorkDir: () => "/mock/pulumi/dir",
  ensurePulumiWorkDir: vi.fn().mockResolvedValue(undefined),
}));

describe("status command", () => {
  let exitSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    stsMock.reset();
    sesMock.reset();
    sesv2Mock.reset();
    vi.clearAllMocks();

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

    await expect(status({})).rejects.toThrow();
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

    await status({});

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should display status when stack exists with dashboard-only integration", async () => {
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: "123456789012",
      UserId: "AIDAI123456789",
      Arn: "arn:aws:iam::123456789012:user/test",
    });

    const { LocalWorkspace } = await import("@pulumi/pulumi/automation");
    vi.mocked(LocalWorkspace.selectStack).mockResolvedValue({
      outputs: vi.fn().mockResolvedValue({
        roleArn: { value: "arn:aws:iam::123456789012:role/byo-email-role" },
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

    const { displayStatus } = await import("../../utils/output.js");

    await status({});

    expect(displayStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationLevel: "dashboard-only",
        region: "us-east-1",
      })
    );
  });

  it.skip("should display status with enhanced integration when configSet exists", async () => {
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: "123456789012",
      UserId: "AIDAI123456789",
      Arn: "arn:aws:iam::123456789012:user/test",
    });

    const { LocalWorkspace } = await import("@pulumi/pulumi/automation");
    vi.mocked(LocalWorkspace.selectStack).mockResolvedValue({
      outputs: vi.fn().mockResolvedValue({
        roleArn: { value: "arn:aws:iam::123456789012:role/byo-email-role" },
        configSetName: { value: "byo-tracking" },
        tableName: { value: "byo-email-history" },
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

    const { displayStatus } = await import("../../utils/output.js");

    await status({});

    expect(displayStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationLevel: "enhanced",
        resources: expect.objectContaining({
          configSetName: "byo-tracking",
          tableName: "byo-email-history",
        }),
      })
    );
  });

  it("should handle multiple domains with different verification statuses", async () => {
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: "123456789012",
      UserId: "AIDAI123456789",
      Arn: "arn:aws:iam::123456789012:user/test",
    });

    const { LocalWorkspace } = await import("@pulumi/pulumi/automation");
    vi.mocked(LocalWorkspace.selectStack).mockResolvedValue({
      outputs: vi.fn().mockResolvedValue({
        roleArn: { value: "arn:aws:iam::123456789012:role/byo-email-role" },
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

    const { displayStatus } = await import("../../utils/output.js");

    await status({});

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
});
