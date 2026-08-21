import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSesv2Send = vi.fn();
const mockEventBridgeSend = vi.fn();
const mockSqsSend = vi.fn();
const mockLambdaSend = vi.fn();
const mockDynamoSend = vi.fn();

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = mockSesv2Send;
  },
  GetConfigurationSetEventDestinationsCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send = mockEventBridgeSend;
  },
  DescribeRuleCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  ListTargetsByRuleCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  DescribeApiDestinationCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  DescribeConnectionCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send = mockSqsSend;
  },
  GetQueueUrlCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  GetQueueAttributesCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: class {
    send = mockLambdaSend;
  },
  ListEventSourceMappingsCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = mockDynamoSend;
  },
  DescribeTableCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

import { checkEventPipeline } from "../event-pipeline-check.js";

type CmdLike = {
  constructor: { name: string };
  input?: Record<string, unknown>;
};

const QUEUE_ARN = "arn:aws:sqs:us-east-1:123456789012:wraps-email-events";
const WEBHOOK_TARGET_ARN =
  "arn:aws:events:us-east-1:123456789012:api-destination/wraps-webhook-destination/abc123";

function healthySesv2() {
  mockSesv2Send.mockImplementation(() =>
    Promise.resolve({
      EventDestinations: [{ Name: "wraps-email-eventbridge", Enabled: true }],
    })
  );
}

function healthyEventBridge(
  overrides: Partial<{ targets: Array<{ Id: string; Arn: string }> }> = {}
) {
  const targets = overrides.targets ?? [{ Id: "sqs-target", Arn: QUEUE_ARN }];
  mockEventBridgeSend.mockImplementation((cmd: CmdLike) => {
    switch (cmd.constructor.name) {
      case "DescribeRuleCommand":
        return Promise.resolve({ State: "ENABLED" });
      case "ListTargetsByRuleCommand":
        return Promise.resolve({ Targets: targets });
      case "DescribeApiDestinationCommand":
        return Promise.resolve({ ApiDestinationState: "ACTIVE" });
      case "DescribeConnectionCommand":
        return Promise.resolve({ ConnectionState: "AUTHORIZED" });
      default:
        return Promise.resolve({});
    }
  });
}

function healthySqs() {
  mockSqsSend.mockImplementation((cmd: CmdLike) => {
    if (cmd.constructor.name === "GetQueueUrlCommand") {
      const queueName = (cmd.input as { QueueName?: string } | undefined)
        ?.QueueName;
      return Promise.resolve({
        QueueUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${queueName}`,
      });
    }
    if (cmd.constructor.name === "GetQueueAttributesCommand") {
      return Promise.resolve({
        Attributes: { ApproximateNumberOfMessages: "0" },
      });
    }
    return Promise.resolve({});
  });
}

function healthyLambda() {
  mockLambdaSend.mockImplementation(() =>
    Promise.resolve({
      EventSourceMappings: [{ EventSourceArn: QUEUE_ARN, State: "Enabled" }],
    })
  );
}

function healthyDynamo() {
  mockDynamoSend.mockImplementation(() =>
    Promise.resolve({ Table: { TableStatus: "ACTIVE" } })
  );
}

function sesv2MissingConfigSet(missing: string) {
  mockSesv2Send.mockImplementation((cmd: CmdLike) => {
    const name = (cmd.input as { ConfigurationSetName?: string } | undefined)
      ?.ConfigurationSetName;
    if (name === missing) {
      const error = new Error("NotFoundException");
      error.name = "NotFoundException";
      return Promise.reject(error);
    }
    return Promise.resolve({
      EventDestinations: [{ Name: "wraps-email-eventbridge", Enabled: true }],
    });
  });
}

describe("checkEventPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    healthySesv2();
    healthyEventBridge();
    healthySqs();
    healthyLambda();
    healthyDynamo();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns all pass when every hop is healthy", async () => {
    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: false,
    });

    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) {
      expect(check.status).toBe("pass");
    }
  });

  it("points a missing primary-domain config set at `wraps email sync`", async () => {
    sesv2MissingConfigSet("wraps-email-example-com");

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: false,
    });

    const configSetCheck = checks.find(
      (c) => c.hop === "SES config set wraps-email-example-com"
    );
    expect(configSetCheck?.status).toBe("fail");
    expect(configSetCheck?.remediation?.command).toBe(
      "wraps email sync --region us-east-1"
    );
    expect(configSetCheck?.details).not.toContain("wraps email upgrade");
  });

  it("points an additional domain's missing config set at the idempotent add flow", async () => {
    sesv2MissingConfigSet("wraps-email-extra-com");

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [
        {
          domain: "extra.com",
          isPrimary: false,
          configSetName: "wraps-email-extra-com",
        },
      ],
      expectPlatformWebhook: false,
    });

    const configSetCheck = checks.find(
      (c) => c.hop === "SES config set wraps-email-extra-com"
    );
    expect(configSetCheck?.status).toBe("fail");
    expect(configSetCheck?.remediation?.command).toBe(
      "wraps email domains add --domain extra.com --region us-east-1"
    );
  });

  it("points a never-migrated additional domain at the per-domain upgrade action", async () => {
    sesv2MissingConfigSet("wraps-email-extra-com");

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "extra.com", isPrimary: false }],
      expectPlatformWebhook: false,
    });

    const configSetCheck = checks.find(
      (c) => c.hop === "SES config set wraps-email-extra-com"
    );
    expect(configSetCheck?.status).toBe("fail");
    expect(configSetCheck?.remediation?.command).toBe(
      "wraps email upgrade --action per-domain-config-sets --region us-east-1"
    );
  });

  it("points the SQS queue hop at `wraps email sync` when the queue is missing", async () => {
    mockSqsSend.mockImplementation((cmd: CmdLike) => {
      if (cmd.constructor.name === "GetQueueUrlCommand") {
        const queueName = (cmd.input as { QueueName?: string } | undefined)
          ?.QueueName;
        if (queueName === "wraps-email-events") {
          const error = new Error("QueueDoesNotExist");
          error.name = "QueueDoesNotExist";
          return Promise.reject(error);
        }
        return Promise.resolve({
          QueueUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${queueName}`,
        });
      }
      if (cmd.constructor.name === "GetQueueAttributesCommand") {
        return Promise.resolve({
          Attributes: { ApproximateNumberOfMessages: "0" },
        });
      }
      return Promise.resolve({});
    });

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: false,
    });

    const queueCheck = checks.find(
      (c) => c.hop === "SQS queue wraps-email-events"
    );
    expect(queueCheck?.status).toBe("fail");
    expect(queueCheck?.remediation?.command).toBe(
      "wraps email sync --region us-east-1"
    );
    expect(queueCheck?.details).not.toContain("wraps email upgrade");
  });

  it("fails the event source mapping hop when the mapping is disabled", async () => {
    mockLambdaSend.mockImplementation(() =>
      Promise.resolve({
        EventSourceMappings: [{ EventSourceArn: QUEUE_ARN, State: "Disabled" }],
      })
    );

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: false,
    });

    const mappingCheck = checks.find(
      (c) => c.hop === "Lambda event source mapping wraps-email-event-processor"
    );
    expect(mappingCheck?.status).toBe("fail");
  });

  it("fails the connection hop when the webhook connection is deauthorized", async () => {
    mockEventBridgeSend.mockImplementation((cmd: CmdLike) => {
      switch (cmd.constructor.name) {
        case "DescribeRuleCommand":
          return Promise.resolve({ State: "ENABLED" });
        case "ListTargetsByRuleCommand":
          return Promise.resolve({
            Targets: [
              { Id: "sqs-target", Arn: QUEUE_ARN },
              { Id: "webhook-target", Arn: WEBHOOK_TARGET_ARN },
            ],
          });
        case "DescribeApiDestinationCommand":
          return Promise.resolve({ ApiDestinationState: "ACTIVE" });
        case "DescribeConnectionCommand":
          return Promise.resolve({ ConnectionState: "DEAUTHORIZED" });
        default:
          return Promise.resolve({});
      }
    });

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: true,
    });

    const connectionCheck = checks.find(
      (c) => c.hop === "EventBridge connection wraps-webhook-connection"
    );
    expect(connectionCheck?.status).toBe("fail");
  });

  it("passes the connection hop when the connection reports ACTIVE", async () => {
    mockEventBridgeSend.mockImplementation((cmd: CmdLike) => {
      switch (cmd.constructor.name) {
        case "DescribeRuleCommand":
          return Promise.resolve({ State: "ENABLED" });
        case "ListTargetsByRuleCommand":
          return Promise.resolve({
            Targets: [
              { Id: "sqs-target", Arn: QUEUE_ARN },
              { Id: "webhook-target", Arn: WEBHOOK_TARGET_ARN },
            ],
          });
        case "DescribeApiDestinationCommand":
          return Promise.resolve({ ApiDestinationState: "ACTIVE" });
        case "DescribeConnectionCommand":
          return Promise.resolve({ ConnectionState: "ACTIVE" });
        default:
          return Promise.resolve({});
      }
    });

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: true,
    });

    const connectionCheck = checks.find(
      (c) => c.hop === "EventBridge connection wraps-webhook-connection"
    );
    expect(connectionCheck?.status).toBe("pass");
  });

  it("warns on duplicate SQS targets, listing all target ids", async () => {
    mockEventBridgeSend.mockImplementation((cmd: CmdLike) => {
      switch (cmd.constructor.name) {
        case "DescribeRuleCommand":
          return Promise.resolve({ State: "ENABLED" });
        case "ListTargetsByRuleCommand":
          return Promise.resolve({
            Targets: [
              { Id: "target-1", Arn: QUEUE_ARN },
              { Id: "target-2", Arn: QUEUE_ARN },
              { Id: "target-3", Arn: QUEUE_ARN },
            ],
          });
        default:
          return Promise.resolve({});
      }
    });

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: false,
    });

    const dupCheck = checks.find((c) => c.hop === "EventBridge rule targets");
    expect(dupCheck?.status).toBe("warn");
    expect(dupCheck?.details).toContain("target-1");
    expect(dupCheck?.details).toContain("target-2");
    expect(dupCheck?.details).toContain("target-3");
    expect(dupCheck?.remediation?.id).toBe("email.duplicate-rule-targets");
    expect(dupCheck?.remediation?.level).toBe("manual");
    expect(dupCheck?.remediation?.command).toBeUndefined();
  });

  it("attaches the manual dlq-backlog remedy when the DLQ holds events", async () => {
    mockSqsSend.mockImplementation((cmd: CmdLike) => {
      const queueName = (cmd.input as { QueueName?: string } | undefined)
        ?.QueueName;
      if (cmd.constructor.name === "GetQueueUrlCommand") {
        return Promise.resolve({
          QueueUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${queueName}`,
        });
      }
      if (cmd.constructor.name === "GetQueueAttributesCommand") {
        return Promise.resolve({
          Attributes: { ApproximateNumberOfMessages: "400" },
        });
      }
      return Promise.resolve({});
    });

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: false,
    });

    const dlqCheck = checks.find((c) =>
      c.hop.startsWith("SQS DLQ wraps-email-events-dlq")
    );
    expect(dlqCheck?.status).toBe("warn");
    expect(dlqCheck?.details).toContain("400 dead-lettered event(s)");
    expect(dlqCheck?.remediation?.id).toBe("email.dlq-backlog");
    expect(dlqCheck?.remediation?.level).toBe("manual");
    expect(dlqCheck?.remediation?.command).toBeUndefined();
  });

  it("fails when a platform webhook is expected but no webhook target exists", async () => {
    // Default healthyEventBridge() only registers the SQS target.
    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: true,
    });

    const webhookCheck = checks.find(
      (c) => c.hop === "Platform webhook target"
    );
    expect(webhookCheck?.status).toBe("fail");
    expect(webhookCheck?.remediation?.command).toBe(
      "wraps email sync --region us-east-1"
    );
    expect(webhookCheck?.details).not.toContain("wraps email upgrade");
  });

  it("warns when a webhook target exists but metadata has no webhookSecret", async () => {
    healthyEventBridge({
      targets: [
        { Id: "sqs-target", Arn: QUEUE_ARN },
        { Id: "webhook-target", Arn: WEBHOOK_TARGET_ARN },
      ],
    });

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: false,
    });

    const webhookCheck = checks.find(
      (c) => c.hop === "Platform webhook target"
    );
    expect(webhookCheck?.status).toBe("warn");
    expect(webhookCheck?.remediation?.id).toBe("email.metadata-divergence");
    expect(webhookCheck?.remediation?.level).toBe("manual");
    expect(webhookCheck?.remediation?.command).toBeUndefined();
  });

  it("isolates a hop's SDK error as a warn and still evaluates the remaining hops", async () => {
    mockEventBridgeSend.mockImplementation((cmd: CmdLike) => {
      if (cmd.constructor.name === "ListTargetsByRuleCommand") {
        const error = new Error("AccessDenied");
        error.name = "Error";
        return Promise.reject(error);
      }
      if (cmd.constructor.name === "DescribeRuleCommand") {
        return Promise.resolve({ State: "ENABLED" });
      }
      return Promise.resolve({});
    });

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: false,
    });

    const targetsCheck = checks.find(
      (c) => c.hop === "EventBridge rule targets"
    );
    expect(targetsCheck?.status).toBe("warn");
    expect(targetsCheck?.details).toContain("AccessDenied");
    expect(targetsCheck?.remediation?.id).toBe("aws.permissions");

    // Remaining independent hops (DLQ, Lambda mapping, DynamoDB table) still ran.
    const dlqCheck = checks.find(
      (c) => c.hop === "SQS DLQ wraps-email-events-dlq"
    );
    const mappingCheck = checks.find(
      (c) => c.hop === "Lambda event source mapping wraps-email-event-processor"
    );
    const tableCheck = checks.find(
      (c) => c.hop === "DynamoDB table wraps-email-history"
    );
    expect(dlqCheck?.status).toBe("pass");
    expect(mappingCheck?.status).toBe("pass");
    expect(tableCheck?.status).toBe("pass");
  });
});

/**
 * The doctor resolves the region it scans deliberately — `emailDoctor`
 * auto-selects the sole email connection's region and `wrapsDoctor` overrides
 * `getAWSRegion()` with it — precisely because the bare fallback is a
 * hardcoded "us-east-1" that nothing is deployed in. A repair command that
 * carries no `--region` throws that resolution away: `wraps email sync` falls
 * through to `config()`, which re-resolves from AWS_REGION /
 * AWS_DEFAULT_REGION and then that same fallback, fails to load the
 * connection metadata and exits 1. The doctor's own suggestion is then the
 * thing that failed.
 */
describe("checkEventPipeline region targeting", () => {
  const SCANNED_REGION = "eu-west-1";

  beforeEach(() => {
    vi.clearAllMocks();
    healthySesv2();
    healthyEventBridge();
    healthySqs();
    healthyLambda();
    healthyDynamo();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function missingRule() {
    mockEventBridgeSend.mockImplementation((cmd: CmdLike) => {
      if (cmd.constructor.name === "DescribeRuleCommand") {
        const error = new Error("ResourceNotFoundException");
        error.name = "ResourceNotFoundException";
        return Promise.reject(error);
      }
      return Promise.resolve({});
    });
  }

  it("names the scanned region in the sync command for a deleted rule", async () => {
    missingRule();

    const checks = await checkEventPipeline({
      region: SCANNED_REGION,
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: false,
    });

    const ruleCheck = checks.find(
      (c) => c.hop === "EventBridge rule wraps-email-events-to-sqs"
    );
    expect(ruleCheck?.status).toBe("fail");
    expect(ruleCheck?.remediation?.command).toBe(
      `wraps email sync --region ${SCANNED_REGION}`
    );
  });

  it("names the scanned region in every repair command the report carries", async () => {
    // syncStack is attached to nine resource classes; one un-regioned hop is
    // enough to send the user to the wrong region, so this asserts the whole
    // set rather than a single hop.
    missingRule();
    mockSqsSend.mockImplementation(() => {
      const error = new Error("QueueDoesNotExist");
      error.name = "QueueDoesNotExist";
      return Promise.reject(error);
    });
    mockLambdaSend.mockImplementation(() => {
      const error = new Error("ResourceNotFoundException");
      error.name = "ResourceNotFoundException";
      return Promise.reject(error);
    });
    mockDynamoSend.mockImplementation(() => {
      const error = new Error("ResourceNotFoundException");
      error.name = "ResourceNotFoundException";
      return Promise.reject(error);
    });
    sesv2MissingConfigSet("wraps-email-example-com");

    const checks = await checkEventPipeline({
      region: SCANNED_REGION,
      domains: [{ domain: "example.com", isPrimary: true }],
      expectPlatformWebhook: false,
    });

    const wrapsCommands = checks
      .map((c) => c.remediation?.command)
      .filter((c): c is string => Boolean(c?.startsWith("wraps ")));
    expect(wrapsCommands.length).toBeGreaterThan(0);
    const unregioned = wrapsCommands.filter(
      (c) => !c.includes(`--region ${SCANNED_REGION}`)
    );
    expect(unregioned, unregioned.join("\n")).toEqual([]);
  });

  it("names the scanned region when re-running the add flow for an additional domain", async () => {
    sesv2MissingConfigSet("wraps-email-extra-com");

    const checks = await checkEventPipeline({
      region: SCANNED_REGION,
      domains: [
        {
          domain: "extra.com",
          isPrimary: false,
          configSetName: "wraps-email-extra-com",
        },
      ],
      expectPlatformWebhook: false,
    });

    const configSetCheck = checks.find(
      (c) => c.hop === "SES config set wraps-email-extra-com"
    );
    expect(configSetCheck?.remediation?.command).toBe(
      `wraps email domains add --domain extra.com --region ${SCANNED_REGION}`
    );
  });

  it("names the scanned region in the per-domain config-set upgrade", async () => {
    sesv2MissingConfigSet("wraps-email-extra-com");

    const checks = await checkEventPipeline({
      region: SCANNED_REGION,
      domains: [{ domain: "extra.com", isPrimary: false }],
      expectPlatformWebhook: false,
    });

    const configSetCheck = checks.find(
      (c) => c.hop === "SES config set wraps-email-extra-com"
    );
    expect(configSetCheck?.remediation?.command).toBe(
      `wraps email upgrade --action per-domain-config-sets --region ${SCANNED_REGION}`
    );
  });
});

/**
 * An agency tracking 25 domains gets 26 `GetConfigurationSetEventDestinations`
 * probes out of `checkConfigSets` (one per deduped config-set name plus the
 * fallback). Issued strictly one after another at ~120ms per SESv2 round trip
 * that is ~3s of pure serialization on every `wraps doctor`, `wraps email
 * doctor` and post-deploy `wraps email upgrade` check. The probes are
 * independent, so they must overlap — but bounded, because SESv2
 * configuration-set reads are quota-limited per account and an unbounded
 * fan-out would trade the latency for `TooManyRequestsException` warnings the
 * check would misreport as an IAM problem.
 */
describe("checkEventPipeline config-set probe concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    healthyEventBridge();
    healthySqs();
    healthyLambda();
    healthyDynamo();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function slowSesv2() {
    let inFlight = 0;
    const peak = { value: 0 };
    mockSesv2Send.mockImplementation(async () => {
      inFlight += 1;
      peak.value = Math.max(peak.value, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return {
        EventDestinations: [{ Name: "wraps-email-eventbridge", Enabled: true }],
      };
    });
    return peak;
  }

  const manyDomains = Array.from({ length: 25 }, (_, i) => ({
    domain: `d${i}.example`,
    isPrimary: i === 0,
    configSetName: i === 0 ? undefined : `wraps-email-d${i}-example`,
  }));

  it("overlaps the per-domain config-set probes instead of serializing them", async () => {
    const peak = slowSesv2();

    await checkEventPipeline({
      region: "us-east-1",
      domains: manyDomains,
      expectPlatformWebhook: false,
    });

    expect(mockSesv2Send).toHaveBeenCalledTimes(26);
    expect(peak.value).toBeGreaterThan(1);
  });

  it("bounds the fan-out so SESv2 read quotas are not tripped", async () => {
    const peak = slowSesv2();

    await checkEventPipeline({
      region: "us-east-1",
      domains: manyDomains,
      expectPlatformWebhook: false,
    });

    expect(peak.value).toBeLessThanOrEqual(8);
  });

  it("keeps the checks in domain order with the fallback probe last", async () => {
    slowSesv2();

    const checks = await checkEventPipeline({
      region: "us-east-1",
      domains: manyDomains,
      expectPlatformWebhook: false,
    });

    const configSetHops = checks
      .filter((c) => c.hop.startsWith("SES config set "))
      .map((c) => c.hop.replace("SES config set ", ""));

    expect(configSetHops).toEqual([
      ...manyDomains.map((d) => d.configSetName ?? "wraps-email-d0-example"),
      "wraps-email-tracking",
    ]);
  });
});
