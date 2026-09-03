import {
  CreateRoleCommand,
  GetRoleCommand,
  IAMClient,
  PutRolePolicyCommand,
  UpdateAssumeRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";

// Mock all external dependencies
vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: {
      createOrSelectStack: vi.fn(),
    },
    installPulumiCli: vi.fn(),
  },
}));
vi.mock("@pulumi/pulumi/automation", () => ({
  LocalWorkspace: {
    createOrSelectStack: vi.fn(),
  },
  installPulumiCli: vi.fn(),
}));
vi.mock("@clack/prompts");
// Do NOT vi.mock("@aws-sdk/client-iam") — mockClient patches the prototype
// directly (see the adoption regression-guard tests below, which assert on
// exactly which IAM commands were sent).
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/fs.js");
vi.mock("../../utils/shared/metadata.js");
vi.mock("../../utils/shared/pulumi.js");
vi.mock("../../utils/shared/prompts.js");
vi.mock("../../utils/shared/config.js");
vi.mock("../../infrastructure/email-stack.js");
vi.mock("../../telemetry/events.js");

import * as prompts from "@clack/prompts";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import type { EmailStackConfig } from "../../types/index.js";
import * as aws from "../../utils/shared/aws.js";
import * as config from "../../utils/shared/config.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as metadata from "../../utils/shared/metadata.js";
import * as pulumiUtils from "../../utils/shared/pulumi.js";
// Import after mocks
import { connect } from "../platform/connect.js";
import { buildConsolePolicyDocument } from "../platform/update-role.js";

const iamMock = mockClient(IAMClient);

describe("platform connect - import collision fix", () => {
  let capturedStackConfig: EmailStackConfig | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    iamMock.reset();
    capturedStackConfig = undefined;

    // Role exists by default — the update-in-place path most tests exercise.
    iamMock.on(GetRoleCommand).resolves({
      Role: { RoleName: "wraps-console-access-role" } as any,
    });
    iamMock.on(CreateRoleCommand).resolves({});
    iamMock.on(PutRolePolicyCommand).resolves({});
    iamMock.on(UpdateAssumeRolePolicyCommand).resolves({});

    // Mock prompts
    const mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    };
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as never);
    vi.mocked(prompts.intro).mockImplementation(() => {});
    vi.mocked(prompts.outro).mockImplementation(() => {});
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(prompts.log).info = vi.fn();
    vi.mocked(prompts.log).success = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).warn = vi.fn();
    vi.mocked(prompts.log).step = vi.fn();
    vi.mocked(prompts.select).mockResolvedValue("org-1");
    vi.mocked(prompts.confirm).mockResolvedValue(true);

    // Mock AWS utilities
    vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
      accountId: "123456789012",
      userId: "AIDACKCEVSQ6C2EXAMPLE",
      arn: "arn:aws:iam::123456789012:user/test",
    });
    vi.mocked(aws.getAWSRegion).mockResolvedValue("us-east-1");

    // Mock Pulumi utilities
    vi.mocked(pulumiUtils.ensurePulumiInstalled).mockResolvedValue(false);

    // Mock filesystem utilities
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockResolvedValue(undefined);
    vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");

    // Mock auth config - authenticated flow
    vi.mocked(config.resolveTokenAsync).mockResolvedValue("test-token-123");
    vi.mocked(config.readAuthConfig).mockResolvedValue({
      auth: {
        token: "test-token-123",
        tokenType: "session" as const,
        organizations: [{ id: "org-1", name: "Test Org", slug: "test-org" }],
      },
    });

    // Mock metadata with existing email service
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
      version: "1.0.0",
      accountId: "123456789012",
      region: "us-east-1",
      provider: "vercel",
      timestamp: new Date().toISOString(),
      vercel: { teamSlug: "my-team", projectName: "my-project" },
      services: {
        email: {
          config: {
            sendingEnabled: true,
            tracking: { enabled: true },
            eventTracking: { enabled: true, events: ["SEND", "DELIVERY"] },
          },
          preset: "production",
          pulumiStackName: "wraps-123456789012-us-east-1",
        },
      },
    } as any);
    vi.mocked(metadata.saveConnectionMetadata).mockResolvedValue(undefined);
    vi.mocked(metadata.buildEmailStackConfig).mockImplementation(
      (meta, region, overrides) => {
        const cfg: EmailStackConfig = {
          provider: meta.provider,
          region,
          vercel: meta.vercel,
          emailConfig: meta.services.email!.config as any,
          webhook: overrides?.webhook,
        };
        capturedStackConfig = cfg;
        return cfg;
      }
    );

    // Mock deployEmailStack
    vi.mocked(deployEmailStack).mockResolvedValue({
      roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
      configSetName: "wraps-email-tracking",
      region: "us-east-1",
    } as any);

    // Mock fetch for platform API registration
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          connectionId: "conn-abc-123",
          externalId: "ext-123",
          webhookSecret: "webhook-secret-456",
        }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  async function setupPulumiMock(options: { hasExistingResources: boolean }) {
    const pulumi = await import("@pulumi/pulumi");
    const pulumiAutomation = await import("@pulumi/pulumi/automation");

    const mockStack = {
      workspace: {
        selectStack: vi.fn().mockResolvedValue(undefined),
      },
      setConfig: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      exportStack: vi.fn().mockResolvedValue({
        deployment: {
          resources: options.hasExistingResources
            ? [
                // Root stack resource (always present)
                {
                  urn: "urn:pulumi:wraps::wraps-email::pulumi:pulumi:Stack::wraps-email-wraps-123",
                  type: "pulumi:pulumi:Stack",
                },
                // Existing SES ConfigurationSet (from prior wraps email init)
                {
                  urn: "urn:pulumi:wraps::wraps-email::aws:sesv2/configurationSet:ConfigurationSet::wraps-email-tracking",
                  type: "aws:sesv2/configurationSet:ConfigurationSet",
                  id: "wraps-email-tracking",
                },
                // Existing IAM role
                {
                  urn: "urn:pulumi:wraps::wraps-email::aws:iam/role:Role::wraps-email-role",
                  type: "aws:iam/role:Role",
                  id: "wraps-email-role",
                },
              ]
            : [
                // Only root resource — fresh stack
                {
                  urn: "urn:pulumi:wraps::wraps-email::pulumi:pulumi:Stack::wraps-email-wraps-123",
                  type: "pulumi:pulumi:Stack",
                },
              ],
        },
      }),
      up: vi.fn().mockResolvedValue({
        outputs: {
          roleArn: {
            value: "arn:aws:iam::123456789012:role/wraps-email-role",
          },
          configSetName: { value: "wraps-email-tracking" },
          region: { value: "us-east-1" },
        },
      }),
    } as any;

    const createOrSelectStackMock = vi.fn().mockImplementation(async (args) => {
      // Don't execute the program during test setup —
      // it will be executed by stack.up() in real code
      return mockStack;
    });

    vi.mocked(
      pulumi.automation.LocalWorkspace.createOrSelectStack
    ).mockImplementation(createOrSelectStackMock);
    vi.mocked(
      pulumiAutomation.LocalWorkspace.createOrSelectStack
    ).mockImplementation(createOrSelectStackMock);

    return mockStack;
  }

  it("should set skipResourceImports=true when stack already has resources", async () => {
    await setupPulumiMock({ hasExistingResources: true });

    await connect({ yes: true });

    // The stack config should have skipResourceImports set to true
    // because the stack already has resources from a prior deployment
    expect(capturedStackConfig).toBeDefined();
    expect(capturedStackConfig!.skipResourceImports).toBe(true);
  });

  it("should NOT set skipResourceImports when stack is fresh (no existing resources)", async () => {
    await setupPulumiMock({ hasExistingResources: false });

    await connect({ yes: true });

    // Fresh stack — import flags should be used for first-time resource import
    expect(capturedStackConfig).toBeDefined();
    expect(capturedStackConfig!.skipResourceImports).toBeUndefined();
  });

  it("should call exportStack after refresh but before up", async () => {
    const mockStack = await setupPulumiMock({
      hasExistingResources: true,
    });

    await connect({ yes: true });

    // Verify the call order: refresh → exportStack → up
    const refreshOrder = mockStack.refresh.mock.invocationCallOrder[0];
    const exportOrder = mockStack.exportStack.mock.invocationCallOrder[0];
    const upOrder = mockStack.up.mock.invocationCallOrder[0];

    expect(refreshOrder).toBeLessThan(exportOrder);
    expect(exportOrder).toBeLessThan(upOrder);
  });

  it("still writes the inline policy for a normal (non-adopted) connect", async () => {
    // Regression guard for the opposite direction of the adoption tests
    // below: step 1's `hasPolicySource` guard must not silently disable
    // policy updates for a connection that has real service config.
    await setupPulumiMock({ hasExistingResources: true });

    await connect({ yes: true });

    expect(iamMock.commandCalls(PutRolePolicyCommand)).toHaveLength(1);
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

    it("should output JSON envelope on successful platform connect", async () => {
      await setupPulumiMock({ hasExistingResources: true });
      await connect({ yes: true, json: true });

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.command === "platform.connect";
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0]);
      expect(output.success).toBe(true);
      expect(output.command).toBe("platform.connect");
      expect(output.data).toBeDefined();
      expect(output.data.accountId).toBeDefined();
      expect(output.data.connectionId).toBeDefined();
    });
  });

  describe("adoption — no local deployment record", () => {
    beforeEach(() => {
      // No local/S3 metadata for this account/region — the dead-end case
      // this plan replaces.
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(undefined);
      vi.mocked(metadata.createAdoptedConnectionMetadata).mockImplementation(
        (accountId, region, provider) =>
          ({
            version: "1.0.0",
            accountId,
            region,
            provider,
            timestamp: "2026-09-02T00:00:00.000Z",
            services: {},
          }) as any
      );
    });

    it("repairs the trust policy using the External ID from registration", async () => {
      await connect({ yes: true });

      const updateCalls = iamMock.commandCalls(UpdateAssumeRolePolicyCommand);
      expect(updateCalls).toHaveLength(1);
      const trustPolicy = JSON.parse(
        updateCalls[0].args[0].input.PolicyDocument!
      );
      expect(
        trustPolicy.Statement[0].Condition.StringEquals["sts:ExternalId"]
      ).toBe("ext-123");
    });

    it("does NOT rewrite the inline permissions policy (regression guard)", async () => {
      // Without step 1's `hasPolicySource` guard, this call would replace a
      // working (possibly CloudFormation-owned) permissions policy with a
      // narrower one built from empty config.
      await connect({ yes: true });

      expect(iamMock.commandCalls(PutRolePolicyCommand)).toHaveLength(0);
    });

    it("deploys no infrastructure", async () => {
      await connect({ yes: true });

      const pulumi = await import("@pulumi/pulumi");
      expect(
        pulumi.automation.LocalWorkspace.createOrSelectStack
      ).not.toHaveBeenCalled();
    });

    it("persists metadata for the caller's account and region", async () => {
      await connect({ yes: true });

      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "123456789012",
          region: "us-east-1",
        })
      );
    });
  });

  describe("platform connect — console role policy", () => {
    // Regression guard for plan 240: `connect` used to build the inline
    // console-role policy from a private, stale copy of
    // buildConsolePolicyDocument that never learned ses:ListConfigurationSets
    // (added to the real one by e9354ceb). `connect` now imports the same
    // function `update-role.ts` exports — these tests pin that both the
    // update-in-place and create-role paths grant the same actions the
    // exported builder produces.
    function grantedActions(): string[] {
      const calls = iamMock.commandCalls(PutRolePolicyCommand);
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1];
      // biome-ignore lint/style/noNonNullAssertion: the SDK input is always set here
      const doc = JSON.parse(lastCall.args[0].input.PolicyDocument!);
      return doc.Statement.flatMap((s: { Action: string[] }) => s.Action);
    }

    it("update-in-place path grants ses:ListConfigurationSets and friends, and no dynamodb:PutItem", async () => {
      // Default beforeEach: GetRoleCommand resolves — role exists.
      await setupPulumiMock({ hasExistingResources: true });

      await connect({ yes: true });

      const actions = grantedActions();
      expect(actions).toContain("ses:ListConfigurationSets");
      expect(actions).toContain("ses:GetConfigurationSet");
      expect(actions).toContain("ses:GetConfigurationSetEventDestinations");
      expect(actions).toContain("ses:GetDedicatedIps");
      expect(actions).toContain("s3:HeadBucket");
      expect(actions).not.toContain("dynamodb:PutItem");
    });

    it("create path (role does not exist) grants the same actions", async () => {
      iamMock.on(GetRoleCommand).rejects(
        Object.assign(new Error("NoSuchEntity"), {
          name: "NoSuchEntityException",
        })
      );
      await setupPulumiMock({ hasExistingResources: true });

      await connect({ yes: true });

      expect(iamMock.commandCalls(CreateRoleCommand)).toHaveLength(1);

      const actions = grantedActions();
      expect(actions).toContain("ses:ListConfigurationSets");
      expect(actions).toContain("ses:GetConfigurationSet");
      expect(actions).toContain("ses:GetConfigurationSetEventDestinations");
      expect(actions).toContain("ses:GetDedicatedIps");
      expect(actions).toContain("s3:HeadBucket");
      expect(actions).not.toContain("dynamodb:PutItem");
    });

    it("grants exactly the actions buildConsolePolicyDocument produces for the same config", async () => {
      await setupPulumiMock({ hasExistingResources: true });

      await connect({ yes: true });

      const emailConfig = {
        sendingEnabled: true,
        tracking: { enabled: true },
        eventTracking: { enabled: true, events: ["SEND", "DELIVERY"] },
      };
      const expected = buildConsolePolicyDocument(
        emailConfig,
        undefined
      ).Statement.flatMap((s) => s.Action);

      expect([...grantedActions()].sort()).toEqual([...expected].sort());
    });
  });
});
