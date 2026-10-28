/**
 * `wraps broadcasts`: create, send, status, recipients and resume.
 *
 * Thin client over the existing /v1/batch routes. No API changes.
 *
 * Outbound rules:
 * - `create` queues a real email send. It sends immediately unless
 *   --scheduled-for is set, so it needs --yes. `create --dry-run` checks the
 *   payload locally and makes no request.
 * - `send` only promotes a draft. POST /v1/batch never creates drafts, so a
 *   broadcast made by `create` cannot be sent by `send`. Drafts come from the
 *   dashboard. `send` needs --yes.
 * - `resume` restarts a stopped send, so it needs --yes.
 *
 * Every error sets process.exitCode = 1 and is reported as a JSON envelope
 * (--json) or a clack message (human mode). Nothing in this file raises an
 * exception to the router.
 */

import * as clack from "@clack/prompts";
import pc from "picocolors";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../utils/shared/api-target.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../utils/shared/json-output.js";

type Json = Record<string, unknown>;

type CliError = { code: string; message: string; suggestion: string };

type Outcome<T> = { ok: true; value: T } | { ok: false; error: CliError };

type Target = { apiBase: string; token: string };

type Action = "create" | "send" | "status" | "recipients" | "resume";

type CommonOptions = {
  json?: boolean;
  token?: string;
  region?: string;
  yes?: boolean;
};

// Payload fields shared by create and send. Names match the route body.
type ContentOptions = {
  awsAccountId?: string;
  channel?: string;
  name?: string;
  audienceType?: string;
  topicId?: string;
  segmentId?: string;
  subject?: string;
  previewText?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  templateId?: string;
  htmlContent?: string;
  body?: string;
  senderId?: string;
  scheduledFor?: string;
  totalRecipients?: string;
  variableMappings?: string;
};

export type BroadcastsCreateOptions = CommonOptions &
  ContentOptions & { dryRun?: boolean };

export type BroadcastsSendOptions = CommonOptions &
  ContentOptions & { id?: string };

export type BroadcastsStatusOptions = CommonOptions & { id?: string };

export type BroadcastsRecipientsOptions = CommonOptions & {
  id?: string;
  status?: string;
  limit?: string;
  cursor?: string;
};

export type BroadcastsResumeOptions = CommonOptions & {
  id?: string;
  fromChunkIndex?: string;
};

const CHANNELS = ["email", "sms"];
const AUDIENCE_TYPES = ["all", "topic", "segment"];
const TEXT_FIELDS = [
  "name",
  "topicId",
  "segmentId",
  "subject",
  "previewText",
  "from",
  "fromName",
  "replyTo",
  "templateId",
  "htmlContent",
  "body",
  "senderId",
] as const;
const STATUS_FIELDS = [
  "status",
  "channel",
  "name",
  "totalRecipients",
  "processedRecipients",
  "sent",
  "delivered",
  "failed",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "suppressed",
  "startedAt",
  "completedAt",
  "createdAt",
] as const;
const PLAN_DENIAL = /plan or higher|upgrade/i;
const NOT_DRAFT = /only drafts can be promoted|cannot promote batch/i;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Report a failure and set the exit code. Used by every error path. */
function fail(command: string, error: CliError): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(command, error);
    return;
  }
  clack.log.error(error.message);
  clack.log.info(error.suggestion);
}

/** Print the JSON envelope in JSON mode, otherwise run the human output. */
function succeed(command: string, data: Json, human: () => void): void {
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }
  human();
}

function missingFlag(flag: string, suggestion: string): CliError {
  return {
    code: "MISSING_REQUIRED_FLAG",
    message: `${flag} is required`,
    suggestion,
  };
}

function missingId(verb: string): CliError {
  return {
    code: "MISSING_REQUIRED_FLAG",
    message: "A broadcast id is required",
    suggestion: `Usage: wraps broadcasts ${verb} <id>. List ids in the dashboard or from the create output.`,
  };
}

function invalidValue(flag: string, expected: string): CliError {
  return {
    code: "INVALID_FLAG_USAGE",
    message: `${flag} must be ${expected}`,
    suggestion: `Pass ${flag} as ${expected}, then retry.`,
  };
}

const WHOLE_NUMBER = /^\d+$/;

/** Whole number from a flag string, or null when it is not one in range. */
function parseWhole(raw: string, min: number, max?: number): number | null {
  if (!WHOLE_NUMBER.test(raw)) {
    return null;
  }
  const n = Number(raw);
  if (n < min || (max !== undefined && n > max)) {
    return null;
  }
  return n;
}

/** Refuse a live send unless --yes was passed. Makes no request. */
function requireYes(
  command: string,
  yes: boolean | undefined,
  message: string,
  suggestion: string
): boolean {
  if (yes) {
    return true;
  }
  fail(command, { code: "CONFIRMATION_REQUIRED", message, suggestion });
  return false;
}

async function resolveTarget(
  command: string,
  token: string | undefined
): Promise<Target | null> {
  const check = checkApiTarget(await resolveApiTarget({ token }));
  if (!check.ok) {
    fail(command, {
      code: "NOT_AUTHENTICATED",
      message: check.reason,
      suggestion: `${check.suggestion}. You can also pass --token or set WRAPS_API_KEY.`,
    });
    return null;
  }
  return check.target;
}

function apiMessage(body: Json | null): string | null {
  // Read `message` before `error`: some routes put the human text in `message`.
  for (const key of ["message", "error"]) {
    const value = body?.[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function mapHttpError(
  status: number,
  body: Json | null,
  action: Action
): CliError {
  const message = apiMessage(body) ?? `The API returned HTTP ${status}`;

  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message,
      suggestion:
        "The API key was rejected. Run wraps auth login, or pass a valid key with --token or WRAPS_API_KEY.",
    };
  }
  if (status === 402 || (status === 403 && PLAN_DENIAL.test(message))) {
    return {
      code: "PLAN_REQUIRED",
      message,
      suggestion:
        "Your plan does not include this broadcast. Topic and segment audiences and scheduled sends each need their own plan entitlement. Upgrade at wraps.dev/upgrade, or use --audience-type all and drop --scheduled-for.",
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message,
      suggestion:
        "This key cannot use the AWS account given. Pass --aws-account-id with an AWS account row id from this organization (wraps email health lists each account with its id), then retry.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message,
      suggestion:
        "No broadcast with that id exists in this organization. Check the id and retry.",
    };
  }
  if (status === 400 && NOT_DRAFT.test(message)) {
    return {
      code: "NOT_DRAFT",
      message,
      suggestion:
        "wraps broadcasts send only promotes drafts, and drafts are made in the dashboard. A broadcast made with wraps broadcasts create is already queued or scheduled: check it with wraps broadcasts status <id>.",
    };
  }
  if (status === 503 && action === "resume") {
    return {
      code: "RESUME_DISABLED",
      message,
      suggestion:
        "Resume is switched off on this deployment. Check the broadcast with wraps broadcasts status <id>, then try again later.",
    };
  }
  if (status === 409) {
    return {
      code: "CONFLICT",
      message,
      suggestion:
        "The broadcast is not in a state that allows this action. Run wraps broadcasts status <id> to see its current state.",
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message,
      suggestion: "Too many requests. Wait a minute, then retry.",
    };
  }
  if (status >= 500) {
    return {
      code: "SERVER_ERROR",
      message,
      suggestion:
        "The Wraps API failed. Retry in a few minutes. For create or send, run wraps broadcasts status first: the broadcast may already be queued.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message,
      suggestion:
        "The API rejected the request. Fix the input named in the message, then retry. create --dry-run checks the payload locally.",
    };
  }
  return {
    code: "REQUEST_FAILED",
    message,
    suggestion:
      "The API rejected the request. Read the message above, fix the input, then retry.",
  };
}

async function callApi(
  target: Target,
  call: {
    action: Action;
    method: "GET" | "POST";
    path: string;
    query?: URLSearchParams;
    body?: Json;
  }
): Promise<Outcome<Json>> {
  const query = call.query?.toString();
  const url = `${target.apiBase}${call.path}${query ? `?${query}` : ""}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${target.token}`,
  };
  if (call.body) {
    headers["Content-Type"] = "application/json";
  }

  let resp: Awaited<ReturnType<typeof fetch>>;
  try {
    resp = await fetch(url, {
      method: call.method,
      headers,
      body: call.body ? JSON.stringify(call.body) : undefined,
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: `Could not reach the Wraps API: ${errorText(error)}`,
        suggestion:
          "Check your network connection and WRAPS_API_URL, then retry. For create or send, run wraps broadcasts status first: the request may already have been accepted.",
      },
    };
  }

  const body = (await resp.json().catch(() => null)) as Json | null;
  if (!resp.ok) {
    return { ok: false, error: mapHttpError(resp.status, body, call.action) };
  }
  if (body === null || typeof body !== "object") {
    return {
      ok: false,
      error: {
        code: "REQUEST_FAILED",
        message: "The API returned a response that is not a JSON object",
        suggestion:
          "Retry the command. If it keeps failing, report it with the broadcast id and the time of the request.",
      },
    };
  }
  return { ok: true, value: body };
}

/**
 * Turn the create/send flags into a route body. Validates locally; returns the
 * first problem found. `requireTotal` is true for send, whose route requires
 * the recipient count.
 */
function buildPayload(
  options: ContentOptions,
  requireTotal: boolean
): Outcome<Json> {
  if (!options.awsAccountId) {
    return {
      ok: false,
      error: missingFlag(
        "--aws-account-id",
        "Pass --aws-account-id with an AWS account row id from this organization. wraps email health lists each account with its id."
      ),
    };
  }
  const payload: Json = { awsAccountId: options.awsAccountId };

  if (options.channel !== undefined) {
    if (!CHANNELS.includes(options.channel)) {
      return { ok: false, error: invalidValue("--channel", "email or sms") };
    }
    payload.channel = options.channel;
  }

  if (options.audienceType !== undefined) {
    if (!AUDIENCE_TYPES.includes(options.audienceType)) {
      return {
        ok: false,
        error: invalidValue("--audience-type", "all, topic or segment"),
      };
    }
    if (options.audienceType === "topic" && !options.topicId) {
      return {
        ok: false,
        error: missingFlag(
          "--topic-id",
          "A topic audience needs --topic-id <id>. Use --audience-type all to send to every contact."
        ),
      };
    }
    if (options.audienceType === "segment" && !options.segmentId) {
      return {
        ok: false,
        error: missingFlag(
          "--segment-id",
          "A segment audience needs --segment-id <id>. Use --audience-type all to send to every contact."
        ),
      };
    }
    payload.audienceType = options.audienceType;
  }

  for (const key of TEXT_FIELDS) {
    const value = options[key];
    if (value) {
      payload[key] = value;
    }
  }

  if (options.scheduledFor !== undefined) {
    const when = Date.parse(options.scheduledFor);
    if (Number.isNaN(when)) {
      return {
        ok: false,
        error: invalidValue(
          "--scheduled-for",
          "an ISO 8601 date-time such as 2030-01-01T09:00:00Z"
        ),
      };
    }
    payload.scheduledFor = new Date(when).toISOString();
  }

  if (options.totalRecipients !== undefined) {
    const total = parseWhole(options.totalRecipients, 0);
    if (total === null) {
      return {
        ok: false,
        error: invalidValue("--total-recipients", "a whole number, 0 or more"),
      };
    }
    payload.totalRecipients = total;
  } else if (requireTotal) {
    return {
      ok: false,
      error: missingFlag(
        "--total-recipients",
        "send needs the recipient count for the draft. Read totalRecipients from wraps broadcasts status <id> and pass it as --total-recipients."
      ),
    };
  }

  if (options.variableMappings !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(options.variableMappings);
    } catch (error) {
      return {
        ok: false,
        error: invalidValue(
          "--variable-mappings",
          `a JSON array (${errorText(error)})`
        ),
      };
    }
    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        error: invalidValue("--variable-mappings", "a JSON array"),
      };
    }
    payload.variableMappings = parsed;
  }

  return { ok: true, value: payload };
}

/**
 * Create a broadcast. Sends immediately unless --scheduled-for is set.
 * `--dry-run` validates the flags and prints the payload; no request is made.
 */
export async function broadcastsCreate(
  options: BroadcastsCreateOptions
): Promise<void> {
  const command = "broadcasts.create";

  if (
    !(
      options.dryRun ||
      requireYes(
        command,
        options.yes,
        "wraps broadcasts create starts a real email send. Pass --yes to confirm.",
        "Add --yes to queue the send. With --scheduled-for it is scheduled instead of sent now. Use --dry-run to check the payload first."
      )
    )
  ) {
    return;
  }

  const built = buildPayload(options, false);
  if (!built.ok) {
    fail(command, built.error);
    return;
  }

  if (options.dryRun) {
    const data: Json = {
      id: null,
      status: null,
      channel: built.value.channel ?? "email",
      totalRecipients: null,
      createdAt: null,
      warning: null,
      dryRun: true,
      payload: built.value,
    };
    succeed(command, data, () => {
      clack.note(
        JSON.stringify(built.value, null, 2),
        "Dry run: nothing was sent"
      );
    });
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const res = await callApi(target, {
    action: "create",
    method: "POST",
    path: "/v1/batch",
    body: built.value,
  });
  if (!res.ok) {
    fail(command, res.error);
    return;
  }

  const r = res.value;
  const data: Json = {
    id: r.id ?? null,
    status: r.status ?? null,
    channel: r.channel ?? null,
    totalRecipients: r.totalRecipients ?? null,
    createdAt: r.createdAt ?? null,
    warning: r.warning ?? null,
    dryRun: false,
    payload: built.value,
  };
  succeed(command, data, () => {
    clack.log.success(
      `Broadcast ${String(data.id)} is ${String(data.status)}.`
    );
    if (typeof data.warning === "string") {
      clack.log.warn(data.warning);
    }
    clack.log.info(`Check it with: wraps broadcasts status ${String(data.id)}`);
  });
}

/**
 * Send a draft broadcast. Only drafts created in the dashboard can be sent;
 * a broadcast made by `wraps broadcasts create` is already queued.
 */
export async function broadcastsSend(
  options: BroadcastsSendOptions
): Promise<void> {
  const command = "broadcasts.send";

  if (!options.id) {
    fail(command, missingId("send"));
    return;
  }
  if (
    !requireYes(
      command,
      options.yes,
      `wraps broadcasts send ${options.id} starts a real email send. Pass --yes to confirm.`,
      `Add --yes to send draft ${options.id}. Only drafts created in the dashboard can be sent. Check it with wraps broadcasts status ${options.id}.`
    )
  ) {
    return;
  }

  const built = buildPayload(options, true);
  if (!built.ok) {
    fail(command, built.error);
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const res = await callApi(target, {
    action: "send",
    method: "POST",
    path: `/v1/batch/${encodeURIComponent(options.id)}/send`,
    body: built.value,
  });
  if (!res.ok) {
    fail(command, res.error);
    return;
  }

  const data: Json = {
    id: res.value.id ?? options.id,
    status: res.value.status ?? null,
    warning: res.value.warning ?? null,
  };
  succeed(command, data, () => {
    clack.log.success(`Draft ${String(data.id)} is ${String(data.status)}.`);
    if (typeof data.warning === "string") {
      clack.log.warn(data.warning);
    }
  });
}

/** Show a broadcast's status and delivery counts. */
export async function broadcastsStatus(
  options: BroadcastsStatusOptions
): Promise<void> {
  const command = "broadcasts.status";

  if (!options.id) {
    fail(command, missingId("status"));
    return;
  }
  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const res = await callApi(target, {
    action: "status",
    method: "GET",
    path: `/v1/batch/${encodeURIComponent(options.id)}`,
  });
  if (!res.ok) {
    fail(command, res.error);
    return;
  }

  const data: Json = { id: res.value.id ?? options.id };
  for (const key of STATUS_FIELDS) {
    data[key] = res.value[key] ?? null;
  }
  succeed(command, data, () => {
    const rows: [string, unknown][] = [
      ["Status:", data.status],
      ["Channel:", data.channel],
      ["Name:", data.name],
      ["Recipients:", data.totalRecipients],
      ["Processed:", data.processedRecipients],
      ["Sent:", data.sent],
      ["Delivered:", data.delivered],
      ["Failed:", data.failed],
      ["Opened:", data.opened],
      ["Clicked:", data.clicked],
      ["Bounced:", data.bounced],
      ["Complained:", data.complained],
      ["Suppressed:", data.suppressed],
      ["Started:", data.startedAt],
      ["Completed:", data.completedAt],
      ["Created:", data.createdAt],
    ];
    const lines = rows.map(
      ([label, value]) =>
        `${pc.dim(label.padEnd(14))} ${value === null ? pc.dim("—") : String(value)}`
    );
    clack.note(lines.join("\n"), `Broadcast ${String(data.id)}`);
  });
}

/**
 * List recipients. `--cursor` is the offset returned as `nextCursor` by the
 * previous call. Offsets are the cursor because the route is offset-based.
 *
 * nextCursor rule: when the response has `total`, the next offset is returned
 * while offset + rows < total. When `total` is absent, the next offset is
 * returned only if the page is full (rows.length === limit).
 */
export async function broadcastsRecipients(
  options: BroadcastsRecipientsOptions
): Promise<void> {
  const command = "broadcasts.recipients";

  if (!options.id) {
    fail(command, missingId("recipients"));
    return;
  }

  let limit: number | undefined;
  if (options.limit !== undefined) {
    const parsed = parseWhole(options.limit, 1, 1000);
    if (parsed === null) {
      fail(command, invalidValue("--limit", "a whole number from 1 to 1000"));
      return;
    }
    limit = parsed;
  }

  let offset = 0;
  if (options.cursor !== undefined) {
    const parsed = parseWhole(options.cursor, 0);
    if (parsed === null) {
      fail(
        command,
        invalidValue(
          "--cursor",
          "a value returned as nextCursor by an earlier call"
        )
      );
      return;
    }
    offset = parsed;
  }

  const query = new URLSearchParams();
  if (limit !== undefined) {
    query.set("limit", String(limit));
  }
  query.set("offset", String(offset));
  if (options.status) {
    query.set("status", options.status);
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const res = await callApi(target, {
    action: "recipients",
    method: "GET",
    path: `/v1/batch/${encodeURIComponent(options.id)}/recipients`,
    query,
  });
  if (!res.ok) {
    fail(command, res.error);
    return;
  }

  const r = res.value;
  const rows = Array.isArray(r.data) ? (r.data as Json[]) : [];
  const respOffset = typeof r.offset === "number" ? r.offset : offset;
  const respLimit = typeof r.limit === "number" ? r.limit : null;
  const total = typeof r.total === "number" ? r.total : null;
  const next = respOffset + rows.length;
  const hasMore =
    total !== null
      ? next < total
      : respLimit !== null && rows.length === respLimit;
  const nextCursor = hasMore && rows.length > 0 ? String(next) : null;

  const data: Json = {
    id: options.id,
    recipients: rows,
    limit: respLimit,
    offset: respOffset,
    total,
    nextCursor,
  };
  succeed(command, data, () => {
    if (rows.length === 0) {
      clack.log.info("No recipients match.");
      return;
    }
    const lines = rows.map((row) => {
      const status = String(row.status ?? "—").padEnd(12);
      const recipient = String(row.recipient ?? "—");
      return `${status}  ${recipient}`;
    });
    clack.note(
      lines.join("\n"),
      total === null
        ? "Recipients"
        : `Recipients — ${total} total (offset ${respOffset})`
    );
    if (nextCursor !== null) {
      clack.log.info(`More recipients. Use: --cursor ${nextCursor}`);
    }
  });
}

/**
 * Resume a stopped send. Refused without --yes. The API only resumes a
 * processing or failed email broadcast; anything else is reported as CONFLICT.
 */
export async function broadcastsResume(
  options: BroadcastsResumeOptions
): Promise<void> {
  const command = "broadcasts.resume";

  if (!options.id) {
    fail(command, missingId("resume"));
    return;
  }
  if (
    !requireYes(
      command,
      options.yes,
      `wraps broadcasts resume ${options.id} sends real email. Pass --yes to confirm.`,
      `Add --yes to resume broadcast ${options.id}. Check its state first with wraps broadcasts status ${options.id}.`
    )
  ) {
    return;
  }

  let body: Json | undefined;
  if (options.fromChunkIndex !== undefined) {
    const chunk = parseWhole(options.fromChunkIndex, 0);
    if (chunk === null) {
      fail(
        command,
        invalidValue("--from-chunk-index", "a whole number, 0 or more")
      );
      return;
    }
    body = { fromChunkIndex: chunk };
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const res = await callApi(target, {
    action: "resume",
    method: "POST",
    path: `/v1/batch/${encodeURIComponent(options.id)}/resume`,
    body,
  });
  if (!res.ok) {
    fail(command, res.error);
    return;
  }

  const data: Json = {
    id: options.id,
    resumed: res.value.resumed === true,
    fromChunkIndex:
      typeof res.value.fromChunkIndex === "number"
        ? res.value.fromChunkIndex
        : null,
  };
  succeed(command, data, () => {
    clack.log.success(`Broadcast ${String(data.id)} resumed.`);
  });
}
