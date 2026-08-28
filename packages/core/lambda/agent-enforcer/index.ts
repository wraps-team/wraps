import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  type AgentConfigItem,
  type AgentEmailPayload,
  type AgentPolicy,
  configItemKey,
  dayCounterKey,
  type EnforcerRequest,
  type EnforcerResponse,
  hourCounterKey,
  isoDateWindow,
  isoHourWindow,
  outcomeItemKey,
} from "../../src/agent-enforcer-contract.js";

/** Counter/outcome items live for 48h then TTL-reap. Cleanup only, never window logic. */
const TTL_SECONDS = 48 * 60 * 60;

/** Default configuration set, mirroring @wraps/email-send's WRAPS_CONFIGURATION_SET_NAME. */
const DEFAULT_CONFIG_SET = "wraps-email-tracking";

export type EnforcerDeps = {
  dynamo: DynamoDBDocumentClient;
  sesClient: SESv2Client;
  fetchImpl?: typeof fetch;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "ConditionalCheckFailedException"
  );
}

async function loadConfig(
  dynamo: DynamoDBDocumentClient,
  table: string,
  agentId: string
): Promise<AgentConfigItem | null> {
  const res = await dynamo.send(
    new GetCommand({ TableName: table, Key: configItemKey(agentId) })
  );
  if (!res.Item) {
    return null;
  }
  return {
    killed: res.Item.killed === true,
    emailAddress: String(res.Item.emailAddress ?? ""),
    policy: res.Item.policy as AgentPolicy,
  };
}

/**
 * A single plausible email string: exactly one `@`, a dotted domain, no commas
 * or whitespace (which would smuggle a second recipient), within SES's 320-char
 * address limit. Enforced-mode sends carry exactly one recipient (COR-6).
 */
function isSingleEmail(to: unknown): to is string {
  if (typeof to !== "string") {
    return false;
  }
  if (to.length === 0 || to.length > 320) {
    return false;
  }
  return /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(to);
}

/**
 * A value safe to place on a MIME header line. CR/LF is the header-injection
 * vector; SES additionally requires printable ASCII. Mirrors
 * assertNoHeaderInjection() in wraps-js packages/email/src/utils/headers.ts,
 * reimplemented as a predicate because the enforcer returns verdicts, never throws.
 */
function isSafeHeaderValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 998 &&
    /^[\x20-\x7e]+$/.test(value)
  );
}

/** Sender pinning (SEC-3): `payload.from` must be the agent's own address. */
function isOwnSender(from: unknown, emailAddress: string): boolean {
  return (
    typeof from === "string" &&
    emailAddress.length > 0 &&
    from.toLowerCase() === emailAddress.toLowerCase()
  );
}

function isAllowed(to: string, policy: AgentPolicy): boolean {
  const addr = to.toLowerCase();
  const domain = addr.split("@")[1] ?? "";
  if (policy.allowedRecipients.some((r) => r.toLowerCase() === addr)) {
    return true;
  }
  if (policy.allowedRecipientDomains.some((d) => d.toLowerCase() === domain)) {
    return true;
  }
  return false;
}

/**
 * Conditional cap increment. Returns false when the cap is already reached
 * (ConditionalCheckFailedException) — the item is NOT mutated in that case, so
 * the counter never exceeds the cap. Never read-modify-write.
 */
async function tryIncrement(
  dynamo: DynamoDBDocumentClient,
  table: string,
  key: { pk: string; sk: string },
  cap: number,
  ttl: number
): Promise<boolean> {
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: table,
        Key: key,
        UpdateExpression:
          "SET sends = if_not_exists(sends, :z) + :one, expiresAt = if_not_exists(expiresAt, :ttl)",
        ConditionExpression: "attribute_not_exists(sends) OR sends < :cap",
        ExpressionAttributeValues: {
          ":z": 0,
          ":one": 1,
          ":cap": cap,
          ":ttl": ttl,
        },
      })
    );
    return true;
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Best-effort compensating decrement of a cap counter. Used when a later cap
 * (daily) blocks a send after an earlier cap (hourly) already consumed a slot,
 * so a daily-capped send never burns an hourly slot (COR-9). Guarded so the
 * counter can never go negative; swallows errors — over-counting by one on a
 * transient failure is acceptable, the TTL reaps the window anyway.
 */
async function tryDecrement(
  dynamo: DynamoDBDocumentClient,
  table: string,
  key: { pk: string; sk: string }
): Promise<void> {
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: table,
        Key: key,
        UpdateExpression: "SET sends = sends - :one",
        ConditionExpression: "attribute_exists(sends) AND sends > :z",
        ExpressionAttributeValues: { ":one": 1, ":z": 0 },
      })
    );
  } catch {
    // Best-effort compensation only.
  }
}

/** Verdict reason if the optional header fields are malformed, else null. */
function headerFieldProblem(payload: AgentEmailPayload): string | null {
  if (payload.replyTo !== undefined && !isSingleEmail(payload.replyTo)) {
    return "invalid reply-to";
  }
  if (
    payload.inReplyTo !== undefined &&
    !isSafeHeaderValue(payload.inReplyTo)
  ) {
    return "invalid in-reply-to";
  }
  if (
    payload.references !== undefined &&
    !isSafeHeaderValue(payload.references)
  ) {
    return "invalid references";
  }
  return null;
}

/** Caller identity bound to the invoke principal, never the payload (SEC-2). */
type Caller = { kind: "agent"; agentId: string } | { kind: "platform" };

const AGENT_QUALIFIER_PREFIX = "agent-";

/**
 * Resolve the caller from the Lambda alias qualifier in `invokedFunctionArn`
 * (`arn:aws:lambda:region:acct:function:name[:qualifier]`), NOT from the invoke
 * payload — a payload `agentId` is forgeable and grants nothing (SEC-2).
 * - qualifier `agent-<id>` → that agent (may `send`/`status`).
 * - no qualifier or `$LATEST` → the platform assume-role (may `execute`).
 */
function resolveCaller(context?: { invokedFunctionArn?: string }): Caller {
  const arn = context?.invokedFunctionArn ?? "";
  const parts = arn.split(":");
  const qualifier = parts.length >= 8 ? parts[7] : undefined;
  if (qualifier?.startsWith(AGENT_QUALIFIER_PREFIX)) {
    return {
      kind: "agent",
      agentId: qualifier.slice(AGENT_QUALIFIER_PREFIX.length),
    };
  }
  return { kind: "platform" };
}

const UNAUTHORIZED: EnforcerResponse = {
  status: "blocked",
  reason: "unauthorized action for caller",
};

/**
 * Send a single email through SES v2.
 *
 * TODO: unify with @wraps/email-send — this mirrors sendEmail() in
 * packages/email-send/src/send.ts:55-89 (Simple content, configuration set,
 * EmailTags). It is inlined because @wraps/core cannot import the workspace
 * package from a bundled Lambda. Keep the fields identical.
 */
async function sendViaSes(
  sesClient: SESv2Client,
  payload: AgentEmailPayload,
  agentId: string,
  configSet: string
): Promise<string> {
  const headers = [
    ...(payload.inReplyTo
      ? [{ Name: "In-Reply-To", Value: payload.inReplyTo }]
      : []),
    ...(payload.references
      ? [{ Name: "References", Value: payload.references }]
      : []),
  ];

  const response = await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: payload.from,
      Destination: { ToAddresses: [payload.to] },
      ...(payload.replyTo ? { ReplyToAddresses: [payload.replyTo] } : {}),
      Content: {
        Simple: {
          Subject: { Data: payload.subject },
          Body: {
            Html: { Data: payload.html },
            Text: { Data: payload.text },
          },
          ...(headers.length > 0 ? { Headers: headers } : {}),
        },
      },
      ConfigurationSetName: configSet,
      EmailTags: [{ Name: "agentId", Value: agentId }],
    })
  );
  if (!response.MessageId) {
    throw new Error("SES SendEmail returned no MessageId");
  }
  return response.MessageId;
}

/**
 * Enforcer handler factory. Tests inject mocked clients; the default export
 * wires real AWS clients. Check ordering is sacred: kill flag FIRST, allowlist
 * SECOND, caps THIRD.
 */
export function createHandler(deps: EnforcerDeps) {
  const { dynamo, sesClient } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;

  async function flag(
    agentId: string,
    payload: AgentEmailPayload,
    reason: string
  ): Promise<EnforcerResponse> {
    const apiUrl = requireEnv("WRAPS_API_URL");
    const secret = requireEnv("WRAPS_AGENT_WEBHOOK_SECRET");
    const response = await fetchImpl(`${apiUrl}/v1/agents/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wraps-agent-key": secret,
      },
      body: JSON.stringify({
        agentId,
        event: "pending_approval",
        payload,
        reason,
      }),
    });
    if (!response.ok) {
      throw new Error(`agent webhook failed: ${response.status}`);
    }
    const data = (await response.json()) as { approvalId?: string };
    return { status: "pending_approval", approvalId: data.approvalId, reason };
  }

  /**
   * @param agentId - the caller-bound identity (from the Lambda alias, SEC-2),
   *   NOT `event.agentId`; all CONFIG/counter/webhook keys use it.
   */
  async function handleSend(
    table: string,
    agentId: string,
    event: EnforcerRequest
  ): Promise<EnforcerResponse> {
    const payload = event.payload;
    if (!payload) {
      return { status: "failed", reason: "missing payload" };
    }
    // Enforced mode is single-recipient; reject anything not a lone address (COR-6).
    if (!isSingleEmail(payload.to)) {
      return { status: "blocked", reason: "invalid recipient" };
    }
    const headerProblem = headerFieldProblem(payload);
    if (headerProblem) {
      return { status: "blocked", reason: headerProblem };
    }

    const config = await loadConfig(dynamo, table, agentId);
    // 1. Kill-switch + policy existence FIRST.
    if (!config) {
      return { status: "blocked", reason: "unknown agent" };
    }
    if (config.killed) {
      return { status: "blocked", reason: "killed" };
    }

    // 2. Sender pinning: the agent may only send as its own address (SEC-3).
    if (!isOwnSender(payload.from, config.emailAddress)) {
      return {
        status: "blocked",
        reason: "from must be the agent's own address",
      };
    }

    // 3. Recipient allowlist (before consuming any cap).
    if (!isAllowed(payload.to, config.policy)) {
      return flag(agentId, payload, "recipient not on allowlist");
    }

    // 4. Caps. cap<=0 means "block every send" — flag BEFORE any counter
    //    write, never one free send (COR-7 / convention 6).
    if (config.policy.maxPerHour <= 0) {
      return flag(agentId, payload, "hourly cap reached");
    }
    if (config.policy.maxPerDay <= 0) {
      return flag(agentId, payload, "daily cap reached");
    }

    const now = new Date();
    const ttl = Math.floor(now.getTime() / 1000) + TTL_SECONDS;
    const hourKey = hourCounterKey(agentId, isoHourWindow(now));
    const hourOk = await tryIncrement(
      dynamo,
      table,
      hourKey,
      config.policy.maxPerHour,
      ttl
    );
    if (!hourOk) {
      return flag(agentId, payload, "hourly cap reached");
    }
    const dayOk = await tryIncrement(
      dynamo,
      table,
      dayCounterKey(agentId, isoDateWindow(now)),
      config.policy.maxPerDay,
      ttl
    );
    if (!dayOk) {
      // The hourly slot was consumed above but the send never happens — give it
      // back so a daily-capped send doesn't burn an hourly slot (COR-9).
      await tryDecrement(dynamo, table, hourKey);
      return flag(agentId, payload, "daily cap reached");
    }

    const configSet = process.env.CONFIG_SET || DEFAULT_CONFIG_SET;
    try {
      const messageId = await sendViaSes(
        sesClient,
        payload,
        agentId,
        configSet
      );
      return { status: "sent", messageId };
    } catch (error) {
      return { status: "failed", reason: String(error) };
    }
  }

  async function writeOutcome(
    table: string,
    approvalId: string,
    agentId: string,
    outcome: EnforcerResponse
  ): Promise<void> {
    await dynamo.send(
      new PutCommand({
        TableName: table,
        Item: {
          ...outcomeItemKey(approvalId),
          agentId,
          status: outcome.status,
          messageId: outcome.messageId,
          reason: outcome.reason,
          expiresAt: Math.floor(Date.now() / 1000) + TTL_SECONDS,
        },
      })
    );
  }

  async function handleExecute(
    table: string,
    event: EnforcerRequest
  ): Promise<EnforcerResponse> {
    const payload = event.payload;
    const approvalId = event.approvalId;
    if (!(payload && approvalId)) {
      return { status: "failed", reason: "missing payload or approvalId" };
    }

    // Idempotency: a previously recorded outcome wins — never resend (SEC-4/
    // COR-4 defense, convention 4). Approve-retry replays land here.
    const existing = await dynamo.send(
      new GetCommand({ TableName: table, Key: outcomeItemKey(approvalId) })
    );
    if (existing.Item) {
      return {
        status: existing.Item.status,
        messageId: existing.Item.messageId,
        reason: existing.Item.reason,
      };
    }

    // Re-check the kill-switch: an operator approval must not outrun a kill.
    const config = await loadConfig(dynamo, table, event.agentId);
    if (!config || config.killed) {
      return { status: "blocked", reason: "killed" };
    }

    // Sender pinning applies to approved sends too (SEC-3).
    if (!isOwnSender(payload.from, config.emailAddress)) {
      return {
        status: "blocked",
        reason: "from must be the agent's own address",
      };
    }
    if (!isSingleEmail(payload.to)) {
      return { status: "blocked", reason: "invalid recipient" };
    }
    const headerProblem = headerFieldProblem(payload);
    if (headerProblem) {
      return { status: "blocked", reason: headerProblem };
    }

    const configSet = process.env.CONFIG_SET || DEFAULT_CONFIG_SET;
    try {
      const messageId = await sendViaSes(
        sesClient,
        payload,
        event.agentId,
        configSet
      );
      const outcome: EnforcerResponse = { status: "sent", messageId };
      await writeOutcome(table, approvalId, event.agentId, outcome);
      return outcome;
    } catch (error) {
      const outcome: EnforcerResponse = {
        status: "failed",
        reason: String(error),
      };
      await writeOutcome(table, approvalId, event.agentId, outcome);
      return outcome;
    }
  }

  /**
   * @param agentId - the caller-bound identity (SEC-2). A stored outcome is only
   *   revealed when it belongs to this agent; any mismatch reads as `unknown`
   *   so one agent can't probe another's approvalId (SEC-9).
   */
  async function handleStatus(
    table: string,
    agentId: string,
    event: EnforcerRequest
  ): Promise<EnforcerResponse> {
    const approvalId = event.approvalId;
    if (!approvalId) {
      return { status: "failed", reason: "missing approvalId" };
    }
    const res = await dynamo.send(
      new GetCommand({ TableName: table, Key: outcomeItemKey(approvalId) })
    );
    if (!res.Item || res.Item.agentId !== agentId) {
      return { status: "unknown" };
    }
    return {
      status: res.Item.status,
      messageId: res.Item.messageId,
      reason: res.Item.reason,
    };
  }

  return async function handler(
    event: EnforcerRequest,
    context?: { invokedFunctionArn?: string }
  ): Promise<EnforcerResponse> {
    const table = requireEnv("POLICY_TABLE");
    const caller = resolveCaller(context);
    switch (event.action) {
      case "send":
        return caller.kind === "agent"
          ? handleSend(table, caller.agentId, event)
          : UNAUTHORIZED;
      case "status":
        return caller.kind === "agent"
          ? handleStatus(table, caller.agentId, event)
          : UNAUTHORIZED;
      case "execute":
        return caller.kind === "platform"
          ? handleExecute(table, event)
          : UNAUTHORIZED;
      default:
        return { status: "failed", reason: `unknown action: ${event.action}` };
    }
  };
}

const awsDefaults = {
  requestHandler: new NodeHttpHandler({
    requestTimeout: 10_000,
    connectionTimeout: 5000,
  }),
  maxAttempts: 5,
};

const defaultDynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient(awsDefaults)
);
const defaultSes = new SESv2Client(awsDefaults);

/** Lambda entry point (index.handler) wired to real AWS clients. */
export const handler = createHandler({
  dynamo: defaultDynamo,
  sesClient: defaultSes,
});
