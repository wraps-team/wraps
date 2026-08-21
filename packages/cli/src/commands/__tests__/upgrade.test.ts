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
 * Tracking-domain setup looks up the hosted zone through Route53. Unmocked the
 * suite made live route53.amazonaws.com calls on every tracking-domain test.
 */
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
/**
 * The post-deploy pipeline check is stubbed so a test can decide exactly which
 * hops come back non-passing. Every other test keeps the empty default, which
 * is the "nothing to warn about" path.
 */
vi.mock("../../utils/email/event-pipeline-check.js", () => ({
  checkEventPipeline: vi.fn().mockResolvedValue([]),
}));
// Event-pipeline check clients (post-deploy warn-only check in upgrade.ts) —
// mocked so the check resolves instantly instead of hitting real AWS.
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = vi.fn().mockResolvedValue({});
  },
  GetConfigurationSetEventDestinationsCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send = vi.fn().mockResolvedValue({});
  },
  DescribeRuleCommand: class {
    constructor(public input: unknown) {}
  },
  ListTargetsByRuleCommand: class {
    constructor(public input: unknown) {}
  },
  DescribeApiDestinationCommand: class {
    constructor(public input: unknown) {}
  },
  DescribeConnectionCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send = vi.fn().mockResolvedValue({});
  },
  GetQueueUrlCommand: class {
    constructor(public input: unknown) {}
  },
  GetQueueAttributesCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: class {
    send = vi.fn().mockResolvedValue({});
  },
  ListEventSourceMappingsCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = vi.fn().mockResolvedValue({});
  },
  DescribeTableCommand: class {
    constructor(public input: unknown) {}
  },
}));

import * as prompts from "@clack/prompts";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import { checkEventPipeline } from "../../utils/email/event-pipeline-check.js";
import * as aws from "../../utils/shared/aws.js";
import { remediations } from "../../utils/shared/doctor-remediation.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as metadata from "../../utils/shared/metadata.js";
import * as promptUtils from "../../utils/shared/prompts.js";
import * as pulumiUtils from "../../utils/shared/pulumi.js";
// Import after mocks
import { upgrade } from "../email/upgrade.js";

describe("upgrade command", () => {
  let mockSpinner: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
  };

  // Helper to create complete starter config with deep merge
  const createStarterConfig = (overrides: any = {}) => {
    const base = {
      domain: "example.com",
      tracking: {
        enabled: true,
        opens: true,
        clicks: true,
      },
      tlsRequired: true,
      reputationMetrics: false,
      suppressionList: {
        enabled: true,
        reasons: ["BOUNCE", "COMPLAINT"],
      },
      eventTracking: {
        enabled: false,
      },
      emailArchiving: {
        enabled: false,
        retention: "30days",
      },
      sendingEnabled: true,
    };

    // Deep merge overrides
    const result = { ...base };
    for (const [key, value] of Object.entries(overrides)) {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        result[key as keyof typeof base] = {
          ...(base[key as keyof typeof base] as any),
          ...(value as any),
        };
      } else {
        result[key as keyof typeof base] = value as any;
      }
    }
    return result;
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
    vi.mocked(prompts.note).mockImplementation(() => {});
    vi.mocked(prompts.log).info = vi.fn();
    vi.mocked(prompts.log).success = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).warn = vi.fn();
    vi.mocked(prompts.log).step = vi.fn();
    vi.mocked(prompts.isCancel).mockReturnValue(false);

    // Mock AWS utilities
    vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
      accountId: "123456789012",
      userId: "AIDACKCEVSQ6C2EXAMPLE",
      arn: "arn:aws:iam::123456789012:user/test",
    });
    vi.mocked(aws.getAWSRegion).mockResolvedValue("us-east-1");
    vi.mocked(aws.listSESDomains).mockResolvedValue([
      { domain: "example.com", verified: true },
    ]);

    // Mock Pulumi utilities
    vi.mocked(pulumiUtils.ensurePulumiInstalled).mockResolvedValue(false);

    // Mock filesystem utilities
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockReturnValue(undefined);
    vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");

    // Mock metadata utilities - default to existing starter connection
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
      accountId: "123456789012",
      region: "us-east-1",
      provider: "vercel",
      timestamp: new Date().toISOString(),
      services: {
        email: {
          config: createStarterConfig(),
          preset: "starter",
          pulumiStackName: "wraps-123456789012-us-east-1",
        },
      },
    } as any);

    vi.mocked(metadata.saveConnectionMetadata).mockResolvedValue(undefined);
    vi.mocked(metadata.updateEmailConfig).mockImplementation(() => {});

    // Mock prompt utilities
    vi.mocked(promptUtils.promptVercelConfig).mockResolvedValue({
      teamSlug: "my-team",
    });

    // Mock deployEmailStack
    vi.mocked(deployEmailStack).mockResolvedValue({
      roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
      configSetName: "wraps-email-tracking",
      tableName: "wraps-email-history",
      region: "us-east-1",
      lambdaFunctions: ["wraps-email-processor"],
      domain: "example.com",
      dkimTokens: ["token1", "token2", "token3"],
    } as any);
  });

  // Helper function to setup Pulumi mocking
  async function setupPulumiMock() {
    const pulumi = await import("@pulumi/pulumi");
    const pulumiAutomation = await import("@pulumi/pulumi/automation");

    const mockStack = {
      workspace: {
        selectStack: vi.fn().mockResolvedValue(undefined),
      },
      setConfig: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue({
        summary: { kind: "refresh", result: "succeeded" },
      }),
      up: vi.fn().mockResolvedValue({
        outputs: {
          roleArn: {
            value: "arn:aws:iam::123456789012:role/wraps-email-role",
          },
          configSetName: { value: "wraps-email-tracking" },
          tableName: { value: "wraps-email-history" },
          region: { value: "us-east-1" },
        },
      }),
    } as any;

    // Mock createOrSelectStack to execute the program function
    const createOrSelectStackMock = vi.fn().mockImplementation(async (args) => {
      // Execute the program function if it exists
      if (args.program) {
        await args.program();
      }
      return mockStack;
    });

    vi.mocked(
      pulumi.automation.LocalWorkspace.createOrSelectStack
    ).mockImplementation(createOrSelectStackMock);
    vi.mocked(
      pulumiAutomation.LocalWorkspace.createOrSelectStack
    ).mockImplementation(createOrSelectStackMock);
  }

  describe("Core Flow Tests", () => {
    it("should validate AWS credentials", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(aws.validateAWSCredentials).toHaveBeenCalled();
    });

    it("should check Pulumi installation", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(pulumiUtils.ensurePulumiInstalled).toHaveBeenCalled();
    });

    it("should load existing connection metadata", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(metadata.loadConnectionMetadata).toHaveBeenCalledWith(
        "123456789012",
        "us-east-1"
      );
    });

    it("should display current configuration", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      // Verify info logs were called (showing current config)
      expect(prompts.log.info).toHaveBeenCalled();
    });

    it("should prompt for upgrade action", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(prompts.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "What would you like to do?",
        })
      );
    });
  });

  describe("Preset Upgrade Tests", () => {
    it("should upgrade from Starter to Production", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never) // upgrade action
        .mockResolvedValueOnce("production" as never); // new preset
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      // Verify metadata was updated with new preset
      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          services: expect.objectContaining({
            email: expect.objectContaining({
              preset: "production",
            }),
          }),
        })
      );
    });

    it("should upgrade from Production to Enterprise", async () => {
      await setupPulumiMock();
      // Mock existing production connection
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              reputationMetrics: true,
              eventTracking: {
                enabled: true,
                eventBridge: true,
                events: [
                  "SEND",
                  "DELIVERY",
                  "OPEN",
                  "CLICK",
                  "BOUNCE",
                  "COMPLAINT",
                ],
                dynamoDBHistory: true,
                archiveRetention: "90days",
              },
            }),
            preset: "production",
          },
        },
      } as any);

      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("enterprise" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          services: expect.objectContaining({
            email: expect.objectContaining({
              preset: "enterprise",
            }),
          }),
        })
      );
    });

    it("should prevent downgrade to lower preset", async () => {
      // TODO: This test requires reliable process.exit mocking which is complex in Vitest
      // The actual code works correctly (calls process.exit(0) at upgrade.ts:243)
      // but mocking process.exit to throw doesn't work reliably in the test environment
      // Skipping until we can refactor to use a testable error handling pattern
      await setupPulumiMock();

      // Mock process.exit to throw instead - MUST be set up first
      const mockExit = vi.spyOn(process, "exit").mockImplementation(((
        code?: string | number | null | undefined
      ) => {
        throw new Error(`process.exit(${code})`);
      }) as any);

      // Mock existing enterprise connection
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              reputationMetrics: true,
              dedicatedIp: true,
              eventTracking: {
                enabled: true,
                eventBridge: true,
                events: [
                  "SEND",
                  "DELIVERY",
                  "OPEN",
                  "CLICK",
                  "BOUNCE",
                  "COMPLAINT",
                  "REJECT",
                  "RENDERING_FAILURE",
                  "DELIVERY_DELAY",
                  "SUBSCRIPTION",
                ],
                dynamoDBHistory: true,
                archiveRetention: "1year",
              },
            }),
            preset: "enterprise",
          },
        },
      } as any);

      vi.mocked(prompts.select).mockResolvedValueOnce("preset" as never);

      await expect(upgrade({})).rejects.toThrow("process.exit");
      expect(prompts.log.warn).toHaveBeenCalledWith(
        "Already on highest preset (Enterprise)"
      );

      mockExit.mockRestore();
    });

    it("should preserve domain when upgrading preset", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      // Verify deployEmailStack was called with preserved domain
      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            domain: "example.com", // Original domain preserved
          }),
        })
      );
    });
  });

  describe("Custom Tracking Domain Tests", () => {
    it("should add custom tracking domain", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select).mockResolvedValueOnce(
        "tracking-domain" as never
      );
      vi.mocked(prompts.text).mockResolvedValue("track.example.com" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            tracking: expect.objectContaining({
              customRedirectDomain: "track.example.com",
            }),
          }),
        })
      );
    });

    it("should validate tracking domain format", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select).mockResolvedValueOnce(
        "tracking-domain" as never
      );
      vi.mocked(prompts.text).mockImplementation((opts: any) => {
        // Test validation
        const result = opts.validate?.("invalid domain!");
        expect(result).toBe("Please enter a valid domain");
        return Promise.resolve("track.example.com" as never);
      });
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});
    });

    it("should change existing tracking domain", async () => {
      await setupPulumiMock();
      // Mock existing connection with tracking domain
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              tracking: {
                enabled: true,
                opens: true,
                clicks: true,
                customRedirectDomain: "old.example.com",
              },
            }),
            preset: "starter",
          },
        },
      } as any);

      vi.mocked(prompts.select).mockResolvedValueOnce(
        "tracking-domain" as never
      );
      vi.mocked(prompts.text).mockResolvedValue("new.example.com" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            tracking: expect.objectContaining({
              customRedirectDomain: "new.example.com",
            }),
          }),
        })
      );
    });
  });

  describe("Email History Retention Tests", () => {
    it("should change retention to 7 days", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("retention" as never)
        .mockResolvedValueOnce("7days" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            eventTracking: expect.objectContaining({
              archiveRetention: "7days",
            }),
          }),
        })
      );
    });

    it("should change retention to 1 year", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("retention" as never)
        .mockResolvedValueOnce("1year" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            eventTracking: expect.objectContaining({
              archiveRetention: "1year",
            }),
          }),
        })
      );
    });

    it("should change retention to indefinite", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("retention" as never)
        .mockResolvedValueOnce("indefinite" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            eventTracking: expect.objectContaining({
              archiveRetention: "indefinite",
            }),
          }),
        })
      );
    });
  });

  describe("Event Type Customization Tests", () => {
    it("should customize tracked event types", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select).mockResolvedValueOnce("events" as never);
      vi.mocked(prompts.multiselect).mockResolvedValue([
        "SEND",
        "DELIVERY",
        "BOUNCE",
      ] as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            eventTracking: expect.objectContaining({
              events: ["SEND", "DELIVERY", "BOUNCE"],
            }),
          }),
        })
      );
    });

    it("should track all event types", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select).mockResolvedValueOnce("events" as never);
      vi.mocked(prompts.multiselect).mockResolvedValue([
        "SEND",
        "DELIVERY",
        "OPEN",
        "CLICK",
        "BOUNCE",
        "COMPLAINT",
        "REJECT",
        "RENDERING_FAILURE",
        "DELIVERY_DELAY",
        "SUBSCRIPTION",
      ] as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            eventTracking: expect.objectContaining({
              events: expect.arrayContaining([
                "SEND",
                "DELIVERY",
                "OPEN",
                "CLICK",
                "BOUNCE",
                "COMPLAINT",
                "REJECT",
                "RENDERING_FAILURE",
                "DELIVERY_DELAY",
                "SUBSCRIPTION",
              ]),
            }),
          }),
        })
      );
    });
  });

  describe("Dedicated IP Tests", () => {
    it("should enable dedicated IP", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select).mockResolvedValueOnce("dedicated-ip" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            dedicatedIp: true,
          }),
        })
      );
    });

    it("should cancel when declining dedicated IP", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select).mockResolvedValueOnce("dedicated-ip" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(false as never);

      await expect(upgrade({})).rejects.toThrow();
      expect(prompts.log.info).toHaveBeenCalledWith(
        "Dedicated IP not enabled."
      );
    });
  });

  describe("Cost Comparison Tests", () => {
    it("should show cost increase", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      const consoleSpy = vi.spyOn(console, "log");

      await upgrade({});

      // Verify cost comparison was displayed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cost Impact:")
      );
    });

    it("should calculate cost delta correctly", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      const consoleSpy = vi.spyOn(console, "log");

      await upgrade({});

      // Check that cost lines were displayed
      const costCalls = consoleSpy.mock.calls.filter((call) =>
        call[0]?.includes("Current:")
      );
      expect(costCalls.length).toBeGreaterThan(0);
    });

    it("should show cost decrease when disabling features", async () => {
      await setupPulumiMock();
      // Start with more features enabled
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              eventTracking: {
                enabled: true,
                eventBridge: true,
                events: ["SEND", "DELIVERY", "OPEN", "CLICK"],
                dynamoDBHistory: true,
                archiveRetention: "1year",
              },
            }),
            preset: undefined, // Custom config
            pulumiStackName: "wraps-123456789012-us-east-1",
          },
        },
      } as any);

      // Change retention from 365 days to 7 days (cost decrease)
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("retention" as never)
        .mockResolvedValueOnce("7days" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      const consoleSpy = vi.spyOn(console, "log");

      await upgrade({});

      // Should show cost comparison - verify both current and new are shown
      const costCalls = consoleSpy.mock.calls.filter(
        (call) =>
          call[0]?.includes("Current:") ||
          call[0]?.includes("New:") ||
          call[0]?.includes("Change:")
      );
      expect(costCalls.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle user declining confirmation", async () => {
      await setupPulumiMock();
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((() => {}) as any);

      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValueOnce(false as never);

      try {
        await upgrade({});
      } catch {
        // Process.exit will stop execution
      }

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });
  });

  describe("Error Handling Tests", () => {
    it("should handle no existing connection", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(null);

      await expect(upgrade({})).rejects.toThrow();
      expect(prompts.log.error).toHaveBeenCalledWith(
        expect.stringContaining("No Wraps connection found")
      );
    });

    it("should handle Pulumi lock error", async () => {
      // Set up Pulumi mock that throws lock error (don't use setupPulumiMock helper)
      const pulumi = await import("@pulumi/pulumi");
      const pulumiAutomation = await import("@pulumi/pulumi/automation");

      const mockStack = {
        workspace: {
          selectStack: vi.fn().mockResolvedValue(undefined),
        },
        setConfig: vi.fn().mockResolvedValue(undefined),
        refresh: vi.fn().mockResolvedValue({
          summary: { kind: "refresh", result: "succeeded" },
        }),
        up: vi
          .fn()
          .mockRejectedValue(
            new Error("the stack is currently locked by 1 lock(s)")
          ),
      } as any;

      const createOrSelectStackMock = vi
        .fn()
        .mockImplementation(async (args) => {
          if (args.program) {
            await args.program();
          }
          return mockStack;
        });

      vi.mocked(
        pulumi.automation.LocalWorkspace.createOrSelectStack
      ).mockImplementation(createOrSelectStackMock);
      vi.mocked(
        pulumiAutomation.LocalWorkspace.createOrSelectStack
      ).mockImplementation(createOrSelectStackMock);

      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await expect(upgrade({})).rejects.toThrow(/locked/);
    });

    it("should handle user cancellation", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select).mockResolvedValueOnce("preset" as never);
      vi.mocked(prompts.isCancel).mockReturnValueOnce(true);

      await expect(upgrade({})).rejects.toThrow();
    });
  });

  describe("State Management Tests", () => {
    it("should update metadata after upgrade", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(metadata.saveConnectionMetadata).toHaveBeenCalled();
    });

    it("should update email config in metadata", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select).mockResolvedValueOnce("retention" as never);
      vi.mocked(prompts.select).mockResolvedValueOnce("7days" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(metadata.updateEmailConfig).toHaveBeenCalled();
    });

    it("should clear preset when using custom config", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select).mockResolvedValueOnce("retention" as never);
      vi.mocked(prompts.select).mockResolvedValueOnce("30days" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      // Verify preset is undefined (custom config)
      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          services: expect.objectContaining({
            email: expect.objectContaining({
              preset: undefined,
            }),
          }),
        })
      );
    });

    it("should handle custom tracking domain in outputs", async () => {
      const pulumi = await import("@pulumi/pulumi");
      const pulumiAutomation = await import("@pulumi/pulumi/automation");

      const mockStack = {
        workspace: {
          selectStack: vi.fn().mockResolvedValue(undefined),
        },
        setConfig: vi.fn().mockResolvedValue(undefined),
        refresh: vi.fn().mockResolvedValue({
          summary: { kind: "refresh", result: "succeeded" },
        }),
        up: vi.fn().mockResolvedValue({
          outputs: {
            roleArn: {
              value: "arn:aws:iam::123456789012:role/wraps-email-role",
            },
            configSetName: { value: "wraps-email-tracking" },
            tableName: { value: "wraps-email-history" },
            region: { value: "us-east-1" },
            customTrackingDomain: { value: "track.example.com" },
          },
        }),
      } as any;

      const createOrSelectStackMock = vi
        .fn()
        .mockImplementation(async (args) => {
          if (args.program) {
            await args.program();
          }
          return mockStack;
        });

      vi.mocked(
        pulumi.automation.LocalWorkspace.createOrSelectStack
      ).mockImplementation(createOrSelectStackMock);
      vi.mocked(
        pulumiAutomation.LocalWorkspace.createOrSelectStack
      ).mockImplementation(createOrSelectStackMock);

      vi.mocked(prompts.select).mockResolvedValueOnce("preset" as never);
      vi.mocked(prompts.select).mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      const consoleSpy = vi.spyOn(console, "log");

      await upgrade({});

      // Should display custom tracking domain DNS records
      const trackingDomainCalls = consoleSpy.mock.calls.filter((call) =>
        call[0]?.includes("track.example.com")
      );
      expect(trackingDomainCalls.length).toBeGreaterThan(0);
    });
  });

  describe("Vercel Configuration Tests", () => {
    it("should prompt for Vercel config if not stored", async () => {
      await setupPulumiMock();
      // Mock existing connection without Vercel config
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig(),
            preset: "starter",
          },
        },
      } as any);

      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(promptUtils.promptVercelConfig).toHaveBeenCalled();
    });

    it("should reuse stored Vercel config", async () => {
      await setupPulumiMock();
      // Mock existing connection with Vercel config
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        vercel: {
          teamSlug: "existing-team",
        },
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig(),
            preset: "starter",
          },
        },
      } as any);

      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      // Should not prompt again
      expect(promptUtils.promptVercelConfig).not.toHaveBeenCalled();
    });
  });

  describe("User Webhook Tests", () => {
    it("should set up new webhook endpoint", async () => {
      await setupPulumiMock();
      // Start with event tracking already enabled
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              eventTracking: {
                enabled: true,
                eventBridge: true,
                events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
                dynamoDBHistory: false,
              },
            }),
            preset: "starter",
            pulumiStackName: "wraps-123456789012-us-east-1",
          },
        },
      } as any);

      vi.mocked(prompts.select).mockResolvedValueOnce("user-webhook" as never);
      vi.mocked(prompts.text).mockResolvedValue(
        "https://example.com/webhooks/email" as never
      );
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            userWebhook: expect.objectContaining({
              enabled: true,
              url: "https://example.com/webhooks/email",
            }),
          }),
        })
      );

      // Secret should be generated (non-empty string)
      const callArgs = vi.mocked(deployEmailStack).mock.calls[0]![0];
      expect(callArgs.emailConfig.userWebhook?.secret).toBeTruthy();
      expect(typeof callArgs.emailConfig.userWebhook?.secret).toBe("string");
    });

    it("should auto-enable event tracking when selecting webhook without it", async () => {
      await setupPulumiMock();
      // Event tracking disabled
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              eventTracking: { enabled: false },
            }),
            preset: "starter",
            pulumiStackName: "wraps-123456789012-us-east-1",
          },
        },
      } as any);

      vi.mocked(prompts.select).mockResolvedValueOnce("user-webhook" as never);
      // Confirm enabling event tracking
      vi.mocked(prompts.confirm)
        .mockResolvedValueOnce(true as never) // Enable event tracking
        .mockResolvedValueOnce(true as never); // Proceed with upgrade
      vi.mocked(prompts.text).mockResolvedValue(
        "https://example.com/webhooks/email" as never
      );

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            eventTracking: expect.objectContaining({
              enabled: true,
              eventBridge: true,
            }),
            userWebhook: expect.objectContaining({
              enabled: true,
            }),
          }),
        })
      );
    });

    it("should change webhook URL on existing webhook", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              eventTracking: {
                enabled: true,
                eventBridge: true,
                events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
              },
              userWebhook: {
                enabled: true,
                url: "https://old.example.com/webhook",
                secret: "existing-secret",
              },
            }),
            preset: undefined,
            pulumiStackName: "wraps-123456789012-us-east-1",
          },
        },
      } as any);

      vi.mocked(prompts.select)
        .mockResolvedValueOnce("user-webhook" as never) // upgrade action
        .mockResolvedValueOnce("change-url" as never); // manage action
      vi.mocked(prompts.text).mockResolvedValue(
        "https://new.example.com/webhook" as never
      );
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            userWebhook: expect.objectContaining({
              enabled: true,
              url: "https://new.example.com/webhook",
              secret: "existing-secret", // Secret preserved
            }),
          }),
        })
      );
    });

    it("should regenerate webhook secret", async () => {
      await setupPulumiMock();
      const originalSecret = "original-secret-value";
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              eventTracking: {
                enabled: true,
                eventBridge: true,
                events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
              },
              userWebhook: {
                enabled: true,
                url: "https://example.com/webhook",
                secret: originalSecret,
              },
            }),
            preset: undefined,
            pulumiStackName: "wraps-123456789012-us-east-1",
          },
        },
      } as any);

      vi.mocked(prompts.select)
        .mockResolvedValueOnce("user-webhook" as never)
        .mockResolvedValueOnce("regenerate-secret" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      const callArgs = vi.mocked(deployEmailStack).mock.calls[0]![0];
      expect(callArgs.emailConfig.userWebhook?.enabled).toBe(true);
      expect(callArgs.emailConfig.userWebhook?.url).toBe(
        "https://example.com/webhook"
      );
      // Secret should be different from original
      expect(callArgs.emailConfig.userWebhook?.secret).toBeTruthy();
      expect(callArgs.emailConfig.userWebhook?.secret).not.toBe(originalSecret);
    });

    it("should disable webhook", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              eventTracking: {
                enabled: true,
                eventBridge: true,
                events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
              },
              userWebhook: {
                enabled: true,
                url: "https://example.com/webhook",
                secret: "some-secret",
              },
            }),
            preset: undefined,
            pulumiStackName: "wraps-123456789012-us-east-1",
          },
        },
      } as any);

      vi.mocked(prompts.select)
        .mockResolvedValueOnce("user-webhook" as never)
        .mockResolvedValueOnce("disable" as never);
      vi.mocked(prompts.confirm)
        .mockResolvedValueOnce(true as never) // Confirm disable
        .mockResolvedValueOnce(true as never); // Proceed with upgrade

      await upgrade({});

      expect(deployEmailStack).toHaveBeenCalledWith(
        expect.objectContaining({
          emailConfig: expect.objectContaining({
            userWebhook: expect.objectContaining({
              enabled: false,
            }),
          }),
        })
      );
    });

    it("should validate webhook URL requires HTTPS", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              eventTracking: {
                enabled: true,
                eventBridge: true,
                events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
              },
            }),
            preset: "starter",
            pulumiStackName: "wraps-123456789012-us-east-1",
          },
        },
      } as any);

      vi.mocked(prompts.select).mockResolvedValueOnce("user-webhook" as never);
      vi.mocked(prompts.text).mockImplementation((opts: any) => {
        // Test validation rejects HTTP
        const httpResult = opts.validate?.("http://example.com/webhook");
        expect(httpResult).toBe("Webhook URL must use HTTPS");

        // Test validation rejects single-label hostname
        const localhostResult = opts.validate?.("https://localhost/webhook");
        expect(localhostResult).toBe("Webhook URL must use a public hostname");

        // Test validation rejects invalid URL
        const invalidResult = opts.validate?.("not-a-url");
        expect(invalidResult).toBe("Please enter a valid URL");

        // Test validation accepts valid HTTPS URL
        const validResult = opts.validate?.("https://example.com/webhook");
        expect(validResult).toBeUndefined();

        return Promise.resolve("https://example.com/webhooks/email" as never);
      });
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});
    });

    it("should show webhook option in upgrade menu", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      // Verify the upgrade menu includes the webhook option
      const selectCalls = vi.mocked(prompts.select).mock.calls;
      const upgradeMenuCall = selectCalls.find(
        (call) => call[0]?.message === "What would you like to do?"
      );
      expect(upgradeMenuCall).toBeDefined();

      const options = (upgradeMenuCall![0] as any).options;
      const webhookOption = options.find(
        (o: any) => o.value === "user-webhook"
      );
      expect(webhookOption).toBeDefined();
      expect(webhookOption.label).toBe("Configure webhook endpoint");
    });

    it("should show manage label when webhook already enabled", async () => {
      await setupPulumiMock();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              eventTracking: {
                enabled: true,
                eventBridge: true,
                events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
              },
              userWebhook: {
                enabled: true,
                url: "https://example.com/webhook",
                secret: "some-secret",
              },
            }),
            preset: undefined,
            pulumiStackName: "wraps-123456789012-us-east-1",
          },
        },
      } as any);

      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      const selectCalls = vi.mocked(prompts.select).mock.calls;
      const upgradeMenuCall = selectCalls.find(
        (call) => call[0]?.message === "What would you like to do?"
      );
      const options = (upgradeMenuCall![0] as any).options;
      const webhookOption = options.find(
        (o: any) => o.value === "user-webhook"
      );
      expect(webhookOption.label).toBe("Manage webhook endpoint");
    });

    it("should cancel when declining event tracking prerequisite", async () => {
      await setupPulumiMock();
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit(0)");
      }) as any);

      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
        accountId: "123456789012",
        region: "us-east-1",
        provider: "vercel",
        timestamp: new Date().toISOString(),
        services: {
          email: {
            config: createStarterConfig({
              eventTracking: { enabled: false },
            }),
            preset: "starter",
            pulumiStackName: "wraps-123456789012-us-east-1",
          },
        },
      } as any);

      vi.mocked(prompts.select).mockResolvedValueOnce("user-webhook" as never);
      // Decline enabling event tracking
      vi.mocked(prompts.confirm).mockResolvedValueOnce(false as never);

      await expect(upgrade({})).rejects.toThrow("process.exit");
      expect(deployEmailStack).not.toHaveBeenCalled();

      exitSpy.mockRestore();
    });
  });

  describe("--yes Flag Tests", () => {
    it("should skip confirmation with --yes flag", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select).mockResolvedValueOnce("retention" as never);
      vi.mocked(prompts.select).mockResolvedValueOnce("7days" as never);

      await upgrade({ yes: true });

      // Confirmation prompt should not have been called
      const confirmCalls = vi
        .mocked(prompts.confirm)
        .mock.calls.filter((call) =>
          call[0]?.message?.includes("Proceed with upgrade")
        );
      expect(confirmCalls).toHaveLength(0);
    });
  });

  /**
   * The warn-only check that runs after a successful deploy. Its whole job is
   * to hand back something the user can paste, so the ` Fix: ` suffix must
   * carry `remediation.command` — never `remediation.summary`, the prose field
   * sitting next to it on the same type.
   */
  describe("Post-deploy pipeline check", () => {
    it("appends the runnable command for a remedied hop and nothing for an unremedied one", async () => {
      await setupPulumiMock();
      const syncStack = remediations.syncStack("us-east-1");
      const dlqBacklog = remediations.dlqBacklog();
      vi.mocked(checkEventPipeline).mockResolvedValueOnce([
        {
          hop: "EventBridge rule wraps-email-events",
          status: "fail",
          details: "Rule not found — SES events have nowhere to go",
          remediation: syncStack,
        },
        {
          hop: "Dead-letter queue wraps-email-events-dlq",
          status: "warn",
          details: "3 dead-lettered event(s)",
          remediation: dlqBacklog,
        },
        {
          hop: "DynamoDB table wraps-email-history",
          status: "pass",
          details: "Active",
        },
      ]);
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({});

      expect(prompts.log.warn).toHaveBeenCalledWith(
        "Post-deploy pipeline check: EventBridge rule wraps-email-events — Rule not found — SES events have nowhere to go. Fix: wraps email sync --region us-east-1"
      );
      expect(prompts.log.warn).toHaveBeenCalledWith(
        "Post-deploy pipeline check: Dead-letter queue wraps-email-events-dlq — 3 dead-lettered event(s)."
      );

      const warnings = vi
        .mocked(prompts.log.warn)
        .mock.calls.map((call) => String(call[0]))
        .filter((message) => message.startsWith("Post-deploy pipeline check:"));
      // A passing hop is not a finding, and no warning promises a fix it then
      // spells out as prose instead of a command.
      expect(warnings).toHaveLength(2);
      for (const message of warnings) {
        expect(message).not.toContain(syncStack.summary);
        expect(message).not.toContain(dlqBacklog.summary);
      }
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

    it("should output JSON envelope on successful upgrade", async () => {
      await setupPulumiMock();
      vi.mocked(prompts.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(prompts.confirm).mockResolvedValue(true as never);

      await upgrade({ json: true });

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.command === "email.upgrade";
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0]);
      expect(output.success).toBe(true);
      expect(output.command).toBe("email.upgrade");
      expect(output.data).toBeDefined();
      expect(output.data.upgraded).toBe(true);
      expect(output.data.region).toBeDefined();
    });
  });
});
