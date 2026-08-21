import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts");
vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: {
      selectStack: vi.fn().mockRejectedValue(new Error("no stack named")),
    },
  },
}));
vi.mock("../../utils/shared/scanner.js", () => ({
  scanAWSResources: vi.fn(),
  filterWrapsResources: vi.fn(),
}));
vi.mock("../../utils/shared/aws.js", () => ({
  getAWSRegion: vi.fn().mockResolvedValue("us-east-1"),
  validateAWSCredentials: vi.fn().mockResolvedValue({
    accountId: "123456789012",
    arn: "arn:aws:iam::123456789012:user/test",
  }),
}));
vi.mock("../../utils/shared/metadata.js", () => ({
  loadConnectionMetadata: vi.fn().mockResolvedValue(null),
  findConnectionsWithService: vi.fn().mockResolvedValue([]),
  // Mirrors the real getAllTrackedDomains (metadata.ts:990-1025): the primary
  // domain first, then each additional domain carrying its own configSetName.
  getAllTrackedDomains: vi.fn((metadata) => {
    const config = metadata?.services?.email?.config;
    const primary = config?.domain
      ? [{ domain: config.domain, isPrimary: true, managed: true }]
      : [];
    const additional = (config?.additionalDomains ?? []).map(
      (d: { domain: string; configSetName?: string }) => ({
        domain: d.domain,
        isPrimary: false,
        managed: true,
        configSetName: d.configSetName,
      })
    );
    return [...primary, ...additional];
  }),
}));
vi.mock("../../utils/shared/pulumi.js", () => ({
  ensurePulumiInstalled: vi.fn().mockResolvedValue(false),
}));
vi.mock("../../utils/shared/fs.js", () => ({
  ensurePulumiWorkDir: vi.fn(),
  getPulumiWorkDir: vi.fn().mockReturnValue("/tmp/pulumi"),
}));
vi.mock("../../telemetry/events.js", () => ({
  trackCommand: vi.fn(),
}));
vi.mock("../../utils/shared/json-output.js", () => ({
  isJsonMode: vi.fn().mockReturnValue(false),
  jsonSuccess: vi.fn(),
}));

// Shared send mocks so we can assert across all instances
const mockSesSend = vi.fn().mockResolvedValue({});
const mockSnsSend = vi.fn().mockResolvedValue({});
const mockDynamoSend = vi.fn().mockResolvedValue({});
const mockLambdaSend = vi.fn().mockResolvedValue({});
const mockIamSend = vi
  .fn()
  .mockResolvedValue({ PolicyNames: [], AttachedPolicies: [] });
// Event-pipeline check clients (checkEventPipeline in event-pipeline-check.ts)
const mockSesv2Send = vi.fn().mockResolvedValue({});
const mockEventBridgeSend = vi.fn().mockResolvedValue({});
const mockSqsSend = vi.fn().mockResolvedValue({});

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: class {
    send = mockSesSend;
  },
  DeleteConfigurationSetCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/client-sns", () => ({
  SNSClient: class {
    send = mockSnsSend;
  },
  DeleteTopicCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = mockDynamoSend;
  },
  DeleteTableCommand: class {
    constructor(public input: unknown) {}
  },
  DescribeTableCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: class {
    send = mockLambdaSend;
  },
  DeleteFunctionCommand: class {
    constructor(public input: unknown) {}
  },
  ListEventSourceMappingsCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/client-iam", () => ({
  IAMClient: class {
    send = mockIamSend;
  },
  ListRolePoliciesCommand: class {
    constructor(public input: unknown) {}
  },
  ListAttachedRolePoliciesCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteRolePolicyCommand: class {
    constructor(public input: unknown) {}
  },
  DetachRolePolicyCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteRoleCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = mockSesv2Send;
  },
  GetConfigurationSetEventDestinationsCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send = mockEventBridgeSend;
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
    send = mockSqsSend;
  },
  GetQueueUrlCommand: class {
    constructor(public input: unknown) {}
  },
  GetQueueAttributesCommand: class {
    constructor(public input: unknown) {}
  },
}));

import * as prompts from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import { trackCommand } from "../../telemetry/events.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import { findConnectionsWithService } from "../../utils/shared/metadata.js";
import type { AWSResourceScan } from "../../utils/shared/scanner.js";
import {
  filterWrapsResources,
  scanAWSResources,
} from "../../utils/shared/scanner.js";

const mockScanFn = scanAWSResources as ReturnType<typeof vi.fn>;
const mockFilterFn = filterWrapsResources as ReturnType<typeof vi.fn>;
const mockFindConnections = findConnectionsWithService as ReturnType<
  typeof vi.fn
>;
const mockIsJsonMode = isJsonMode as ReturnType<typeof vi.fn>;
const mockJsonSuccess = jsonSuccess as ReturnType<typeof vi.fn>;
const mockTrackCommand = trackCommand as ReturnType<typeof vi.fn>;

describe("emailDoctor", () => {
  let mockSpinner: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
  };
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    };

    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as never);
    vi.mocked(prompts.intro).mockImplementation(() => {});
    vi.mocked(prompts.outro).mockImplementation(() => {});
    vi.mocked(prompts.log).info = vi.fn();
    vi.mocked(prompts.log).success = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).warn = vi.fn();
    vi.mocked(prompts.isCancel).mockReturnValue(false);

    // Restore default implementations for shared SDK mocks after clearAllMocks
    mockSesSend.mockResolvedValue({});
    mockSnsSend.mockResolvedValue({});
    mockDynamoSend.mockResolvedValue({});
    mockLambdaSend.mockResolvedValue({});
    mockIamSend.mockResolvedValue({ PolicyNames: [], AttachedPolicies: [] });
    mockSesv2Send.mockResolvedValue({});
    mockEventBridgeSend.mockResolvedValue({});
    mockSqsSend.mockResolvedValue({});
    mockIsJsonMode.mockReturnValue(false);

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The summary verdict and the remedy block land on different sinks: rows go
   * through `console.log`, the one-line verdict through `clack.log.*`. Asking
   * "did the user see this string?" has to read both.
   */
  function allUserFacingOutput(): string {
    const consoleOutput = consoleLogSpy.mock.calls
      .map((c) => c.join(" "))
      .join("\n");
    const clackOutput = [
      ...vi.mocked(prompts.log.error).mock.calls,
      ...vi.mocked(prompts.log.warn).mock.calls,
      ...vi.mocked(prompts.log.info).mock.calls,
      ...vi.mocked(prompts.log.success).mock.calls,
    ]
      .map((c) => c.join(" "))
      .join("\n");
    return `${consoleOutput}\n${clackOutput}`;
  }

  it("should display found wraps-* resources with pass status", async () => {
    const filteredScan: AWSResourceScan = {
      identities: [{ name: "example.com", type: "Domain", verified: true }],
      configurationSets: [
        { name: "wraps-email-config-set", eventDestinations: [] },
      ],
      snsTopics: [],
      dynamoTables: [{ name: "wraps-email-events", status: "ACTIVE" }],
      lambdaFunctions: [],
      iamRoles: [
        {
          name: "wraps-email-role",
          arn: "arn:aws:iam::123456789012:role/wraps-email-role",
          assumeRolePolicyDocument: "",
        },
      ],
    };

    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    const allOutput = consoleLogSpy.mock.calls
      .map((c) => c.join(" "))
      .join("\n");
    expect(allOutput).toContain("wraps-email-config-set");
    expect(allOutput).toContain("wraps-email-role");
    expect(allOutput).toContain("wraps-email-events");
  });

  it("should report orphaned resources when no Pulumi stack exists", async () => {
    const filteredScan: AWSResourceScan = {
      identities: [],
      configurationSets: [
        { name: "wraps-email-config-set", eventDestinations: [] },
      ],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [
        {
          name: "wraps-email-role",
          arn: "arn:aws:iam::123456789012:role/wraps-email-role",
          assumeRolePolicyDocument: "",
        },
      ],
    };

    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    const allOutput = consoleLogSpy.mock.calls
      .map((c) => c.join(" "))
      .join("\n");
    expect(allOutput).toContain("orphan");
  });

  it("should delete orphaned resources when --cleanup and user confirms", async () => {
    const filteredScan: AWSResourceScan = {
      identities: [],
      configurationSets: [
        { name: "wraps-email-config-set", eventDestinations: [] },
      ],
      snsTopics: [
        {
          name: "wraps-email-bounce",
          arn: "arn:aws:sns:us-east-1:123:wraps-email-bounce",
        },
      ],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };

    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);

    vi.mocked(prompts.confirm).mockResolvedValue(true as never);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({ cleanup: true });

    expect(vi.mocked(prompts.confirm)).toHaveBeenCalled();

    // Verify SES delete was called with the right config set name
    expect(mockSesSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { ConfigurationSetName: "wraps-email-config-set" },
      })
    );

    // Verify SNS delete was called with the right topic ARN
    expect(mockSnsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { TopicArn: "arn:aws:sns:us-east-1:123:wraps-email-bounce" },
      })
    );
  });

  it("should detach managed policies before deleting IAM roles during cleanup", async () => {
    const filteredScan: AWSResourceScan = {
      identities: [],
      configurationSets: [],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [
        {
          name: "wraps-email-role",
          arn: "arn:aws:iam::123456789012:role/wraps-email-role",
          assumeRolePolicyDocument: "",
        },
      ],
    };

    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);
    vi.mocked(prompts.confirm).mockResolvedValue(true as never);

    // IAM send call order: ListRolePolicies, DeleteRolePolicy, ListAttachedRolePolicies, DetachRolePolicy, DeleteRole
    mockIamSend
      .mockResolvedValueOnce({ PolicyNames: ["wraps-inline-policy"] }) // ListRolePolicies
      .mockResolvedValueOnce({}) // DeleteRolePolicy (inline)
      .mockResolvedValueOnce({
        AttachedPolicies: [{ PolicyArn: "arn:aws:iam::123:policy/managed" }],
      }) // ListAttachedRolePolicies
      .mockResolvedValueOnce({}) // DetachRolePolicy
      .mockResolvedValueOnce({}); // DeleteRole

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({ cleanup: true });

    // Should have called send 5 times for this role:
    // 1. ListRolePolicies, 2. DeleteRolePolicy (inline), 3. ListAttachedRolePolicies,
    // 4. DetachRolePolicy (managed), 5. DeleteRole
    expect(mockIamSend).toHaveBeenCalledTimes(5);
  });

  it("should handle non-standard Pulumi errors gracefully", async () => {
    // Simulate an error other than "no stack named" (e.g., missing Pulumi.yaml, S3 issues)
    vi.mocked(
      pulumi.automation.LocalWorkspace.selectStack
    ).mockRejectedValueOnce(
      new Error("failed to load project: no Pulumi.yaml found")
    );

    const filteredScan: AWSResourceScan = {
      identities: [],
      configurationSets: [
        { name: "wraps-email-config-set", eventDestinations: [] },
      ],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };

    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);

    const { emailDoctor } = await import("../email/doctor.js");

    // Should NOT throw — doctor should handle this gracefully
    await expect(emailDoctor({})).resolves.not.toThrow();

    // Should treat resources as orphaned (no stack)
    const allOutput = consoleLogSpy.mock.calls
      .map((c) => c.join(" "))
      .join("\n");
    expect(allOutput).toContain("orphan");
  });

  it("should auto-detect region from metadata when no region flag or env var is set", async () => {
    // Simulate a single email connection in us-west-2
    mockFindConnections.mockResolvedValueOnce([
      {
        accountId: "123456789012",
        region: "us-west-2",
        services: { email: {} },
      },
    ]);

    const emptyScan: AWSResourceScan = {
      identities: [],
      configurationSets: [],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };

    mockScanFn.mockResolvedValue(emptyScan);
    mockFilterFn.mockReturnValue(emptyScan);

    const { emailDoctor } = await import("../email/doctor.js");
    // No region option — should auto-detect from metadata
    await emailDoctor({});

    // scanAWSResources should be called with the auto-detected region, not us-east-1
    expect(mockScanFn).toHaveBeenCalledWith("us-west-2");
  });

  it("should warn when --cleanup is passed but a Pulumi stack exists", async () => {
    // Override the Pulumi mock to simulate an existing stack
    vi.mocked(
      pulumi.automation.LocalWorkspace.selectStack
    ).mockResolvedValueOnce({} as never);

    const filteredScan: AWSResourceScan = {
      identities: [],
      configurationSets: [
        { name: "wraps-email-config-set", eventDestinations: [] },
      ],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };

    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({ cleanup: true });

    // Should NOT prompt for confirmation (cleanup is not applicable)
    expect(vi.mocked(prompts.confirm)).not.toHaveBeenCalled();

    // Should warn the user about using destroy instead
    expect(vi.mocked(prompts.log.warn)).toHaveBeenCalledWith(
      expect.stringContaining("wraps email destroy")
    );
  });

  it("should include Event Pipeline checks in text output when an email connection exists", async () => {
    mockFindConnections.mockResolvedValueOnce([
      {
        accountId: "123456789012",
        region: "us-east-1",
        services: {
          email: {
            config: { domain: "example.com" },
          },
        },
      },
    ]);

    const filteredScan: AWSResourceScan = {
      identities: [],
      configurationSets: [
        { name: "wraps-email-example-com", eventDestinations: [] },
      ],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);

    // Healthy pipeline: config set has the eventbridge destination enabled,
    // rule is enabled with a live SQS target, DLQ empty, mapping enabled,
    // table active.
    mockSesv2Send.mockResolvedValue({
      EventDestinations: [{ Name: "wraps-email-eventbridge", Enabled: true }],
    });
    mockEventBridgeSend.mockImplementation(
      (cmd: { constructor: { name: string } }) => {
        switch (cmd.constructor.name) {
          case "DescribeRuleCommand":
            return Promise.resolve({ State: "ENABLED" });
          case "ListTargetsByRuleCommand":
            return Promise.resolve({
              Targets: [
                {
                  Id: "sqs-target",
                  Arn: "arn:aws:sqs:us-east-1:123456789012:wraps-email-events",
                },
              ],
            });
          default:
            return Promise.resolve({});
        }
      }
    );
    mockSqsSend.mockResolvedValue({
      QueueUrl:
        "https://sqs.us-east-1.amazonaws.com/123456789012/wraps-email-events",
      Attributes: { ApproximateNumberOfMessages: "0" },
    });
    mockLambdaSend.mockResolvedValue({
      EventSourceMappings: [
        {
          EventSourceArn:
            "arn:aws:sqs:us-east-1:123456789012:wraps-email-events",
          State: "Enabled",
        },
      ],
    });
    mockDynamoSend.mockResolvedValue({ Table: { TableStatus: "ACTIVE" } });

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    const allOutput = consoleLogSpy.mock.calls
      .map((c) => c.join(" "))
      .join("\n");
    expect(allOutput).toContain("Event Pipeline");
  });

  it("should include Event Pipeline checks in JSON output when json mode is active", async () => {
    mockIsJsonMode.mockReturnValue(true);
    mockFindConnections.mockResolvedValueOnce([
      {
        accountId: "123456789012",
        region: "us-east-1",
        services: {
          email: {
            config: { domain: "example.com" },
          },
        },
      },
    ]);

    const filteredScan: AWSResourceScan = {
      identities: [],
      configurationSets: [],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    expect(mockJsonSuccess).toHaveBeenCalledWith(
      "email.doctor",
      expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({ category: "Event Pipeline" }),
        ]),
      })
    );
  });
  it("does not offer --cleanup when the only failures are event pipeline findings", async () => {
    // `--cleanup` only ever deletes orphaned wraps-* resources. An empty scan
    // means there is nothing for it to delete, so recommending it here is a
    // guaranteed no-op.
    mockFindConnections.mockResolvedValueOnce([
      {
        accountId: "123456789012",
        region: "us-east-1",
        services: { email: { config: { domain: "example.com" } } },
      },
    ]);

    const emptyScan: AWSResourceScan = {
      identities: [],
      configurationSets: [],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(emptyScan);
    mockFilterFn.mockReturnValue(emptyScan);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    expect(allUserFacingOutput()).not.toContain("--cleanup");
  });
  it("offers wraps email doctor --cleanup when orphaned resources exist", async () => {
    // The mirror of the test above: an orphan finding is the one case where
    // `--cleanup` genuinely has work to do, so the remedy must still surface.
    const filteredScan: AWSResourceScan = {
      identities: [],
      configurationSets: [
        { name: "wraps-email-config-set", eventDestinations: [] },
      ],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    expect(allUserFacingOutput()).toContain("wraps email doctor --cleanup");
  });
  it("does not prompt for --cleanup when only a finding's free text mentions orphans", async () => {
    // The gate asks which findings declared the cleanup remedy, not which
    // findings happen to spell the word. A pipeline hop that reports an AWS
    // error mentioning orphans has nothing for --cleanup to delete.
    mockFindConnections.mockResolvedValueOnce([
      {
        accountId: "123456789012",
        region: "us-east-1",
        services: { email: { config: { domain: "example.com" } } },
      },
    ]);

    const emptyScan: AWSResourceScan = {
      identities: [],
      configurationSets: [],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(emptyScan);
    mockFilterFn.mockReturnValue(emptyScan);

    mockEventBridgeSend.mockImplementation(
      (cmd: { constructor: { name: string } }) => {
        switch (cmd.constructor.name) {
          case "DescribeRuleCommand":
            return Promise.resolve({ State: "ENABLED" });
          case "ListTargetsByRuleCommand":
            return Promise.resolve({
              Targets: [
                {
                  Id: "sqs-target",
                  Arn: "arn:aws:sqs:us-east-1:123456789012:wraps-email-events",
                },
              ],
            });
          default:
            return Promise.resolve({});
        }
      }
    );
    mockSqsSend.mockRejectedValue(
      new Error("AccessDenied: sqs:GetQueueUrl denied on orphan-events probe")
    );

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({ cleanup: true });

    expect(vi.mocked(prompts.confirm)).not.toHaveBeenCalled();
  });
  it("prints each failing row's own repairing command directly under that row", async () => {
    // Scrolling to a summary block to learn what a specific row needs is the
    // friction this replaces: the row carries its own fix. Two domains with
    // two different remedies, so a fix line that ignored its row's data —
    // hardcoded, or read off the first finding — lands on the wrong row.
    mockFindConnections.mockResolvedValueOnce([
      {
        accountId: "123456789012",
        region: "us-east-1",
        services: {
          email: {
            config: {
              domain: "example.com",
              additionalDomains: [
                { domain: "extra.com", configSetName: "wraps-email-extra-com" },
              ],
            },
          },
        },
      },
    ]);

    const emptyScan: AWSResourceScan = {
      identities: [],
      configurationSets: [],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(emptyScan);
    mockFilterFn.mockReturnValue(emptyScan);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    const rowLines = consoleLogSpy.mock.calls
      .map((c) => c.join(" "))
      .join("\n")
      .split("\n");

    // A row renders as three lines: header, symptom, fix. Anchoring on the
    // header index pins the fix to the row it belongs to, not to "somewhere
    // in the report" — the Suggested-fixes block lists both commands too.
    const primaryRow = rowLines.findIndex((line) =>
      line.includes("SES config set wraps-email-example-com")
    );
    expect(primaryRow).toBeGreaterThan(-1);
    expect(rowLines[primaryRow + 1]).toContain("SES emits no events");
    expect(rowLines[primaryRow + 2]).toBe(
      "      fix: wraps email sync --region us-east-1"
    );

    // The additional domain's config set is not Pulumi-managed, so its own
    // row must name the add flow instead.
    const additionalRow = rowLines.findIndex((line) =>
      line.includes("SES config set wraps-email-extra-com")
    );
    expect(additionalRow).toBeGreaterThan(-1);
    expect(rowLines[additionalRow + 2]).toBe(
      "      fix: wraps email domains add --domain extra.com --region us-east-1"
    );

    // A healthy row declares no remedy, so nothing is rendered under it: the
    // line after its detail line is the next row's header.
    const healthyRow = rowLines.findIndex((line) =>
      line.includes("SQS DLQ wraps-email-events-dlq")
    );
    expect(healthyRow).toBeGreaterThan(-1);
    expect(rowLines[healthyRow + 2]).not.toContain("fix:");
  });
  it("does not offer --cleanup for pipeline warnings when the stack owns every resource", async () => {
    // The warning here is a DLQ backlog, and every wraps-* resource is under
    // Pulumi management, so there is not one orphan to delete. A remedy block
    // that keyed off "are there warnings?" instead of "did a finding declare
    // this remedy?" would recommend a deletion that has nothing to delete.
    vi.mocked(
      pulumi.automation.LocalWorkspace.selectStack
    ).mockResolvedValueOnce({} as never);

    mockFindConnections.mockResolvedValueOnce([
      {
        accountId: "123456789012",
        region: "us-east-1",
        services: { email: { config: { domain: "example.com" } } },
      },
    ]);

    const filteredScan: AWSResourceScan = {
      identities: [],
      configurationSets: [
        { name: "wraps-email-example-com", eventDestinations: [] },
      ],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);

    // Healthy everywhere except the dead-letter queue, which holds 3 events.
    mockSesv2Send.mockResolvedValue({
      EventDestinations: [{ Name: "wraps-email-eventbridge", Enabled: true }],
    });
    mockEventBridgeSend.mockImplementation(
      (cmd: { constructor: { name: string } }) => {
        switch (cmd.constructor.name) {
          case "DescribeRuleCommand":
            return Promise.resolve({ State: "ENABLED" });
          case "ListTargetsByRuleCommand":
            return Promise.resolve({
              Targets: [
                {
                  Id: "sqs-target",
                  Arn: "arn:aws:sqs:us-east-1:123456789012:wraps-email-events",
                },
              ],
            });
          default:
            return Promise.resolve({});
        }
      }
    );
    mockSqsSend.mockResolvedValue({
      QueueUrl:
        "https://sqs.us-east-1.amazonaws.com/123456789012/wraps-email-events-dlq",
      Attributes: { ApproximateNumberOfMessages: "3" },
    });
    mockLambdaSend.mockResolvedValue({
      EventSourceMappings: [
        {
          EventSourceArn:
            "arn:aws:sqs:us-east-1:123456789012:wraps-email-events",
          State: "Enabled",
        },
      ],
    });
    mockDynamoSend.mockResolvedValue({ Table: { TableStatus: "ACTIVE" } });

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    const output = allUserFacingOutput();
    // The DLQ finding's own remedy, which is not a command at all.
    expect(output).toContain("nothing replays them automatically");
    expect(output).not.toContain("--cleanup");
    // Nothing here declares a runnable repair — the DLQ warning is manual and
    // every other row passed — so no row may render a fix line. Dropping the
    // `?.command` guard would stamp `fix: undefined` on all of them.
    expect(output).not.toContain("fix:");
  });
  it("adds remediation to json resources without reshaping the fields run.sh reads", async () => {
    mockIsJsonMode.mockReturnValue(true);
    mockFindConnections.mockResolvedValueOnce([
      {
        accountId: "123456789012",
        region: "us-east-1",
        services: { email: { config: { domain: "example.com" } } },
      },
    ]);

    const emptyScan: AWSResourceScan = {
      identities: [],
      configurationSets: [],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(emptyScan);
    mockFilterFn.mockReturnValue(emptyScan);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    const payload = mockJsonSuccess.mock.calls[0][1];
    // tests/deployment/cli/run.sh reads these three by name — additive only.
    expect(payload.region).toBe("us-east-1");
    expect(payload.totalResources).toBe(0);
    const failing = payload.resources.find(
      (r: { status: string }) => r.status === "fail"
    );
    expect(failing.remediation.command).toBe(
      "wraps email sync --region us-east-1"
    );
    // One top-level key so a script can read the run's distinct remedies
    // without walking every resource entry.
    expect(payload.remediations.map((r: { id: string }) => r.id)).toContain(
      "email.sync"
    );
  });
  it("reports remediation ids to telemetry on a json run, carrying no domain names", async () => {
    // Scripted/CI runs are exactly the ones worth counting remedies for, and
    // they are the runs that take the --json early return.
    mockIsJsonMode.mockReturnValue(true);
    // The additional domain's remedy is `wraps email domains add --domain
    // extra.com` — a command that embeds a customer domain. Without a
    // domain-bearing remedy in the run, "carries no domain names" would be
    // true of any payload at all.
    mockFindConnections.mockResolvedValueOnce([
      {
        accountId: "123456789012",
        region: "us-east-1",
        services: {
          email: {
            config: {
              domain: "example.com",
              additionalDomains: [
                { domain: "extra.com", configSetName: "wraps-email-extra-com" },
              ],
            },
          },
        },
      },
    ]);

    const emptyScan: AWSResourceScan = {
      identities: [],
      configurationSets: [],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(emptyScan);
    mockFilterFn.mockReturnValue(emptyScan);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    const props = mockTrackCommand.mock.calls[0][1];
    // The exact value, not a substring: sorted ids and nothing else. Sending
    // the remediation objects instead would still "contain" the ids while
    // shipping every command, domains included.
    expect(props.remediation_ids).toBe("email.domains.add,email.sync");
    expect(props.remediation_ids).not.toContain("extra.com");
    expect(props.fail_count).toBeGreaterThan(0);
  });
  it("keeps the telemetry id list distinct when two domains need the same kind of repair", async () => {
    // Remedies are deduped by id AND command, so both domains reach the
    // report — but the telemetry key is the id, and repeating it would inflate
    // the counted cardinality of a single remedy.
    mockIsJsonMode.mockReturnValue(true);
    mockFindConnections.mockResolvedValueOnce([
      {
        accountId: "123456789012",
        region: "us-east-1",
        services: {
          email: {
            config: {
              domain: "example.com",
              additionalDomains: [
                { domain: "extra.com", configSetName: "wraps-email-extra-com" },
                { domain: "other.com", configSetName: "wraps-email-other-com" },
              ],
            },
          },
        },
      },
    ]);

    const emptyScan: AWSResourceScan = {
      identities: [],
      configurationSets: [],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(emptyScan);
    mockFilterFn.mockReturnValue(emptyScan);

    const { emailDoctor } = await import("../email/doctor.js");
    await emailDoctor({});

    const props = mockTrackCommand.mock.calls[0][1];
    expect(props.remediation_ids).toBe("email.domains.add,email.sync");

    // Both domains are named in the report the user actually reads.
    const payload = mockJsonSuccess.mock.calls[0][1] as {
      remediations: Array<{ command?: string }>;
    };
    const commands = payload.remediations.map((r) => r.command);
    expect(commands).toContain(
      "wraps email domains add --domain extra.com --region us-east-1"
    );
    expect(commands).toContain(
      "wraps email domains add --domain other.com --region us-east-1"
    );
  });
  it("collects findings for a region without rendering anything", async () => {
    // `wraps doctor` aggregates this; it must not print its own report or
    // prompt while doing so.
    const emptyScan: AWSResourceScan = {
      identities: [],
      configurationSets: [],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(emptyScan);
    mockFilterFn.mockReturnValue(emptyScan);

    const { collectEmailFindings } = await import("../email/doctor.js");
    const collected = await collectEmailFindings({
      region: "us-east-1",
      accountId: "123456789012",
      connections: [
        {
          accountId: "123456789012",
          region: "us-east-1",
          services: { email: { config: { domain: "example.com" } } },
        },
      ] as never,
    });

    expect(collected.findings.some((f) => f.status === "fail")).toBe(true);
    expect(collected.totalResources).toBe(0);
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(vi.mocked(prompts.intro)).not.toHaveBeenCalled();
  });
  it("names the scanned region in the orphan cleanup command", async () => {
    // The orphan case is by definition one where no connection metadata is
    // found, so nothing downstream can re-derive the region: a bare
    // `wraps email doctor --cleanup` re-resolves to the hardcoded us-east-1
    // fallback and reports the other region clean while the orphans stay.
    const filteredScan: AWSResourceScan = {
      identities: [],
      configurationSets: [
        { name: "wraps-email-config-set", eventDestinations: [] },
      ],
      snsTopics: [],
      dynamoTables: [],
      lambdaFunctions: [],
      iamRoles: [],
    };
    mockScanFn.mockResolvedValue(filteredScan);
    mockFilterFn.mockReturnValue(filteredScan);

    const { collectEmailFindings } = await import("../email/doctor.js");
    const collected = await collectEmailFindings({
      region: "eu-west-1",
      accountId: "123456789012",
      connections: [],
    });

    const orphan = collected.findings.find(
      (f) => f.remediation?.id === "email.doctor.cleanup-orphans"
    );
    expect(orphan?.remediation?.command).toBe(
      "wraps email doctor --cleanup --region eu-west-1"
    );
  });
});
