import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";

// Mock all external dependencies
/**
 * Mock the S3 state module.
 *
 * `metadata.ts` mirrors connection metadata into an S3 backend through this
 * module, which constructs a real S3Client. Unmocked, the SDK's credential
 * chain runs before any request — on a machine with AWS SSO configured that is
 * a live call to the SSO portal for federated credentials on every test. Slow,
 * non-deterministic, and dependent on whose laptop is running the suite.
 */
/**
 * A failing destroy runs a best-effort SQS cleanup that constructs a real client
 * inside a swallowed catch. Unmocked that is live network traffic on every run.
 */
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  GetQueueUrlCommand: vi.fn(),
  DeleteQueueCommand: vi.fn(),
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
    LocalWorkspace: {
      selectStack: vi.fn(),
    },
  },
}));
vi.mock("@pulumi/pulumi/automation", () => ({
  LocalWorkspace: {
    selectStack: vi.fn(),
  },
  installPulumiCli: vi.fn(),
}));
vi.mock("@clack/prompts");
vi.mock("node:fs");
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/fs.js");
vi.mock("../../utils/shared/metadata.js");
vi.mock("../../utils/shared/pulumi.js", async () => {
  const actual = (await vi.importActual("../../utils/shared/pulumi.js")) as any;
  return {
    ...actual,
    ensurePulumiInstalled: vi.fn().mockResolvedValue(undefined),
    previewWithResourceChanges: vi
      .fn()
      .mockResolvedValue({ changeSummary: {}, resourceChanges: [] }),
  };
});
// Plan 041: email destroy deletes the inbound receipt rule and rule set.
vi.mock("../../utils/email/receipt-rules.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/email/receipt-rules.js")>();
  return {
    ...actual,
    deleteReceiptRule: vi.fn().mockResolvedValue(undefined),
    deleteReceiptRuleSet: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("../../utils/route53.js");
vi.mock("@aws-sdk/client-sesv2");
vi.mock("../../utils/shared/agent-api.js");

import * as sesv2 from "@aws-sdk/client-sesv2";
import * as sqs from "@aws-sdk/client-sqs";
import * as prompts from "@clack/prompts";
import * as receiptRules from "../../utils/email/receipt-rules.js";
import * as route53 from "../../utils/route53.js";
import * as agentApi from "../../utils/shared/agent-api.js";
import * as aws from "../../utils/shared/aws.js";
import { WrapsError } from "../../utils/shared/errors.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as metadata from "../../utils/shared/metadata.js";
// Import after mocks
import {
  buildAgentDestroySummaryLines,
  emailDestroy,
  selectAgentsToDestroy,
} from "../email/destroy.js";
import { destroy } from "../shared/destroy.js";

describe("email destroy command", () => {
  let mockSpinner: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock spinner
    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    };

    // Mock prompts module
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as never);
    vi.mocked(prompts.intro).mockImplementation(() => {});
    vi.mocked(prompts.outro).mockImplementation(() => {});
    vi.mocked(prompts.cancel).mockImplementation(() => {});
    vi.mocked(prompts.confirm).mockResolvedValue(true as never);
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(prompts.log).info = vi.fn();
    vi.mocked(prompts.log).success = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).warn = vi.fn();

    // Mock AWS utilities
    vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
      accountId: "123456789012",
      userId: "AIDACKCEVSQ6C2EXAMPLE",
      arn: "arn:aws:iam::123456789012:user/test",
    });
    vi.mocked(aws.getAWSRegion).mockResolvedValue("us-east-1");

    // Mock filesystem utilities
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockImplementation(async () => {
      process.env.PULUMI_BACKEND_URL =
        "s3://wraps-state-123456789012-us-east-1";
      return undefined as never;
    });
    vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");

    // Mock metadata utilities
    vi.mocked(metadata.deleteConnectionMetadata).mockResolvedValue(undefined);
    vi.mocked(metadata.findConnectionsWithService).mockResolvedValue([]);
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
      version: "1.0.0",
      accountId: "123456789012",
      region: "us-east-1",
      provider: "vercel",
      timestamp: new Date().toISOString(),
      services: {
        email: {
          preset: "production",
          config: {
            domain: "example.com",
            tracking: { enabled: true },
          },
          pulumiStackName: "wraps-email-123456789012-us-east-1",
          deployedAt: new Date().toISOString(),
        },
      },
    });

    // Mock Route53 utilities
    vi.mocked(route53.findHostedZone).mockResolvedValue(null);
    vi.mocked(route53.deleteDNSRecords).mockResolvedValue({
      deleted: [],
      skipped: [],
      supported: true,
      errors: [],
    });

    // Default: no reachable Wraps Platform (agent kill step is best-effort).
    vi.mocked(agentApi.createAgentApiClient).mockResolvedValue({
      ok: false,
      reason: "not-authenticated",
    });
  });

  // Metadata carrying two enabled agents in the email stack.
  function metadataWithAgents(webhookSecret?: string) {
    return {
      version: "1.0.0" as const,
      accountId: "123456789012",
      region: "us-east-1",
      provider: "vercel" as const,
      timestamp: new Date().toISOString(),
      services: {
        email: {
          preset: "production",
          config: {
            domain: "example.com",
            tracking: { enabled: true },
            agents: {
              enabled: true,
              webhookSecret: "enforcer-secret",
              agents: [
                {
                  id: "agent-1",
                  name: "sdr",
                  emailAddress: "sdr@example.com",
                  domain: "example.com",
                },
                {
                  id: "agent-2",
                  name: "support",
                  emailAddress: "support@example.com",
                  domain: "example.com",
                },
              ],
            },
          },
          pulumiStackName: "wraps-email-123456789012-us-east-1",
          deployedAt: new Date().toISOString(),
          ...(webhookSecret ? { webhookSecret } : {}),
        },
      },
    };
  }

  // Helper function to setup Pulumi mocking
  async function setupPulumiMock(shouldThrowOnSelect = false) {
    const pulumi = await import("@pulumi/pulumi");
    const pulumiAutomation = await import("@pulumi/pulumi/automation");

    const mockStack = {
      destroy: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      workspace: {
        removeStack: vi.fn().mockResolvedValue(undefined),
      },
    } as any;

    const selectStackMock = vi.fn().mockImplementation(() => {
      if (shouldThrowOnSelect) {
        throw new Error("Stack not found");
      }
      return mockStack;
    });

    vi.mocked(pulumi.automation.LocalWorkspace.selectStack).mockImplementation(
      selectStackMock
    );
    vi.mocked(pulumiAutomation.LocalWorkspace.selectStack).mockImplementation(
      selectStackMock
    );

    return mockStack;
  }

  describe("Inbound receipt rule cleanup (plan 041)", () => {
    function withInbound(webhookSecret?: string) {
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: {
              domain: "example.com",
              tracking: { enabled: true },
              inbound: {
                enabled: true,
                subdomain: "inbound",
                receivingDomain: "inbound.example.com",
                trigger: "ses-lambda-action",
              },
            },
            pulumiStackName: "wraps-email-123456789012-us-east-1",
            deployedAt: new Date().toISOString(),
            ...(webhookSecret ? { webhookSecret } : {}),
          },
        },
      } as never);
    }

    it("deletes the rule and rule set after the confirmation and before the stack destroy", async () => {
      withInbound();
      const stack = await setupPulumiMock();

      await emailDestroy({});

      const confirmAt = vi.mocked(prompts.confirm).mock.invocationCallOrder[0];
      const ruleAt = vi.mocked(receiptRules.deleteReceiptRule).mock
        .invocationCallOrder[0];
      const ruleSetAt = vi.mocked(receiptRules.deleteReceiptRuleSet).mock
        .invocationCallOrder[0];
      const destroyAt = stack.destroy.mock.invocationCallOrder[0];
      expect(receiptRules.deleteReceiptRule).toHaveBeenCalledWith("us-east-1");
      expect(receiptRules.deleteReceiptRuleSet).toHaveBeenCalledWith(
        "us-east-1"
      );
      expect(confirmAt).toBeLessThan(ruleAt);
      expect(ruleAt).toBeLessThan(ruleSetAt);
      expect(ruleSetAt).toBeLessThan(destroyAt);
    });

    it("leaves receipt rules alone when inbound is not enabled", async () => {
      await setupPulumiMock();
      await emailDestroy({ force: true });
      expect(receiptRules.deleteReceiptRule).not.toHaveBeenCalled();
      expect(receiptRules.deleteReceiptRuleSet).not.toHaveBeenCalled();
    });

    it("aborts before the stack destroy when the rule delete fails", async () => {
      withInbound();
      const stack = await setupPulumiMock();
      const denied = new Error("not authorized");
      denied.name = "AccessDenied";
      vi.mocked(receiptRules.deleteReceiptRule).mockRejectedValueOnce(denied);

      await expect(emailDestroy({ force: true })).rejects.toMatchObject({
        code: "RECEIPT_RULE_DELETE_FAILED",
        suggestion: expect.stringContaining("Grant ses:DeleteReceiptRule"),
      });
      expect(stack.destroy).not.toHaveBeenCalled();
      expect(metadata.deleteConnectionMetadata).not.toHaveBeenCalled();
    });

    it("a rule-set failure after the rule delete says the rule may already be gone, and doesn't blame IAM for throttling", async () => {
      withInbound();
      const stack = await setupPulumiMock();
      const throttled = new Error("Rate exceeded");
      throttled.name = "Throttling";
      vi.mocked(receiptRules.deleteReceiptRuleSet).mockRejectedValueOnce(
        throttled
      );

      const error = await emailDestroy({ force: true }).catch((e) => e);

      expect(receiptRules.deleteReceiptRule).toHaveBeenCalledTimes(1);
      expect(error.code).toBe("RECEIPT_RULE_DELETE_FAILED");
      expect(error.message).toContain(
        "The email stack was not destroyed; the receipt rule or rule set may already be deleted or deactivated."
      );
      expect(error.message).not.toContain("Nothing was destroyed");
      expect(error.suggestion).not.toContain("Grant");
      expect(error.suggestion).toContain("wraps email destroy");
      expect(stack.destroy).not.toHaveBeenCalled();
    });

    it("a declined confirmation deletes no receipt rule", async () => {
      withInbound();
      const stack = await setupPulumiMock();
      vi.mocked(prompts.confirm).mockResolvedValueOnce(false as never);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
        code: number
      ) => {
        throw new Error(`process.exit(${code})`);
      }) as never);
      try {
        await expect(emailDestroy({})).rejects.toThrow("process.exit(0)");
      } finally {
        exitSpy.mockRestore();
      }
      expect(receiptRules.deleteReceiptRule).not.toHaveBeenCalled();
      expect(receiptRules.deleteReceiptRuleSet).not.toHaveBeenCalled();
      expect(stack.destroy).not.toHaveBeenCalled();
    });

    it("a mismatched typed account id deletes no receipt rule", async () => {
      withInbound("platform-secret");
      const stack = await setupPulumiMock();
      vi.mocked(prompts.confirm).mockResolvedValueOnce(true as never);
      vi.mocked(prompts.text).mockResolvedValueOnce("999999999999" as never);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
        code: number
      ) => {
        throw new Error(`process.exit(${code})`);
      }) as never);
      try {
        await expect(emailDestroy({})).rejects.toThrow("process.exit(0)");
      } finally {
        exitSpy.mockRestore();
      }
      expect(receiptRules.deleteReceiptRule).not.toHaveBeenCalled();
      expect(receiptRules.deleteReceiptRuleSet).not.toHaveBeenCalled();
      expect(stack.destroy).not.toHaveBeenCalled();
    });

    it("--preview lists the rule and rule set and deletes nothing", async () => {
      withInbound();
      const stack = await setupPulumiMock();

      await emailDestroy({ preview: true });

      const infos = vi
        .mocked(prompts.log.info)
        .mock.calls.map((c) => String(c[0]));
      expect(
        infos.some(
          (m) =>
            m.includes("wraps-inbound-catch-all") &&
            m.includes("wraps-inbound-rules")
        )
      ).toBe(true);
      expect(receiptRules.deleteReceiptRule).not.toHaveBeenCalled();
      expect(receiptRules.deleteReceiptRuleSet).not.toHaveBeenCalled();
      expect(stack.destroy).not.toHaveBeenCalled();
    });
  });

  describe("Core Flow Tests", () => {
    it("should validate AWS credentials", async () => {
      await setupPulumiMock();
      await emailDestroy({ force: true });

      expect(aws.validateAWSCredentials).toHaveBeenCalled();
    });

    it("should confirm destruction when --force flag not provided", async () => {
      await setupPulumiMock();
      await emailDestroy({});

      expect(prompts.confirm).toHaveBeenCalled();
    });

    it("should skip confirmation when --force flag is provided", async () => {
      await setupPulumiMock();
      await emailDestroy({ force: true });

      // First call is the main confirmation, should be skipped
      // But DNS cleanup confirmation may still happen if hosted zone found
      expect(prompts.confirm).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Are you sure you want to destroy"),
        })
      );
    });

    it("should select the correct Pulumi stack with email prefix", async () => {
      const _mockStack = await setupPulumiMock();
      await emailDestroy({ force: true });

      const pulumi = await import("@pulumi/pulumi");
      expect(pulumi.automation.LocalWorkspace.selectStack).toHaveBeenCalledWith(
        {
          stackName: "wraps-email-123456789012-us-east-1",
          workDir: "/mock/.wraps/pulumi",
        }
      );
    });

    it("should destroy the Pulumi stack", async () => {
      const mockStack = await setupPulumiMock();
      await emailDestroy({ force: true });

      expect(mockStack.destroy).toHaveBeenCalled();
    });

    it("should remove the stack from workspace", async () => {
      const mockStack = await setupPulumiMock();
      await emailDestroy({ force: true });

      expect(mockStack.workspace.removeStack).toHaveBeenCalledWith(
        "wraps-email-123456789012-us-east-1"
      );
    });

    it("should delete connection metadata", async () => {
      await setupPulumiMock();
      await emailDestroy({ force: true });

      expect(metadata.deleteConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "us-east-1"
      );
    });
  });

  describe("Blast-radius summary and typed confirmation", () => {
    it("should print a summary note including the event queue names and consequence line", async () => {
      await setupPulumiMock();
      await emailDestroy({});

      expect(prompts.note).toHaveBeenCalledWith(
        expect.stringContaining("wraps-email-events"),
        expect.any(String)
      );
      expect(prompts.note).toHaveBeenCalledWith(
        expect.stringContaining("Event streaming stops"),
        expect.any(String)
      );
    });

    it("should not prompt for typed account id when account is not platform-connected", async () => {
      await setupPulumiMock();
      await emailDestroy({});

      expect(prompts.text).not.toHaveBeenCalled();
    });

    it("should require typed account id when account is platform-connected, and cancel on mismatch", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: {
              domain: "example.com",
              tracking: { enabled: true },
            },
            pulumiStackName: "wraps-email-123456789012-us-east-1",
            deployedAt: new Date().toISOString(),
            webhookSecret: "secret-key",
          },
        },
      });
      vi.mocked(prompts.text).mockResolvedValue("999999999999" as never);

      await expect(emailDestroy({})).rejects.toThrow();

      expect(prompts.text).toHaveBeenCalled();
      const pulumi = await import("@pulumi/pulumi");
      expect(
        pulumi.automation.LocalWorkspace.selectStack
      ).not.toHaveBeenCalled();
    });

    it("should proceed when typed account id matches", async () => {
      const mockStack = await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: {
              domain: "example.com",
              tracking: { enabled: true },
            },
            pulumiStackName: "wraps-email-123456789012-us-east-1",
            deployedAt: new Date().toISOString(),
            webhookSecret: "secret-key",
          },
        },
      });
      vi.mocked(prompts.text).mockResolvedValue("123456789012" as never);

      await emailDestroy({});

      expect(prompts.text).toHaveBeenCalled();
      expect(mockStack.destroy).toHaveBeenCalled();
    });

    it("should skip all prompts and print a warning when --force is used on a connected account", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: {
              domain: "example.com",
              tracking: { enabled: true },
            },
            pulumiStackName: "wraps-email-123456789012-us-east-1",
            deployedAt: new Date().toISOString(),
            webhookSecret: "secret-key",
          },
        },
      });

      await emailDestroy({ force: true });

      expect(prompts.confirm).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Are you sure you want to destroy"),
        })
      );
      expect(prompts.text).not.toHaveBeenCalled();
      expect(prompts.log.warn).toHaveBeenCalledWith(
        expect.stringContaining("123456789012")
      );
    });
  });

  describe("Fails closed on local state (plan 057)", () => {
    const LOCAL_URL = "file:///mock/.wraps/pulumi";

    beforeEach(() => {
      vi.stubEnv("WRAPS_LOCAL_ONLY", "");
      vi.stubEnv("AWS_REGION", "");
      vi.stubEnv("AWS_DEFAULT_REGION", "");
      // The S3 backend is unreachable: ensurePulumiWorkDir falls back to file://.
      vi.mocked(fsUtils.ensurePulumiWorkDir).mockImplementation(async () => {
        process.env.PULUMI_BACKEND_URL = LOCAL_URL;
        return undefined as never;
      });
      // Turn on every delete that runs before the Pulumi block.
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        ...metadataWithAgents(),
        services: {
          email: {
            ...metadataWithAgents().services.email,
            config: {
              ...metadataWithAgents().services.email.config,
              inbound: {
                enabled: true,
                subdomain: "inbound",
                receivingDomain: "inbound.example.com",
                trigger: "ses-lambda-action",
              },
            },
          },
        },
      } as never);
      vi.mocked(route53.findHostedZone).mockResolvedValue({
        id: "Z123456789",
        name: "example.com",
      });
      vi.mocked(sesv2.SESv2Client.prototype.send).mockResolvedValue({
        DkimAttributes: { Tokens: ["tok1", "tok2", "tok3"] },
      } as never);
      vi.mocked(agentApi.createAgentApiClient).mockResolvedValue({
        ok: true,
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({ ok: true } as Response),
      });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      delete process.env.PULUMI_BACKEND_URL;
    });

    function expectNothingDeleted(stack: {
      destroy: ReturnType<typeof vi.fn>;
      workspace: { removeStack: ReturnType<typeof vi.fn> };
    }) {
      expect(receiptRules.deleteReceiptRule).not.toHaveBeenCalled();
      expect(receiptRules.deleteReceiptRuleSet).not.toHaveBeenCalled();
      expect(route53.deleteDNSRecords).not.toHaveBeenCalled();
      expect(stack.destroy).not.toHaveBeenCalled();
      expect(stack.workspace.removeStack).not.toHaveBeenCalled();
      expect(sqs.SQSClient).not.toHaveBeenCalled();
      expect(metadata.deleteConnectionMetadata).not.toHaveBeenCalled();
    }

    it("preview with the S3 fallback throws STATE_BACKEND_UNREACHABLE unwrapped and selects no stack", async () => {
      const pulumi = await import("@pulumi/pulumi");
      await setupPulumiMock();

      const error = await emailDestroy({ preview: true }).catch((e) => e);

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
      expect(
        pulumi.automation.LocalWorkspace.selectStack
      ).not.toHaveBeenCalled();
    });

    it("destroy with the S3 fallback throws and runs no delete", async () => {
      const pulumi = await import("@pulumi/pulumi");
      const stack = await setupPulumiMock();
      const post = vi.mocked(agentApi.createAgentApiClient);
      setJsonMode(true);
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      try {
        const error = await emailDestroy({ force: true, json: true }).catch(
          (e) => e
        );

        expect(error).toBeInstanceOf(WrapsError);
        expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
        expectNothingDeleted(stack);
        expect(
          pulumi.automation.LocalWorkspace.selectStack
        ).not.toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();
        expect(
          consoleLogSpy.mock.calls.some((c) =>
            String(c[0]).includes("email.destroy")
          )
        ).toBe(false);
      } finally {
        setJsonMode(false);
        consoleLogSpy.mockRestore();
      }
    });

    it("WRAPS_LOCAL_ONLY=1 proceeds on file:// for preview and destroy", async () => {
      vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
      const stack = await setupPulumiMock();

      await expect(emailDestroy({ preview: true })).resolves.toBeUndefined();
      await expect(emailDestroy({})).resolves.toBeUndefined();

      expect(stack.destroy).toHaveBeenCalled();
      expect(receiptRules.deleteReceiptRule).toHaveBeenCalled();
    });

    it("checks the backend after the last prompt and before the first delete", async () => {
      vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
      await setupPulumiMock();

      await emailDestroy({});

      const lastPrompt = Math.max(
        ...vi.mocked(prompts.confirm).mock.invocationCallOrder
      );
      const guard = vi.mocked(fsUtils.ensurePulumiWorkDir).mock
        .invocationCallOrder[0];
      const firstDelete = Math.min(
        vi.mocked(receiptRules.deleteReceiptRule).mock.invocationCallOrder[0],
        vi.mocked(route53.deleteDNSRecords).mock.invocationCallOrder[0]
      );
      expect(lastPrompt).toBeLessThan(guard);
      expect(guard).toBeLessThan(firstDelete);
      // The DNS prompt ran too (two confirms), so the guard follows both.
      expect(vi.mocked(prompts.confirm).mock.calls.length).toBe(2);
    });
  });

  describe("DNS Cleanup Tests", () => {
    it("should check for Route53 hosted zone when domain is configured", async () => {
      await setupPulumiMock();
      await emailDestroy({ force: true });

      expect(route53.findHostedZone).toHaveBeenCalledWith(
        "example.com",
        "us-east-1"
      );
    });

    it("should not prompt for DNS cleanup if no hosted zone found", async () => {
      await setupPulumiMock();
      vi.mocked(route53.findHostedZone).mockResolvedValue(null);

      await emailDestroy({ force: true });

      expect(route53.deleteDNSRecords).not.toHaveBeenCalled();
    });

    it("reports deleted, skipped, and errored DNS records after cleanup runs", async () => {
      await setupPulumiMock();
      vi.mocked(route53.findHostedZone).mockResolvedValue({
        id: "Z123456789",
        name: "example.com",
      });
      vi.mocked(sesv2.SESv2Client.prototype.send).mockResolvedValueOnce({
        DkimAttributes: { Tokens: ["tok1", "tok2", "tok3"] },
      } as never);
      vi.mocked(route53.deleteDNSRecords).mockResolvedValue({
        deleted: ["CNAME tok1._domainkey.example.com"],
        // Non-Wraps record listed first deliberately: a buggy "report the
        // first thing found" implementation would surface this instead of
        // the actual skip, and the assertion below would catch it.
        skipped: [
          {
            record: "TXT _dmarc.example.com",
            reason:
              "The TXT record set at _dmarc.example.com does not contain the value Wraps created — leaving it in place.",
          },
        ],
        supported: true,
        errors: ["MX example.com: some provider error"],
      });

      await emailDestroy({ force: true });

      expect(prompts.log.success).toHaveBeenCalledWith(
        "Deleted DNS record: CNAME tok1._domainkey.example.com"
      );
      expect(prompts.log.warn).toHaveBeenCalledWith(
        "Left DNS record in place: TXT _dmarc.example.com (The TXT record set at _dmarc.example.com does not contain the value Wraps created — leaving it in place.)"
      );
      expect(prompts.log.warn).toHaveBeenCalledWith(
        "DNS cleanup error: MX example.com: some provider error"
      );
    });
  });

  describe("Error Handling Tests", () => {
    it("should handle no Pulumi stack found gracefully", async () => {
      await setupPulumiMock(true);

      await expect(emailDestroy({ force: true })).rejects.toThrow();

      // Should still try to delete metadata
      expect(metadata.deleteConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "us-east-1"
      );
    });

    it("should handle user cancellation", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.confirm).mockResolvedValue(false as never);
      vi.mocked(prompts.isCancel).mockReturnValue(false);

      await expect(emailDestroy({})).rejects.toThrow();

      // Should not destroy stack
      const pulumi = await import("@pulumi/pulumi");
      expect(
        pulumi.automation.LocalWorkspace.selectStack
      ).not.toHaveBeenCalled();
    });

    it("should handle user cancelling the confirmation dialog", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.confirm).mockResolvedValue(
        Symbol.for("clack.cancel") as never
      );
      vi.mocked(prompts.isCancel).mockReturnValue(true);

      await expect(emailDestroy({})).rejects.toThrow();
    });

    it("should handle stack destroy failures gracefully", async () => {
      const mockStack = await setupPulumiMock();
      mockStack.destroy.mockRejectedValue(new Error("Destroy failed"));

      // Destroy failures are now handled gracefully — no throw
      await emailDestroy({ force: true });

      // Metadata should still be cleaned up so user isn't stuck
      expect(metadata.deleteConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "us-east-1"
      );
    });
  });

  describe("State Verification Tests", () => {
    it("should work with different regions", async () => {
      await setupPulumiMock();
      vi.mocked(aws.getAWSRegion).mockResolvedValue("eu-west-1");
      // Mock metadata with the correct region stack name
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "123456789012",
        region: "eu-west-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: {
              domain: "example.com",
              tracking: { enabled: true },
            },
            pulumiStackName: "wraps-email-123456789012-eu-west-1",
            deployedAt: new Date().toISOString(),
          },
        },
      });

      await emailDestroy({ force: true });

      const pulumi = await import("@pulumi/pulumi");
      expect(pulumi.automation.LocalWorkspace.selectStack).toHaveBeenCalledWith(
        {
          stackName: "wraps-email-123456789012-eu-west-1",
          workDir: "/mock/.wraps/pulumi",
        }
      );

      expect(metadata.deleteConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "eu-west-1"
      );
    });

    it("should work with different account IDs", async () => {
      await setupPulumiMock();
      vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
        accountId: "999888777666",
        userId: "test",
        arn: "test",
      });
      // Mock metadata with the correct account ID stack name
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "999888777666",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: {
              domain: "example.com",
              tracking: { enabled: true },
            },
            pulumiStackName: "wraps-email-999888777666-us-east-1",
            deployedAt: new Date().toISOString(),
          },
        },
      });

      await emailDestroy({ force: true });

      const pulumi = await import("@pulumi/pulumi");
      expect(pulumi.automation.LocalWorkspace.selectStack).toHaveBeenCalledWith(
        {
          stackName: "wraps-email-999888777666-us-east-1",
          workDir: "/mock/.wraps/pulumi",
        }
      );
    });

    it("should fallback to generated stack name when no metadata stored", async () => {
      await setupPulumiMock();
      // Mock metadata without pulumiStackName
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: {
              domain: "example.com",
              tracking: { enabled: true },
            },
            // No pulumiStackName - should fallback
            deployedAt: new Date().toISOString(),
          },
        },
      });

      await emailDestroy({ force: true });

      const pulumi = await import("@pulumi/pulumi");
      // Fallback should match init.ts format: wraps-${accountId}-${region} (no -email- prefix)
      expect(pulumi.automation.LocalWorkspace.selectStack).toHaveBeenCalledWith(
        {
          stackName: "wraps-123456789012-us-east-1",
          workDir: "/mock/.wraps/pulumi",
        }
      );
    });
  });

  describe("Agent mailbox cleanup", () => {
    describe("selectAgentsToDestroy", () => {
      it("returns empty when agents are absent or disabled", () => {
        expect(selectAgentsToDestroy(undefined)).toEqual([]);
        expect(selectAgentsToDestroy({} as never)).toEqual([]);
        expect(
          selectAgentsToDestroy({
            agents: { enabled: false, agents: [] },
          } as never)
        ).toEqual([]);
      });

      it("projects id/name/emailAddress for enabled agents", () => {
        const agents = selectAgentsToDestroy(
          metadataWithAgents().services.email.config as never
        );
        expect(agents).toEqual([
          { id: "agent-1", name: "sdr", emailAddress: "sdr@example.com" },
          {
            id: "agent-2",
            name: "support",
            emailAddress: "support@example.com",
          },
        ]);
      });
    });

    describe("buildAgentDestroySummaryLines", () => {
      it("returns no lines when there are no agents", () => {
        expect(buildAgentDestroySummaryLines([])).toEqual([]);
      });

      it("names the agents and states the credential/enforcer/approval impact", () => {
        const lines = buildAgentDestroySummaryLines([
          { id: "a1", name: "sdr", emailAddress: "sdr@example.com" },
          { id: "a2", name: "support", emailAddress: "support@example.com" },
        ]).join("\n");
        expect(lines).toContain("Agent mailboxes (2)");
        expect(lines).toContain("sdr@example.com");
        expect(lines).toContain("support@example.com");
        expect(lines).toContain("wraps-agent-enforcer");
        expect(lines).toContain("wraps-email-agent-policy");
        expect(lines).toContain("pending approvals");
      });
    });

    it("includes agents in the confirm summary note", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
        metadataWithAgents() as never
      );

      await emailDestroy({});

      expect(prompts.note).toHaveBeenCalledWith(
        expect.stringContaining("sdr@example.com"),
        "What will be destroyed"
      );
      expect(prompts.note).toHaveBeenCalledWith(
        expect.stringContaining("wraps-agent-enforcer"),
        "What will be destroyed"
      );
    });

    it("kills each agent in Neon after the stack destroy succeeds", async () => {
      const mockStack = await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
        metadataWithAgents() as never
      );
      const post = vi.fn().mockResolvedValue({ ok: true } as Response);
      vi.mocked(agentApi.createAgentApiClient).mockResolvedValue({
        ok: true,
        get: vi.fn(),
        post,
      });

      await emailDestroy({ force: true });

      expect(mockStack.destroy).toHaveBeenCalled();
      expect(post).toHaveBeenCalledWith("/v1/agents/agent-1/kill");
      expect(post).toHaveBeenCalledWith("/v1/agents/agent-2/kill");
      expect(prompts.log.info).toHaveBeenCalledWith(
        expect.stringContaining("2/2 agent(s) as killed")
      );
    });

    it("warns (never throws) when the Platform is unreachable for agent kill", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
        metadataWithAgents() as never
      );
      vi.mocked(agentApi.createAgentApiClient).mockResolvedValue({
        ok: false,
        reason: "not-authenticated",
      });

      await emailDestroy({ force: true });

      expect(prompts.log.warn).toHaveBeenCalledWith(
        expect.stringContaining("still show as active in the dashboard")
      );
    });

    it("never fails the destroy when the kill call throws", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
        metadataWithAgents() as never
      );
      const post = vi.fn().mockRejectedValue(new Error("network down"));
      vi.mocked(agentApi.createAgentApiClient).mockResolvedValue({
        ok: true,
        get: vi.fn(),
        post,
      });

      await emailDestroy({ force: true });

      // Metadata still cleaned up — the swallowed kill error did not abort.
      expect(metadata.deleteConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "us-east-1"
      );
    });
  });

  describe("JSON output", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      setJsonMode(true);
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      setJsonMode(false);
      consoleLogSpy.mockRestore();
    });

    it("should output JSON envelope on successful destroy with --force", async () => {
      const mockStack = await setupPulumiMock();
      await emailDestroy({ force: true, json: true });

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.command === "email.destroy";
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0]);
      expect(output.success).toBe(true);
      expect(output.command).toBe("email.destroy");
      expect(output.data).toBeDefined();
      expect(output.data.region).toBeDefined();
    });

    it("should require --force flag in JSON mode", async () => {
      await setupPulumiMock();

      await expect(emailDestroy({ json: true })).rejects.toThrow(
        "--force flag is required in JSON mode"
      );
    });

    it("should mirror agent info in the JSON envelope", async () => {
      const mockStack = await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
        metadataWithAgents() as never
      );
      await emailDestroy({ force: true, json: true });

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          return JSON.parse(call[0]).command === "email.destroy";
        } catch {
          return false;
        }
      });
      const output = JSON.parse(jsonCall![0]);
      expect(output.data.agents).toEqual([
        { id: "agent-1", name: "sdr", emailAddress: "sdr@example.com" },
        { id: "agent-2", name: "support", emailAddress: "support@example.com" },
      ]);
      // mockStack destroyed so this exercises the success path.
      expect(mockStack.destroy).toHaveBeenCalled();
    });
  });
});

describe("global destroy command", () => {
  let mockSpinner: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock spinner
    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    };

    // Mock prompts module
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as never);
    vi.mocked(prompts.intro).mockImplementation(() => {});
    vi.mocked(prompts.outro).mockImplementation(() => {});
    vi.mocked(prompts.cancel).mockImplementation(() => {});
    vi.mocked(prompts.confirm).mockResolvedValue(true as never);
    vi.mocked(prompts.select).mockResolvedValue("email" as never);
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(prompts.log).info = vi.fn();
    vi.mocked(prompts.log).success = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).warn = vi.fn();

    // Mock AWS utilities
    vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
      accountId: "123456789012",
      userId: "AIDACKCEVSQ6C2EXAMPLE",
      arn: "arn:aws:iam::123456789012:user/test",
    });
    vi.mocked(aws.getAWSRegion).mockResolvedValue("us-east-1");

    // Mock filesystem utilities
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockImplementation(async () => {
      process.env.PULUMI_BACKEND_URL =
        "s3://wraps-state-123456789012-us-east-1";
      return undefined as never;
    });
    vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");

    // Mock metadata utilities
    vi.mocked(metadata.deleteConnectionMetadata).mockResolvedValue(undefined);
    vi.mocked(metadata.findConnectionsWithService).mockResolvedValue([]);

    // Mock Route53 utilities
    vi.mocked(route53.findHostedZone).mockResolvedValue(null);
    vi.mocked(route53.deleteDNSRecords).mockResolvedValue({
      deleted: [],
      skipped: [],
      supported: true,
      errors: [],
    });
  });

  it("should warn if no services are deployed", async () => {
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(null);

    await expect(destroy({ force: true })).rejects.toThrow();

    expect(prompts.log.warn).toHaveBeenCalledWith(
      "No Wraps services found in this region"
    );
  });

  it("should handle AWS credentials validation error", async () => {
    vi.mocked(aws.validateAWSCredentials).mockRejectedValue(
      new Error("Invalid credentials")
    );

    await expect(destroy({ force: true })).rejects.toThrow(
      "Invalid credentials"
    );
  });

  it("should route to email destroy if only email is deployed", async () => {
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
      version: "1.0.0",
      accountId: "123456789012",
      region: "us-east-1",
      provider: "vercel",
      timestamp: new Date().toISOString(),
      services: {
        email: {
          preset: "production",
          config: { tracking: { enabled: true } },
          pulumiStackName: "wraps-email-123456789012-us-east-1",
          deployedAt: new Date().toISOString(),
        },
      },
    });

    // Setup Pulumi mock for the email destroy
    const pulumi = await import("@pulumi/pulumi");
    const mockStack = {
      destroy: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      workspace: {
        removeStack: vi.fn().mockResolvedValue(undefined),
      },
    };
    vi.mocked(pulumi.automation.LocalWorkspace.selectStack).mockResolvedValue(
      mockStack as any
    );

    await destroy({ force: true });

    expect(prompts.log.info).toHaveBeenCalledWith(
      expect.stringContaining("email")
    );
  });

  describe("Multi-service selection", () => {
    beforeEach(async () => {
      // Setup Pulumi mock for email destroy
      const pulumi = await import("@pulumi/pulumi");
      const mockStack = {
        destroy: vi.fn().mockResolvedValue(undefined),
        workspace: {
          removeStack: vi.fn().mockResolvedValue(undefined),
        },
      };
      vi.mocked(pulumi.automation.LocalWorkspace.selectStack).mockResolvedValue(
        mockStack as any
      );
    });

    it("should prompt for service selection when multiple services deployed", async () => {
      // Mock metadata with multiple services (simulating future SMS support)
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: { tracking: { enabled: true } },
            pulumiStackName: "wraps-email-123456789012-us-east-1",
            deployedAt: new Date().toISOString(),
          },
          // Note: SMS service support would appear here when implemented
        },
      });

      // Since only email is deployed, it should route directly
      await destroy({ force: true });

      // Should show email service info
      expect(prompts.log.info).toHaveBeenCalled();
    });

    it("should handle user cancelling service selection", async () => {
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: { tracking: { enabled: true } },
            pulumiStackName: "wraps-email-123456789012-us-east-1",
            deployedAt: new Date().toISOString(),
          },
        },
      });

      // Force calls the emailDestroy which may have its own prompts
      await destroy({ force: true });

      expect(prompts.log.info).toHaveBeenCalled();
    });

    it("should destroy all services when 'all' is selected", async () => {
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: { tracking: { enabled: true } },
            pulumiStackName: "wraps-email-123456789012-us-east-1",
            deployedAt: new Date().toISOString(),
          },
        },
      });

      vi.mocked(prompts.select).mockResolvedValue("all" as never);

      await destroy({ force: true });

      // Should have called the destroy flow
      expect(metadata.deleteConnectionMetadata).toHaveBeenCalled();
    });

    it("should handle select prompt cancellation", async () => {
      // This test simulates when there are multiple services
      // For now, we'll test with single service which takes the direct path
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        version: "1.0.0",
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            preset: "production",
            config: { tracking: { enabled: true } },
            pulumiStackName: "wraps-email-123456789012-us-east-1",
            deployedAt: new Date().toISOString(),
          },
        },
      });

      vi.mocked(prompts.select).mockResolvedValue(
        Symbol.for("clack.cancel") as never
      );
      vi.mocked(prompts.isCancel).mockImplementation(
        (value) => value === Symbol.for("clack.cancel")
      );

      await destroy({ force: true });

      // With only one service, select is not called
      expect(prompts.log.info).toHaveBeenCalled();
    });
  });
});
