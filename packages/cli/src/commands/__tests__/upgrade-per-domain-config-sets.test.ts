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
// Shared send mock — replaced per test in beforeEach
const __sesSend = vi.fn().mockResolvedValue({});

vi.mock("@aws-sdk/client-sesv2", async () => {
  class CreateConfigurationSetCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  class CreateConfigurationSetEventDestinationCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  class PutEmailIdentityConfigurationSetAttributesCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  class SESv2Client {
    send: (...args: any[]) => any;
    constructor() {
      this.send = (...args: any[]) =>
        (globalThis as any).__wrapsSesSend?.(...args) ?? Promise.resolve({});
    }
  }
  const EventType = {
    SEND: "SEND",
    DELIVERY: "DELIVERY",
    OPEN: "OPEN",
    CLICK: "CLICK",
    BOUNCE: "BOUNCE",
    COMPLAINT: "COMPLAINT",
    REJECT: "REJECT",
    RENDERING_FAILURE: "RENDERING_FAILURE",
    DELIVERY_DELAY: "DELIVERY_DELAY",
    SUBSCRIPTION: "SUBSCRIPTION",
  } as const;
  class GetConfigurationSetEventDestinationsCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  return {
    CreateConfigurationSetCommand,
    CreateConfigurationSetEventDestinationCommand,
    PutEmailIdentityConfigurationSetAttributesCommand,
    GetConfigurationSetEventDestinationsCommand,
    SESv2Client,
    EventType,
  };
});
// Event-pipeline check clients (post-deploy warn-only check in upgrade.ts) —
// mocked so the check resolves instantly instead of hitting real AWS.
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

import * as sesModule from "@aws-sdk/client-sesv2";
import * as clack from "@clack/prompts";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import * as aws from "../../utils/shared/aws.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as metadataUtils from "../../utils/shared/metadata.js";
import * as promptUtils from "../../utils/shared/prompts.js";
import * as pulumiUtils from "../../utils/shared/pulumi.js";
import { upgrade } from "../email/upgrade.js";

describe("upgrade per-domain-config-sets migration", () => {
  let mockSpinner: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
  };

  let mockSesClientSend: ReturnType<typeof vi.fn>;
  let CreateConfigurationSetCommand: new (input: any) => { input: any };
  let CreateConfigurationSetEventDestinationCommand: new (
    input: any
  ) => { input: any };
  let PutEmailIdentityConfigurationSetAttributesCommand: new (
    input: any
  ) => { input: any };

  const baseMetadata = (overrides: any = {}) => ({
    accountId: "123456789012",
    region: "us-east-1",
    provider: "aws",
    timestamp: new Date().toISOString(),
    services: {
      email: {
        config: {
          domain: "example.com",
          tracking: { enabled: true, opens: true, clicks: true },
          tlsRequired: true,
          reputationMetrics: false,
          suppressionList: { enabled: true, reasons: ["BOUNCE", "COMPLAINT"] },
          eventTracking: { enabled: false },
          emailArchiving: { enabled: false, retention: "30days" },
          sendingEnabled: true,
          additionalDomains: [],
          ...overrides.emailConfig,
        },
        preset: "starter",
        pulumiStackName: "wraps-123456789012-us-east-1",
        ...overrides.emailService,
      },
    },
    ...overrides.root,
  });

  async function setupPulumiMock() {
    const pulumi = await import("@pulumi/pulumi");
    const pulumiAutomation = await import("@pulumi/pulumi/automation");

    const mockStack = {
      workspace: { selectStack: vi.fn().mockResolvedValue(undefined) },
      setConfig: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue({
        summary: { kind: "refresh", result: "succeeded" },
      }),
      up: vi.fn().mockResolvedValue({
        outputs: {
          roleArn: { value: "arn:aws:iam::123456789012:role/wraps-email-role" },
          configSetName: { value: "wraps-email-tracking" },
          tableName: { value: "wraps-email-history" },
          region: { value: "us-east-1" },
        },
      }),
    } as any;

    const createOrSelectStackMock = vi.fn().mockImplementation(async (args) => {
      if (args.program) await args.program();
      return mockStack;
    });

    vi.mocked(
      pulumi.automation.LocalWorkspace.createOrSelectStack
    ).mockImplementation(createOrSelectStackMock);
    vi.mocked(
      pulumiAutomation.LocalWorkspace.createOrSelectStack
    ).mockImplementation(createOrSelectStackMock);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setJsonMode(false);

    mockSpinner = { start: vi.fn(), stop: vi.fn(), message: vi.fn() };
    vi.mocked(clack.spinner).mockReturnValue(mockSpinner as never);
    vi.mocked(clack.intro).mockImplementation(() => {});
    vi.mocked(clack.outro).mockImplementation(() => {});
    vi.mocked(clack.note).mockImplementation(() => {});
    vi.mocked(clack.log).info = vi.fn();
    vi.mocked(clack.log).success = vi.fn();
    vi.mocked(clack.log).error = vi.fn();
    vi.mocked(clack.log).warn = vi.fn();
    vi.mocked(clack.log).step = vi.fn();
    vi.mocked(clack.isCancel).mockReturnValue(false);

    vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
      accountId: "123456789012",
      userId: "AIDACKCEVSQ6C2EXAMPLE",
      arn: "arn:aws:iam::123456789012:user/test",
    });
    vi.mocked(aws.getAWSRegion).mockResolvedValue("us-east-1");

    vi.mocked(pulumiUtils.ensurePulumiInstalled).mockResolvedValue(false);
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockReturnValue(undefined);
    vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");

    vi.mocked(metadataUtils.saveConnectionMetadata).mockResolvedValue(
      undefined
    );
    vi.mocked(metadataUtils.updateEmailConfig).mockImplementation(() => {});

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
    } as any);

    CreateConfigurationSetCommand =
      sesModule.CreateConfigurationSetCommand as any;
    CreateConfigurationSetEventDestinationCommand =
      sesModule.CreateConfigurationSetEventDestinationCommand as any;
    PutEmailIdentityConfigurationSetAttributesCommand =
      sesModule.PutEmailIdentityConfigurationSetAttributesCommand as any;

    mockSesClientSend = vi.fn().mockResolvedValue({});
    (globalThis as any).__wrapsSesSend = mockSesClientSend;
  });

  afterEach(() => {
    setJsonMode(false);
  });

  describe("Unit 13: skips already-migrated domains", () => {
    it("should not call SES APIs for domains that already have configSetName", async () => {
      await setupPulumiMock();

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              {
                domain: "app.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
                configSetName: "wraps-email-app-example-com",
              },
              {
                domain: "mail.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
                configSetName: "wraps-email-mail-example-com",
              },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select).mockResolvedValueOnce(
        "per-domain-config-sets" as never
      );
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      await upgrade({ yes: true });

      expect(mockSesClientSend).not.toHaveBeenCalledWith(
        expect.any(CreateConfigurationSetCommand)
      );
      expect(mockSesClientSend).not.toHaveBeenCalledWith(
        expect.any(CreateConfigurationSetEventDestinationCommand)
      );
      expect(mockSesClientSend).not.toHaveBeenCalledWith(
        expect.any(PutEmailIdentityConfigurationSetAttributesCommand)
      );

      expect(clack.log.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /already migrated|all.*migrated|nothing|no.*domain/i
        )
      );
    });

    it("should process only unmigrated domains when some are already done", async () => {
      await setupPulumiMock();

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              {
                domain: "app.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
                configSetName: "wraps-email-app-example-com",
              },
              {
                domain: "mail.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select).mockResolvedValueOnce(
        "per-domain-config-sets" as never
      );
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      await upgrade({ yes: true });

      const createConfigSetCalls = mockSesClientSend.mock.calls.filter(
        (call: any[]) => call[0] instanceof CreateConfigurationSetCommand
      );
      expect(createConfigSetCalls).toHaveLength(1);
      expect(createConfigSetCalls[0][0].input.ConfigurationSetName).toBe(
        "wraps-email-mail-example-com"
      );
    });
  });

  describe("Unit 14: creates config set and persists state per domain", () => {
    it("should call CreateConfigurationSetCommand with correct name", async () => {
      await setupPulumiMock();

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              {
                domain: "app.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select).mockResolvedValueOnce(
        "per-domain-config-sets" as never
      );
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      await upgrade({ yes: true });

      const createCalls = mockSesClientSend.mock.calls.filter(
        (call: any[]) => call[0] instanceof CreateConfigurationSetCommand
      );
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0][0].input.ConfigurationSetName).toBe(
        "wraps-email-app-example-com"
      );
    });

    it("should call CreateConfigurationSetEventDestinationCommand with EventBridge destination", async () => {
      await setupPulumiMock();

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              {
                domain: "app.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select).mockResolvedValueOnce(
        "per-domain-config-sets" as never
      );
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      await upgrade({ yes: true });

      const destCalls = mockSesClientSend.mock.calls.filter(
        (call: any[]) =>
          call[0] instanceof CreateConfigurationSetEventDestinationCommand
      );
      expect(destCalls).toHaveLength(1);
      const input = destCalls[0][0].input;
      expect(input.ConfigurationSetName).toBe("wraps-email-app-example-com");
      expect(
        input.EventDestination.EventBridgeDestination.EventBusArn
      ).toContain("event-bus/default");
    });

    it("should call PutEmailIdentityConfigurationSetAttributesCommand to reassign identity", async () => {
      await setupPulumiMock();

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              {
                domain: "app.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select).mockResolvedValueOnce(
        "per-domain-config-sets" as never
      );
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      await upgrade({ yes: true });

      const putCalls = mockSesClientSend.mock.calls.filter(
        (call: any[]) =>
          call[0] instanceof PutEmailIdentityConfigurationSetAttributesCommand
      );
      expect(putCalls).toHaveLength(1);
      const input = putCalls[0][0].input;
      expect(input.EmailIdentity).toBe("app.example.com");
      expect(input.ConfigurationSetName).toBe("wraps-email-app-example-com");
    });

    it("should save configSetName to metadata before identity reassignment", async () => {
      await setupPulumiMock();

      const savedMetadataSnapshots: any[] = [];
      let putIdentityCallCount = 0;

      vi.mocked(metadataUtils.saveConnectionMetadata).mockImplementation(
        async (m) => {
          savedMetadataSnapshots.push(JSON.parse(JSON.stringify(m)));
        }
      );

      mockSesClientSend.mockImplementation(async (cmd: any) => {
        if (cmd instanceof PutEmailIdentityConfigurationSetAttributesCommand) {
          putIdentityCallCount++;
          const lastSave =
            savedMetadataSnapshots[savedMetadataSnapshots.length - 1];
          const domain =
            lastSave?.services?.email?.config?.additionalDomains?.find(
              (d: any) => d.domain === "app.example.com"
            );
          expect(domain?.configSetName).toBe("wraps-email-app-example-com");
        }
        return {};
      });

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              {
                domain: "app.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select).mockResolvedValueOnce(
        "per-domain-config-sets" as never
      );
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      await upgrade({ yes: true });

      expect(putIdentityCallCount).toBeGreaterThan(0);
    });

    it("should process multiple domains and persist configSetName for each", async () => {
      await setupPulumiMock();

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              {
                domain: "app.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
              },
              {
                domain: "mail.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select).mockResolvedValueOnce(
        "per-domain-config-sets" as never
      );
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      // The migration sleeps 1s between domains to stay inside the SES rate
      // limit (upgrade.ts, "Rate limit: 1-second delay between domains"). This
      // is the only test here with more than one unmigrated domain, so it was
      // the only one paying it — a real second of wall clock, and it grows by
      // another second for every domain a future case adds. Fake timers keep
      // the assertion about the per-domain loop rather than about the clock.
      vi.useFakeTimers();
      try {
        const run = upgrade({ yes: true });
        await vi.runAllTimersAsync();
        await run;
      } finally {
        vi.useRealTimers();
      }

      const createCalls = mockSesClientSend.mock.calls.filter(
        (call: any[]) => call[0] instanceof CreateConfigurationSetCommand
      );
      expect(createCalls).toHaveLength(2);
      const configSetNames = createCalls.map(
        (call: any[]) => call[0].input.ConfigurationSetName
      );
      expect(configSetNames).toContain("wraps-email-app-example-com");
      expect(configSetNames).toContain("wraps-email-mail-example-com");
    });

    it("should always include all event types regardless of domain purpose", async () => {
      await setupPulumiMock();

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              {
                domain: "app.example.com",
                purpose: "transactional",
                addedAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select).mockResolvedValueOnce(
        "per-domain-config-sets" as never
      );
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      await upgrade({ yes: true });

      const destCalls = mockSesClientSend.mock.calls.filter(
        (call: any[]) =>
          call[0] instanceof CreateConfigurationSetEventDestinationCommand
      );
      const matchingEventTypes =
        destCalls[0][0].input.EventDestination.MatchingEventTypes;
      expect(matchingEventTypes).toContain("SEND");
      expect(matchingEventTypes).toContain("DELIVERY");
      expect(matchingEventTypes).toContain("OPEN");
      expect(matchingEventTypes).toContain("CLICK");
      expect(matchingEventTypes).toContain("BOUNCE");
      expect(matchingEventTypes).toContain("COMPLAINT");
    });

    it("should include per-domain-config-sets option in upgrade menu", async () => {
      await setupPulumiMock();

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              { domain: "app.example.com", addedAt: new Date().toISOString() },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select)
        .mockResolvedValueOnce("preset" as never)
        .mockResolvedValueOnce("production" as never);
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      await upgrade({});

      const selectCalls = vi.mocked(clack.select).mock.calls;
      const upgradeMenuCall = selectCalls.find(
        (call) => call[0]?.message === "What would you like to do?"
      );
      expect(upgradeMenuCall).toBeDefined();
      const options = (upgradeMenuCall![0] as any).options;
      const migrationOption = options.find(
        (o: any) => o.value === "per-domain-config-sets"
      );
      expect(migrationOption).toBeDefined();
      expect(migrationOption.label).toBe("Per-domain configuration sets");
    });
  });

  describe("Unit 15: partial migration is resumable", () => {
    it("should persist configSetName before identity reassignment so failures are resumable", async () => {
      await setupPulumiMock();

      let savedAfterConfigSet = false;
      let putIdentityCalled = false;

      vi.mocked(metadataUtils.saveConnectionMetadata).mockImplementation(
        async (m) => {
          const domains = m.services?.email?.config?.additionalDomains ?? [];
          const migrated = domains.find(
            (d: any) => d.domain === "app.example.com" && d.configSetName
          );
          if (migrated && !putIdentityCalled) {
            savedAfterConfigSet = true;
          }
        }
      );

      mockSesClientSend.mockImplementation(async (cmd: any) => {
        if (cmd instanceof PutEmailIdentityConfigurationSetAttributesCommand) {
          putIdentityCalled = true;
          throw new Error("PutEmailIdentity failed");
        }
        return {};
      });

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              {
                domain: "app.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select).mockResolvedValueOnce(
        "per-domain-config-sets" as never
      );
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      try {
        await upgrade({ yes: true });
      } catch {
        // May throw — what matters is that configSetName was saved before the failure
      }

      expect(savedAfterConfigSet).toBe(true);
      expect(putIdentityCalled).toBe(true);
    });

    it("should skip domain on re-run if configSetName was already saved", async () => {
      await setupPulumiMock();

      vi.mocked(metadataUtils.loadConnectionMetadata).mockResolvedValue(
        baseMetadata({
          emailConfig: {
            additionalDomains: [
              {
                domain: "app.example.com",
                addedAt: "2024-01-01T00:00:00.000Z",
                configSetName: "wraps-email-app-example-com",
              },
            ],
          },
        }) as any
      );

      vi.mocked(clack.select).mockResolvedValueOnce(
        "per-domain-config-sets" as never
      );
      vi.mocked(clack.confirm).mockResolvedValue(true as never);

      await upgrade({ yes: true });

      const createCalls = mockSesClientSend.mock.calls.filter(
        (call: any[]) => call[0] instanceof CreateConfigurationSetCommand
      );
      expect(createCalls).toHaveLength(0);
    });
  });
});
