/**
 * Agent Enforcer Service
 *
 * Bridges the Wraps API to a customer's agent-enforcer Lambda + policy table,
 * always via STS AssumeRole (customer-owned rails, zero stored credentials):
 *
 * - `syncAgentPolicy`   — mirror a Neon agent row into the customer's
 *   `wraps-email-agent-policy` DynamoDB table as the `CONFIG#<agentId>` item
 *   (policy + kill flag) so the Lambda enforces the latest state.
 * - `executeApprovedSend` — replay an operator-approved send by invoking the
 *   enforcer Lambda with `{action:"execute", approvalId, payload}` and parsing
 *   the {@link EnforcerResponse} verdict.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  type AgentConfigItem,
  type AgentEmailPayload,
  configItemKey,
  type EnforcerRequest,
  type EnforcerResponse,
  type EnforcerStatus,
} from "@wraps/core";
import type { Agent, AgentApproval } from "@wraps/db";

import { awsDefaults } from "../lib/aws-defaults";
import { log } from "../lib/logger";
import { getCredentials } from "./credentials";

/** Single-table store written by the API and read by the enforcer Lambda. */
const POLICY_TABLE = "wraps-email-agent-policy";

const RE_NOT_FOUND = /ResourceNotFoundException/;
const RE_ACCESS_DENIED = /AccessDenied|AccessDeniedException|not authorized/i;
const RE_THROTTLED = /TooManyRequestsException|Throttl/i;
const RE_EXPIRED = /ExpiredToken|credentials/i;

/** The enforcer's terminal dispositions — anything else is malformed (SEC-10). */
const ENFORCER_STATUSES: ReadonlySet<EnforcerStatus> = new Set([
  "sent",
  "pending_approval",
  "blocked",
  "failed",
  "unknown",
]);

/**
 * Validate the parsed Lambda payload before it is trusted. The enforcer is the
 * customer's own function, but a malformed/compromised response must not flow a
 * bad `status` or a non-string `messageId` into Neon (SEC-10). Anything that
 * doesn't match the {@link EnforcerResponse} shape is treated as a failure.
 */
function toEnforcerResponse(raw: unknown): EnforcerResponse | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (
    typeof o.status !== "string" ||
    !ENFORCER_STATUSES.has(o.status as EnforcerStatus)
  ) {
    return null;
  }
  if (o.messageId !== undefined && typeof o.messageId !== "string") {
    return null;
  }
  if (o.reason !== undefined && typeof o.reason !== "string") {
    return null;
  }
  if (o.approvalId !== undefined && typeof o.approvalId !== "string") {
    return null;
  }
  return o as EnforcerResponse;
}

/**
 * Describe an AWS SDK error for operator-facing storage. AWS SDK v3 sometimes
 * surfaces `name: "Error"` with the real code only in the message, so both are
 * inspected.
 */
function describeAwsError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  const haystack = `${name} ${message}`;

  if (RE_NOT_FOUND.test(haystack)) {
    return "Enforcer Lambda not found — run `wraps email agent create` to deploy it";
  }
  if (RE_ACCESS_DENIED.test(haystack)) {
    return "Access denied invoking the enforcer Lambda — reconnect the AWS account";
  }
  if (RE_THROTTLED.test(haystack)) {
    return "Enforcer Lambda throttled — try again shortly";
  }
  if (RE_EXPIRED.test(haystack)) {
    return "AWS credentials expired — reconnect the AWS account";
  }
  return message || "Unknown error invoking the enforcer";
}

function docClientFor(creds: Awaited<ReturnType<typeof getCredentials>>) {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({
      ...awsDefaults,
      region: creds.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    })
  );
}

function lambdaClientFor(creds: Awaited<ReturnType<typeof getCredentials>>) {
  return new LambdaClient({
    ...awsDefaults,
    region: creds.region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}

/**
 * Mirror an agent's policy + kill flag into the customer's DynamoDB policy
 * table so the enforcer Lambda sees the latest state on its next invocation.
 *
 * @param agentRow - The agent whose CONFIG item should be written.
 * @throws {Error} If the agent has no linked AWS account (never deployed).
 * @throws AWS SDK errors from STS AssumeRole or DynamoDB PutItem.
 */
export async function syncAgentPolicy(agentRow: Agent): Promise<void> {
  if (!agentRow.awsAccountId) {
    throw new Error(
      `Agent ${agentRow.id} has no linked AWS account — cannot sync policy`
    );
  }

  const creds = await getCredentials(
    agentRow.awsAccountId,
    agentRow.organizationId
  );
  const doc = docClientFor(creds);
  const key = configItemKey(agentRow.id);

  // The enforcer pins `payload.from` to this address (SEC-3), so the CONFIG
  // item must carry the agent's own verified sender identity (convention 3).
  const config: AgentConfigItem = {
    killed: agentRow.status === "KILLED",
    emailAddress: agentRow.emailAddress,
    policy: agentRow.policy,
  };

  await doc.send(
    new PutCommand({
      TableName: POLICY_TABLE,
      Item: {
        pk: key.pk,
        sk: key.sk,
        ...config,
      },
    })
  );
}

/**
 * Replay an operator-approved send by invoking the enforcer Lambda. The Lambda
 * re-checks the kill switch before sending (kill wins races), so policy
 * outcomes come back as a successful {@link EnforcerResponse} rather than a
 * thrown error.
 *
 * @param approval - The approved queue row (carries the send payload).
 * @param agentRow - The owning agent (carries the enforcer ARN + AWS account).
 * @returns The parsed enforcer verdict; `{status:"failed"}` on transport error.
 */
export async function executeApprovedSend(
  approval: AgentApproval,
  agentRow: Agent
): Promise<EnforcerResponse> {
  if (!(agentRow.awsAccountId && agentRow.enforcerFunctionArn)) {
    return {
      status: "failed",
      reason: "Agent is not deployed (missing enforcer ARN or AWS account)",
    };
  }

  const payload: AgentEmailPayload = {
    from: approval.payload.from,
    to: approval.payload.to,
    subject: approval.payload.subject,
    html: approval.payload.html ?? "",
    text: approval.payload.text ?? "",
    ...(approval.payload.replyTo ? { replyTo: approval.payload.replyTo } : {}),
    ...(approval.payload.inReplyTo
      ? { inReplyTo: approval.payload.inReplyTo }
      : {}),
    ...(approval.payload.references
      ? { references: approval.payload.references }
      : {}),
  };

  const request: EnforcerRequest = {
    action: "execute",
    agentId: agentRow.id,
    approvalId: approval.id,
    payload,
  };

  try {
    const creds = await getCredentials(
      agentRow.awsAccountId,
      agentRow.organizationId
    );
    const lambda = lambdaClientFor(creds);

    const result = await lambda.send(
      new InvokeCommand({
        FunctionName: agentRow.enforcerFunctionArn,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(JSON.stringify(request)),
      })
    );

    if (result.FunctionError) {
      const detail = result.Payload
        ? new TextDecoder().decode(result.Payload)
        : result.FunctionError;
      return { status: "failed", reason: `Enforcer error: ${detail}` };
    }

    if (!result.Payload) {
      return { status: "failed", reason: "Enforcer returned no payload" };
    }

    const parsed = toEnforcerResponse(
      JSON.parse(new TextDecoder().decode(result.Payload))
    );
    if (!parsed) {
      return {
        status: "failed",
        reason: "Enforcer returned a malformed response",
      };
    }

    return parsed;
  } catch (error) {
    log.error("executeApprovedSend failed", error, {
      agentId: agentRow.id,
      approvalId: approval.id,
    });
    return { status: "failed", reason: describeAwsError(error) };
  }
}
