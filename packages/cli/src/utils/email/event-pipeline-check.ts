/**
 * Hop-by-hop health check for the SES -> EventBridge -> SQS -> Lambda ->
 * DynamoDB event pipeline (plus the optional Wraps platform webhook leg).
 *
 * Used by `wraps email doctor` and, warn-only, right after a successful
 * `wraps email upgrade` deploy. Every AWS call is wrapped in its own
 * try/catch — a single hop's API error becomes a "warn" entry, it never
 * throws and never blocks the rest of the checks from running.
 */

import {
  DEFAULT_CONFIG_SET_NAME,
  EVENTBRIDGE_RULE_NAME,
  EVENTS_DLQ_NAME,
  EVENTS_QUEUE_NAME,
  HISTORY_TABLE_NAME,
} from "@wraps/core";
import {
  type Remediation,
  remediations,
} from "../shared/doctor-remediation.js";
import { isAWSNotFoundError } from "../shared/errors.js";
import { domainToConfigSetName } from "./config-set-slug.js";

const EVENT_DESTINATION_NAME = "wraps-email-eventbridge";
const CONFIG_SET_FALLBACK = DEFAULT_CONFIG_SET_NAME;
const RULE_NAME = EVENTBRIDGE_RULE_NAME;
const QUEUE_NAME = EVENTS_QUEUE_NAME;
const DLQ_NAME = EVENTS_DLQ_NAME;
const LAMBDA_FUNCTION_NAME = "wraps-email-event-processor";
const WEBHOOK_DESTINATION_NAME = "wraps-webhook-destination";
const WEBHOOK_CONNECTION_NAME = "wraps-webhook-connection";
/** Cap on simultaneous SESv2 configuration-set reads. See `checkConfigSets`. */
const CONFIG_SET_PROBE_CONCURRENCY = 6;

export type PipelineCheck = {
  hop: string;
  status: "pass" | "warn" | "fail";
  /** The symptom only. The remedy lives in `remediation`, never in this string. */
  details: string;
  remediation?: Remediation;
};

/**
 * A domain to probe, carrying the state that decides its remedy. The bare
 * `string[]` this replaced discarded `isPrimary`/`configSetName` — the exact
 * fields that distinguish a Pulumi-managed config set from an imperatively
 * managed one, and therefore `wraps email sync` from `wraps email domains add`.
 */
export type PipelineDomain = {
  domain: string;
  isPrimary: boolean;
  /** Recorded in metadata for additional domains; absent for the primary. */
  configSetName?: string;
};

export type CheckEventPipelineParams = {
  region: string;
  domains: PipelineDomain[];
  expectPlatformWebhook: boolean;
};

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isQueueNotFoundError(error: unknown): boolean {
  return (
    isAWSNotFoundError(error) ||
    (error instanceof Error && error.name === "QueueDoesNotExist")
  );
}

/** Reads one configuration set's event destinations. One client, many reads. */
type ConfigSetReader = (configSetName: string) => Promise<{
  EventDestinations?: Array<{ Name?: string; Enabled?: boolean }>;
}>;

async function createConfigSetReader(region: string): Promise<ConfigSetReader> {
  const { SESv2Client, GetConfigurationSetEventDestinationsCommand } =
    await import("@aws-sdk/client-sesv2");
  const client = new SESv2Client({ region });
  return (configSetName) =>
    client.send(
      new GetConfigurationSetEventDestinationsCommand({
        ConfigurationSetName: configSetName,
      })
    );
}

/**
 * Check a single SES configuration set for the wraps-email-eventbridge
 * event destination. When `optional` is true, a not-found result is not a
 * failure — it just means this config set isn't in use (returns null).
 */
async function checkConfigSet(
  read: ConfigSetReader,
  configSetName: string,
  optional: boolean,
  remediation: Remediation
): Promise<PipelineCheck | null> {
  const hop = `SES config set ${configSetName}`;
  try {
    const response = await read(configSetName);
    const destination = response.EventDestinations?.find(
      (d) => d.Name === EVENT_DESTINATION_NAME
    );
    if (destination?.Enabled) {
      return {
        hop,
        status: "pass",
        details: `${EVENT_DESTINATION_NAME} enabled`,
      };
    }
    return {
      hop,
      status: "fail",
      details: `SES emits no events for ${configSetName}`,
      remediation,
    };
  } catch (error) {
    if (isAWSNotFoundError(error)) {
      if (optional) {
        return null;
      }
      return {
        hop,
        status: "fail",
        details: "Configuration set not found",
        remediation,
      };
    }
    return {
      hop,
      status: "warn",
      details: `Could not check event destinations: ${summarizeError(error)}`,
      remediation: remediations.reviewPermissions(),
    };
  }
}

async function checkRule(
  region: string
): Promise<{ check: PipelineCheck; exists: boolean }> {
  const hop = `EventBridge rule ${RULE_NAME}`;
  try {
    const { EventBridgeClient, DescribeRuleCommand } = await import(
      "@aws-sdk/client-eventbridge"
    );
    const client = new EventBridgeClient({ region });
    const response = await client.send(
      new DescribeRuleCommand({ Name: RULE_NAME })
    );
    if (response.State === "ENABLED") {
      return {
        exists: true,
        check: { hop, status: "pass", details: "Rule enabled" },
      };
    }
    return {
      exists: true,
      check: {
        hop,
        status: "fail",
        details: `Rule is ${response.State ?? "in an unknown state"}`,
        remediation: remediations.syncStack(region),
      },
    };
  } catch (error) {
    if (isAWSNotFoundError(error)) {
      return {
        exists: false,
        check: {
          hop,
          status: "fail",
          details: "Rule not found — SES events have nowhere to go",
          remediation: remediations.syncStack(region),
        },
      };
    }
    return {
      exists: false,
      check: {
        hop,
        status: "warn",
        details: `Could not check rule: ${summarizeError(error)}`,
        remediation: remediations.reviewPermissions(),
      },
    };
  }
}

async function checkQueueExists(
  queueName: string,
  region: string,
  failDetails: string,
  remediation: Remediation
): Promise<PipelineCheck> {
  const hop = `SQS queue ${queueName}`;
  try {
    const { SQSClient, GetQueueUrlCommand } = await import(
      "@aws-sdk/client-sqs"
    );
    const client = new SQSClient({ region });
    await client.send(new GetQueueUrlCommand({ QueueName: queueName }));
    return { hop, status: "pass", details: "Queue exists" };
  } catch (error) {
    if (isQueueNotFoundError(error)) {
      return { hop, status: "fail", details: failDetails, remediation };
    }
    return {
      hop,
      status: "warn",
      details: `Could not check queue: ${summarizeError(error)}`,
      remediation: remediations.reviewPermissions(),
    };
  }
}

/**
 * Duplicate ARN detection — the same target ARN registered on the rule
 * more than once (observed in the incident: 3x the same SQS ARN).
 */
function findDuplicateTargetChecks(
  targets: Array<{ Id?: string; Arn?: string }>
): PipelineCheck[] {
  const idsByArn = new Map<string, string[]>();
  for (const target of targets) {
    if (!target.Arn) {
      continue;
    }
    const ids = idsByArn.get(target.Arn) ?? [];
    ids.push(target.Id ?? "unknown");
    idsByArn.set(target.Arn, ids);
  }

  const checks: PipelineCheck[] = [];
  for (const [arn, ids] of idsByArn) {
    if (ids.length > 1) {
      checks.push({
        hop: "EventBridge rule targets",
        status: "warn",
        details: `Duplicate targets for ${arn}: ${ids.join(", ")}`,
        remediation: remediations.duplicateRuleTargets(),
      });
    }
  }
  return checks;
}

/** The SQS target must exist on the rule and point at a real queue. */
function checkSqsTargetOnRule(
  targets: Array<{ Arn?: string }>,
  region: string
): Promise<PipelineCheck> {
  const failDetails = "events are being dropped";
  const sqsTarget = targets.find((t) => t.Arn?.split(":")[2] === "sqs");
  if (!sqsTarget) {
    return Promise.resolve({
      hop: `SQS queue ${QUEUE_NAME}`,
      status: "fail",
      details: `No SQS target on rule — ${failDetails}`,
      remediation: remediations.syncStack(region),
    });
  }
  return checkQueueExists(
    QUEUE_NAME,
    region,
    failDetails,
    remediations.syncStack(region)
  );
}

/** Platform webhook target presence must match metadata expectations. */
function checkPlatformWebhookTargetPresence(
  webhookTargetPresent: boolean,
  expectPlatformWebhook: boolean,
  region: string
): PipelineCheck | null {
  if (expectPlatformWebhook && !webhookTargetPresent) {
    return {
      hop: "Platform webhook target",
      status: "fail",
      details:
        "platform webhook target missing but metadata says connected — dashboard receives no events",
      remediation: remediations.syncStack(region),
    };
  }
  if (!expectPlatformWebhook && webhookTargetPresent) {
    return {
      hop: "Platform webhook target",
      status: "warn",
      details:
        "Webhook target exists on the rule but metadata has no webhookSecret — stack/metadata mismatch, possibly a lost metadata file",
      remediation: remediations.metadataDivergence(),
    };
  }
  if (expectPlatformWebhook && webhookTargetPresent) {
    return {
      hop: "Platform webhook target",
      status: "pass",
      details: "Platform webhook target present",
    };
  }
  return null;
}

/**
 * List the rule's targets and evaluate: duplicate targets, whether the SQS
 * target exists and points at a real queue, and whether a platform webhook
 * target is present or absent as expected by `expectPlatformWebhook`.
 */
async function checkRuleTargets(
  region: string,
  expectPlatformWebhook: boolean
): Promise<{ checks: PipelineCheck[]; webhookTargetPresent: boolean }> {
  try {
    const { EventBridgeClient, ListTargetsByRuleCommand } = await import(
      "@aws-sdk/client-eventbridge"
    );
    const client = new EventBridgeClient({ region });
    const response = await client.send(
      new ListTargetsByRuleCommand({ Rule: RULE_NAME })
    );
    const targets = response.Targets ?? [];

    const checks: PipelineCheck[] = [...findDuplicateTargetChecks(targets)];
    checks.push(await checkSqsTargetOnRule(targets, region));

    const webhookTargetPresent = targets.some((t) =>
      t.Arn?.includes(WEBHOOK_DESTINATION_NAME)
    );
    const webhookCheck = checkPlatformWebhookTargetPresence(
      webhookTargetPresent,
      expectPlatformWebhook,
      region
    );
    if (webhookCheck) {
      checks.push(webhookCheck);
    }

    return { checks, webhookTargetPresent };
  } catch (error) {
    return {
      checks: [
        {
          hop: "EventBridge rule targets",
          status: "warn",
          details: `Could not list rule targets: ${summarizeError(error)}`,
          remediation: remediations.reviewPermissions(),
        },
      ],
      webhookTargetPresent: false,
    };
  }
}

async function checkWebhookDestination(region: string): Promise<PipelineCheck> {
  const hop = `EventBridge API destination ${WEBHOOK_DESTINATION_NAME}`;
  try {
    const { EventBridgeClient, DescribeApiDestinationCommand } = await import(
      "@aws-sdk/client-eventbridge"
    );
    const client = new EventBridgeClient({ region });
    const response = await client.send(
      new DescribeApiDestinationCommand({ Name: WEBHOOK_DESTINATION_NAME })
    );
    if (response.ApiDestinationState === "ACTIVE") {
      return { hop, status: "pass", details: "Active" };
    }
    return {
      hop,
      status: "fail",
      details: `API destination is ${response.ApiDestinationState ?? "in an unknown state"}`,
      remediation: remediations.syncStack(region),
    };
  } catch (error) {
    if (isAWSNotFoundError(error)) {
      return {
        hop,
        status: "fail",
        details: "API destination not found",
        remediation: remediations.syncStack(region),
      };
    }
    return {
      hop,
      status: "warn",
      details: `Could not check API destination: ${summarizeError(error)}`,
      remediation: remediations.reviewPermissions(),
    };
  }
}

async function checkWebhookConnection(region: string): Promise<PipelineCheck> {
  const hop = `EventBridge connection ${WEBHOOK_CONNECTION_NAME}`;
  try {
    const { EventBridgeClient, DescribeConnectionCommand } = await import(
      "@aws-sdk/client-eventbridge"
    );
    const client = new EventBridgeClient({ region });
    const response = await client.send(
      new DescribeConnectionCommand({ Name: WEBHOOK_CONNECTION_NAME })
    );
    // The EventBridge SDK's ConnectionState enum lists ACTIVE alongside
    // AUTHORIZED (node_modules/@aws-sdk/client-eventbridge/dist-types/models/
    // enums.d.ts:104-114). Nothing in this repo proves an API-key connection
    // ever reports ACTIVE, so this is a defensive widening: treating a healthy
    // state as a failure would tell the user to re-authorize a working
    // connection.
    if (
      response.ConnectionState === "AUTHORIZED" ||
      response.ConnectionState === "ACTIVE"
    ) {
      return { hop, status: "pass", details: "Authorized" };
    }
    return {
      hop,
      status: "fail",
      details: `Connection is ${response.ConnectionState ?? "in an unknown state"}`,
      remediation: remediations.syncStack(region),
    };
  } catch (error) {
    if (isAWSNotFoundError(error)) {
      return {
        hop,
        status: "fail",
        details: "Connection not found",
        remediation: remediations.syncStack(region),
      };
    }
    return {
      hop,
      status: "warn",
      details: `Could not check connection: ${summarizeError(error)}`,
      remediation: remediations.reviewPermissions(),
    };
  }
}

async function checkDLQ(region: string): Promise<PipelineCheck> {
  const hop = `SQS DLQ ${DLQ_NAME}`;
  try {
    const { SQSClient, GetQueueUrlCommand, GetQueueAttributesCommand } =
      await import("@aws-sdk/client-sqs");
    const client = new SQSClient({ region });
    const urlResponse = await client.send(
      new GetQueueUrlCommand({ QueueName: DLQ_NAME })
    );
    const attrResponse = await client.send(
      new GetQueueAttributesCommand({
        QueueUrl: urlResponse.QueueUrl,
        AttributeNames: ["ApproximateNumberOfMessages"],
      })
    );
    const count = Number(
      attrResponse.Attributes?.ApproximateNumberOfMessages ?? "0"
    );
    if (count > 0) {
      return {
        hop,
        status: "warn",
        details: `${count} dead-lettered event(s)`,
        remediation: remediations.dlqBacklog(),
      };
    }
    return { hop, status: "pass", details: "Empty" };
  } catch (error) {
    if (isQueueNotFoundError(error)) {
      return {
        hop,
        status: "fail",
        details: "Dead-letter queue missing",
        remediation: remediations.syncStack(region),
      };
    }
    return {
      hop,
      status: "warn",
      details: `Could not check DLQ: ${summarizeError(error)}`,
      remediation: remediations.reviewPermissions(),
    };
  }
}

async function checkEventSourceMapping(region: string): Promise<PipelineCheck> {
  const hop = `Lambda event source mapping ${LAMBDA_FUNCTION_NAME}`;
  try {
    const { LambdaClient, ListEventSourceMappingsCommand } = await import(
      "@aws-sdk/client-lambda"
    );
    const client = new LambdaClient({ region });
    const response = await client.send(
      new ListEventSourceMappingsCommand({ FunctionName: LAMBDA_FUNCTION_NAME })
    );
    const mapping = response.EventSourceMappings?.find((m) =>
      m.EventSourceArn?.endsWith(`:${QUEUE_NAME}`)
    );
    if (!mapping) {
      return {
        hop,
        status: "fail",
        details: `No event source mapping from ${QUEUE_NAME} — Lambda never runs`,
        remediation: remediations.syncStack(region),
      };
    }
    if (mapping.State === "Enabled") {
      return { hop, status: "pass", details: "Mapping enabled" };
    }
    return {
      hop,
      status: "fail",
      details: `Mapping is ${mapping.State ?? "in an unknown state"}`,
      remediation: remediations.syncStack(region),
    };
  } catch (error) {
    if (isAWSNotFoundError(error)) {
      return {
        hop,
        status: "fail",
        details: "Lambda function not found",
        remediation: remediations.syncStack(region),
      };
    }
    return {
      hop,
      status: "warn",
      details: `Could not check event source mapping: ${summarizeError(error)}`,
      remediation: remediations.reviewPermissions(),
    };
  }
}

async function checkHistoryTable(region: string): Promise<PipelineCheck> {
  const hop = `DynamoDB table ${HISTORY_TABLE_NAME}`;
  try {
    const { DynamoDBClient, DescribeTableCommand } = await import(
      "@aws-sdk/client-dynamodb"
    );
    const client = new DynamoDBClient({ region });
    const response = await client.send(
      new DescribeTableCommand({ TableName: HISTORY_TABLE_NAME })
    );
    const status = response.Table?.TableStatus;
    if (status === "ACTIVE") {
      return { hop, status: "pass", details: "Active" };
    }
    return {
      hop,
      status: "fail",
      details: `Table status is ${status ?? "unknown"} — event log may be unavailable`,
      remediation: remediations.syncStack(region),
    };
  } catch (error) {
    if (isAWSNotFoundError(error)) {
      return {
        hop,
        status: "fail",
        details: "Table not found — event history is not being recorded",
        remediation: remediations.syncStack(region),
      };
    }
    return {
      hop,
      status: "warn",
      details: `Could not check table: ${summarizeError(error)}`,
      remediation: remediations.reviewPermissions(),
    };
  }
}

/**
 * Three states, three remedies:
 *  - primary domain            -> Pulumi owns the set -> `wraps email sync`
 *  - additional, has a name    -> re-run the idempotent add flow
 *  - additional, no name yet   -> never migrated -> the per-domain upgrade action
 */
function configSetRemediation(
  domain: PipelineDomain,
  region: string
): Remediation {
  if (domain.isPrimary) {
    return remediations.syncStack(region);
  }
  return domain.configSetName
    ? remediations.reAddDomain(domain.domain, region)
    : remediations.migratePerDomainConfigSets(region);
}

/**
 * One configuration-set check per tracked domain, deduped by the name that
 * will actually be probed, plus an opportunistic probe of the domain-less
 * fallback name.
 *
 * The probes are independent SESv2 reads, so they run concurrently — an
 * agency tracking 25 domains would otherwise pay ~26 serial round trips on
 * every doctor run. The fan-out is capped because SESv2 configuration-set
 * reads are quota-limited per account, and a throttled probe would surface
 * as a `warn` blaming IAM permissions.
 *
 * The probed name prefers the `configSetName` metadata recorded by
 * `wraps email domains add` (domains.ts:662) over the derived one: the
 * recorded name is the set that command actually created, so if the two ever
 * diverge, probing the derived name would report a healthy set as missing.
 */
async function checkConfigSets(
  domains: PipelineDomain[],
  region: string
): Promise<PipelineCheck[]> {
  const targets = new Map<string, PipelineDomain>();
  for (const d of domains) {
    const name = d.configSetName ?? domainToConfigSetName(d.domain);
    if (!targets.has(name)) {
      targets.set(name, d);
    }
  }

  const probes = [...targets].map(([name, domain]) => ({
    name,
    optional: false,
    remediation: configSetRemediation(domain, region),
  }));
  probes.push({
    name: CONFIG_SET_FALLBACK,
    // With no tracked domains the fallback is the only set there is, so its
    // absence is a real failure rather than "this set isn't in use".
    optional: targets.size > 0,
    remediation: remediations.syncStack(region),
  });

  let read: ConfigSetReader;
  try {
    read = await createConfigSetReader(region);
  } catch (error) {
    // Loading the SDK is the one failure that is not per-probe; report it the
    // way a failed read would be reported, so this still never throws.
    return probes.map((probe) => ({
      hop: `SES config set ${probe.name}`,
      status: "warn" as const,
      details: `Could not check event destinations: ${summarizeError(error)}`,
      remediation: remediations.reviewPermissions(),
    }));
  }

  const results: (PipelineCheck | null)[] = probes.map(() => null);
  let cursor = 0;
  const runProbes = async (): Promise<void> => {
    while (cursor < probes.length) {
      const index = cursor;
      cursor += 1;
      const probe = probes[index];
      if (probe) {
        results[index] = await checkConfigSet(
          read,
          probe.name,
          probe.optional,
          probe.remediation
        );
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(CONFIG_SET_PROBE_CONCURRENCY, probes.length) },
      runProbes
    )
  );

  return results.filter((check): check is PipelineCheck => check !== null);
}

/**
 * Run every hop of the SES event pipeline health check, in pipeline order.
 * Never throws — every AWS call is isolated so one hop's failure can't
 * prevent the rest from being evaluated.
 */
export async function checkEventPipeline(
  params: CheckEventPipelineParams
): Promise<PipelineCheck[]> {
  const { region, domains, expectPlatformWebhook } = params;
  const checks: PipelineCheck[] = [];

  // 1. SES configuration set(s). The remedy differs per domain and cannot be
  // a property of the check: the primary domain's set is declared by Pulumi
  // (resources/ses.ts:182-184, :230-235) so `sync` recreates it, while
  // additional domains' sets are only ever created imperatively.
  checks.push(...(await checkConfigSets(domains, region)));

  // 2. EventBridge rule.
  const ruleResult = await checkRule(region);
  checks.push(ruleResult.check);

  // 3. Rule targets (duplicates, SQS target, platform webhook target).
  let webhookTargetPresent = false;
  if (ruleResult.exists) {
    const targetsResult = await checkRuleTargets(region, expectPlatformWebhook);
    checks.push(...targetsResult.checks);
    webhookTargetPresent = targetsResult.webhookTargetPresent;
  }

  // 4. Webhook API destination + connection (only relevant if a webhook
  // target actually exists on the rule).
  if (webhookTargetPresent) {
    checks.push(await checkWebhookDestination(region));
    checks.push(await checkWebhookConnection(region));
  }

  // 5. Dead-letter queue.
  checks.push(await checkDLQ(region));

  // 6. Lambda event source mapping.
  checks.push(await checkEventSourceMapping(region));

  // 7. DynamoDB event history table.
  checks.push(await checkHistoryTable(region));

  return checks;
}
