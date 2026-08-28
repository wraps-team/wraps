/**
 * Agent enforcer contract — the deep module shared by the enforcement Lambda,
 * the Wraps API approval-execute service, and (copied verbatim) the wraps-js MCP
 * tools. Pure types plus DynamoDB key builders. No AWS SDK, no runtime clients.
 *
 * SOURCE OF TRUTH: any change here requires a matching change in the copied
 * wraps-js MCP contract (see Chunk 7).
 *
 * @packageDocumentation
 */

/** What the caller wants the enforcer to do. */
export type EnforcerAction = "send" | "execute" | "status";

/** The email an agent wants to send. Mirrors the Simple-content SES fields. */
export type AgentEmailPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where a human's reply should land. Single address; not the agent's identity. */
  replyTo?: string;
  /** RFC 5322 Message-ID of the message being replied to. */
  inReplyTo?: string;
  /** RFC 5322 References chain. */
  references?: string;
};

/**
 * Invocation payload for the enforcer Lambda (RequestResponse).
 * - `send`: an agent asks to send `payload`.
 * - `execute`: the API replays an approved send by `approvalId` (+ `payload`).
 * - `status`: an agent polls the outcome of `approvalId`.
 */
export type EnforcerRequest = {
  action: EnforcerAction;
  agentId: string;
  payload?: AgentEmailPayload;
  approvalId?: string;
};

/** Terminal disposition of an enforcer invocation. */
export type EnforcerStatus =
  | "sent"
  | "pending_approval"
  | "blocked"
  | "failed"
  | "unknown";

/**
 * Enforcer verdict. Policy outcomes (`pending_approval`, `blocked`) are
 * successful responses — the caller reads the disposition, they are never
 * transport errors.
 */
export type EnforcerResponse = {
  status: EnforcerStatus;
  messageId?: string;
  approvalId?: string;
  reason?: string;
};

/** Send policy for an agent, mirrored from Neon into the CONFIG DynamoDB item. */
export type AgentPolicy = {
  maxPerHour: number;
  maxPerDay: number;
  allowedRecipients: string[];
  allowedRecipientDomains: string[];
};

/**
 * The `CONFIG#<agentId>` item written by the Wraps API on every policy change
 * or kill. The Lambda reads `killed` first (kill-switch supremacy), then pins
 * the sender to `emailAddress`, then applies `policy`.
 *
 * `emailAddress` is the agent's own verified sender identity. The enforcer
 * requires `payload.from` (case-insensitive) to equal it on both `send` and
 * `execute` — an agent can never send as another identity (SEC-3).
 */
export type AgentConfigItem = {
  killed: boolean;
  emailAddress: string;
  policy: AgentPolicy;
};

/**
 * The `OUTCOME#<approvalId>` item written during execute/reject sync-back and
 * read by the agent's status poll.
 *
 * `agentId` scopes the record to its owning agent: `status` reads compare it to
 * the caller's bound identity and return `unknown` on any mismatch (SEC-9).
 */
export type OutcomeRecord = {
  status: EnforcerStatus;
  agentId: string;
  messageId?: string;
  reason?: string;
};

/** A DynamoDB primary key on the `wraps-email-agent-policy` table (pk + sk). */
export type ItemKey = {
  pk: string;
  sk: string;
};

/** Key of the single policy/kill config item for an agent. */
export function configItemKey(agentId: string): ItemKey {
  return { pk: `CONFIG#${agentId}`, sk: "CONFIG" };
}

/** Key of the hourly send counter for an agent within a UTC hour window. */
export function hourCounterKey(
  agentId: string,
  isoHourWindow: string
): ItemKey {
  return { pk: `HOUR#${agentId}`, sk: isoHourWindow };
}

/** Key of the daily send counter for an agent within a UTC date window. */
export function dayCounterKey(agentId: string, isoDateWindow: string): ItemKey {
  return { pk: `DAY#${agentId}`, sk: isoDateWindow };
}

/** Key of the approval-outcome item for agent status polling. */
export function outcomeItemKey(approvalId: string): ItemKey {
  return { pk: `OUTCOME#${approvalId}`, sk: "OUTCOME" };
}

/** UTC hour window bucket, e.g. `2026-07-09T14`. Cap counters are per-hour. */
export function isoHourWindow(date: Date): string {
  return date.toISOString().slice(0, 13);
}

/** UTC date window bucket, e.g. `2026-07-09`. Cap counters are per-day. */
export function isoDateWindow(date: Date): string {
  return date.toISOString().slice(0, 10);
}
