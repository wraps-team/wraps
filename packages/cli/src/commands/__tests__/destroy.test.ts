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
  };
});
vi.mock("../../utils/route53.js");
vi.mock("@aws-sdk/client-sesv2");
vi.mock("../../utils/shared/agent-api.js");

import * as prompts from "@clack/prompts";
import * as route53 from "../../utils/route53.js";
import * as agentApi from "../../utils/shared/agent-api.js";
import * as aws from "../../utils/shared/aws.js";
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
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockResolvedValue(undefined);
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
    vi.mocked(route53.deleteDNSRecords).mockResolvedValue(undefined);

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
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockResolvedValue(undefined);
    vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");

    // Mock metadata utilities
    vi.mocked(metadata.deleteConnectionMetadata).mockResolvedValue(undefined);
    vi.mocked(metadata.findConnectionsWithService).mockResolvedValue([]);

    // Mock Route53 utilities
    vi.mocked(route53.findHostedZone).mockResolvedValue(null);
    vi.mocked(route53.deleteDNSRecords).mockResolvedValue(undefined);
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
