/**
 * `wraps broadcasts cancel | duplicate | update`: draft and lifecycle commands.
 *
 * Routes:
 * - cancel:    DELETE /v1/batch/:id. There is no /cancel route. The existing
 *              DELETE cancels a scheduled, queued or processing broadcast.
 *              Needs --yes (or --dry-run, which makes no request).
 * - duplicate: POST /v1/batch/:id/duplicate. Copies any broadcast into a new
 *              draft. Not destructive, so no --yes.
 * - update:    PATCH /v1/batch/:id. Edits a DRAFT or a SCHEDULED broadcast (the API
 *              picks the branch by status). Any other status returns 409
 *              naming it, and the error points at duplicate.
 *
 * broadcasts.ts does not export its helpers (requireYes, mapHttpError,
 * callApi), so the ones these commands need are defined here. That file is
 * not edited.
 *
 * Every error sets process.exitCode = 1 and is reported as a JSON envelope
 * (--json) or a clack message (human mode). Nothing raises to the router.
 */

import * as clack from "@clack/prompts";
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

type Action = "cancel" | "duplicate" | "update";

type CommonOptions = {
  json?: boolean;
  token?: string;
  region?: string;
};

/** Nullable draft fields that `--clear-<field>` can unset (the route accepts null). */
export const CLEARABLE_FIELDS = [
  "name",
  "subject",
  "previewText",
  "from",
  "fromName",
  "replyTo",
  "templateId",
  "htmlContent",
  "body",
  "senderId",
  "topicId",
  "segmentId",
  "awsAccountId",
  "scheduledFor",
  "variableMappings",
] as const;

export type ClearableField = (typeof CLEARABLE_FIELDS)[number];

export type BroadcastsCancelOptions = CommonOptions & {
  id?: string;
  yes?: boolean;
  dryRun?: boolean;
};

export type BroadcastsDuplicateOptions = CommonOptions & {
  id?: string;
};

/** Field flags, named as `broadcasts create` names them. Empty values are dropped by the parser. */
export type BroadcastsUpdateOptions = CommonOptions & {
  id?: string;
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
  variableMappings?: string;
  awsAccountId?: string;
  /** `--clear-<field>` flags. Each set field is sent as null. */
  clear?: Partial<Record<ClearableField, boolean>>;
};

const CHANNELS = ["email", "sms"];
const AUDIENCE_TYPES = ["all", "topic", "segment"];
/** Text fields sent as-is (scheduledFor and variableMappings are handled apart). */
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
  "awsAccountId",
] as const;
// planGateMiddleware: "Feature 'batch' requires <plan> plan or higher. ... Upgrade at ..."
const PLAN_DENIAL = /plan or higher|upgrade/i;
const NOT_CANCELLABLE = /cannot cancel batch in '([^']+)' status/i;
const ALREADY_STATUS = /already ([a-z_]+)/i;
const AWS_ACCOUNT_DENIAL = /AWS account/i;
const SEGMENT_MESSAGE = /segment/i;
const TOPIC_MESSAGE = /topic/i;
const TEMPLATE_MESSAGE = /template/i;
const SCHEDULE_MESSAGE = /schedul/i;

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

/** The kebab-case flag for a camelCase field, e.g. previewText -> --preview-text. */
function flagFor(field: string): string {
  return `--${field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Refuse a live action unless --yes was passed. Makes no request. */
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
  action: Action,
  id: string
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
        action === "update"
          ? "Your plan does not include this change. Scheduled sends and topic or segment audiences each need their own plan entitlement. Upgrade at wraps.dev/upgrade, or drop --scheduled-for and use --audience-type all."
          : "Your plan does not include this broadcast action. Upgrade at wraps.dev/upgrade.",
    };
  }
  if (status === 403 && AWS_ACCOUNT_DENIAL.test(message)) {
    return {
      code: "FORBIDDEN",
      message,
      suggestion:
        "--aws-account-id must be an AWS account row id from this organization. wraps email health lists each account with its id. Pass that id, then retry.",
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message,
      suggestion:
        "Your role or this API key's scopes do not allow this. A signed-in session (wraps auth login) is checked against your role; an API key is checked against its own scopes. Changing a broadcast needs broadcasts write access (key scope campaigns:write); editing a scheduled one or sending also needs send access (key scope send:email). Ask an owner or admin, then retry.",
    };
  }
  if (status === 404) {
    let suggestion = `No broadcast with id ${id} exists in this organization. Check the id, or find it with wraps broadcasts status <id>.`;
    if (SEGMENT_MESSAGE.test(message)) {
      suggestion =
        "Pass --segment-id with a segment id from this organization. List segments with: wraps segments list";
    } else if (TOPIC_MESSAGE.test(message)) {
      suggestion =
        "Pass --topic-id with a topic id from this organization, then retry.";
    } else if (TEMPLATE_MESSAGE.test(message)) {
      suggestion =
        "Pass --template-id with a template id from this organization, then retry.";
    }
    return { code: "NOT_FOUND", message, suggestion };
  }
  if (status === 409) {
    const current = ALREADY_STATUS.exec(message)?.[1] ?? "not a draft";
    return {
      code: "CONFLICT",
      message,
      suggestion: `Only drafts can be edited, and this broadcast is ${current}. Run wraps broadcasts duplicate ${id} to copy it into a new draft, or wraps broadcasts status ${id} to see its state.`,
    };
  }
  if (status === 400 && action === "cancel" && NOT_CANCELLABLE.test(message)) {
    const current = NOT_CANCELLABLE.exec(message)?.[1] ?? "this";
    return {
      code: "NOT_CANCELLABLE",
      message,
      suggestion: `Only scheduled, queued or processing broadcasts can be cancelled, and this one is ${current}. Check it with wraps broadcasts status ${id}.`,
    };
  }
  if (status === 400 || status === 422) {
    const suggestion = SCHEDULE_MESSAGE.test(message)
      ? "Pass --scheduled-for with a future ISO 8601 time such as 2030-01-01T09:00:00Z, or --clear-scheduled-for to remove the schedule, then retry."
      : "Fix the field named in the message and retry. Each flag is the field name in kebab-case, for example --preview-text for previewText.";
    return { code: "VALIDATION_FAILED", message, suggestion };
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
      code: "API_ERROR",
      message,
      suggestion: `The Wraps API failed. Retry in a few minutes. Check the broadcast first with wraps broadcasts status ${id}.`,
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
    method: "DELETE" | "POST" | "PATCH";
    path: string;
    id: string;
    body?: Json;
  }
): Promise<Outcome<Json>> {
  const url = `${target.apiBase}${call.path}`;
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
        suggestion: `Check your network connection and WRAPS_API_URL, then retry. Check the broadcast first with wraps broadcasts status ${call.id}: the request may already have been accepted.`,
      },
    };
  }

  const body = (await resp.json().catch(() => null)) as Json | null;
  if (!resp.ok) {
    return {
      ok: false,
      error: mapHttpError(resp.status, body, call.action, call.id),
    };
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

/** Cancel a scheduled, queued or processing broadcast. Refused without --yes. */
export async function broadcastsCancel(
  options: BroadcastsCancelOptions
): Promise<void> {
  const command = "broadcasts.cancel";

  if (!options.id) {
    fail(command, missingId("cancel"));
    return;
  }

  // --dry-run makes no request, so it needs no credentials and no --yes.
  if (options.dryRun) {
    const data: Json = {
      id: options.id,
      status: null,
      cancelled: false,
      dryRun: true,
    };
    succeed(command, data, () => {
      clack.log.info(
        `Dry run: broadcast ${options.id} would be cancelled. No request was sent.`
      );
    });
    return;
  }

  if (
    !requireYes(
      command,
      options.yes,
      `wraps broadcasts cancel ${options.id} stops a live or scheduled broadcast. Nothing was cancelled because --yes was not passed.`,
      `Re-run with --yes to confirm: wraps broadcasts cancel ${options.id} --yes`
    )
  ) {
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const res = await callApi(target, {
    action: "cancel",
    method: "DELETE",
    path: `/v1/batch/${encodeURIComponent(options.id)}`,
    id: options.id,
  });
  if (!res.ok) {
    fail(command, res.error);
    return;
  }

  const data: Json = {
    id: res.value.id ?? options.id,
    status: res.value.status ?? null,
    cancelled: res.value.success === true,
    dryRun: false,
  };
  succeed(command, data, () => {
    clack.log.success(
      `Broadcast ${String(data.id)} is ${String(data.status)}.`
    );
  });
}

/** Copy any broadcast into a new draft. Not destructive: no --yes. */
export async function broadcastsDuplicate(
  options: BroadcastsDuplicateOptions
): Promise<void> {
  const command = "broadcasts.duplicate";

  if (!options.id) {
    fail(command, missingId("duplicate"));
    return;
  }
  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const res = await callApi(target, {
    action: "duplicate",
    method: "POST",
    path: `/v1/batch/${encodeURIComponent(options.id)}/duplicate`,
    id: options.id,
  });
  if (!res.ok) {
    fail(command, res.error);
    return;
  }

  const data: Json = {
    id: res.value.id ?? null,
    status: res.value.status ?? null,
    name: res.value.name ?? null,
    sourceId: options.id,
  };
  succeed(command, data, () => {
    clack.log.success(
      `Created draft ${String(data.id)} (${String(data.name ?? "no name")}).`
    );
    clack.log.info(
      `Edit it with: wraps broadcasts update ${String(data.id)} --subject <text>`
    );
  });
}

/** A flag and its --clear- counterpart were both passed for one field. */
function clearConflict(
  options: BroadcastsUpdateOptions,
  field: ClearableField,
  value: unknown
): CliError | null {
  return value !== undefined && options.clear?.[field]
    ? conflict(flagFor(field), flagFor(`clear-${field}`))
    : null;
}

/** Text fields: a value sets the field, a --clear- flag sends null. */
function applyTextFields(
  options: BroadcastsUpdateOptions,
  body: Json
): CliError | null {
  for (const field of TEXT_FIELDS) {
    const value = options[field];
    const conflictError = clearConflict(options, field, value);
    if (conflictError) {
      return conflictError;
    }
    if (options.clear?.[field]) {
      body[field] = null;
    } else if (value !== undefined) {
      body[field] = value;
    }
  }
  return null;
}

/** scheduledFor: an ISO 8601 time, or null to remove the schedule. */
function applySchedule(
  options: BroadcastsUpdateOptions,
  body: Json
): CliError | null {
  const conflictError = clearConflict(
    options,
    "scheduledFor",
    options.scheduledFor
  );
  if (conflictError) {
    return conflictError;
  }
  if (options.clear?.scheduledFor) {
    body.scheduledFor = null;
    return null;
  }
  if (options.scheduledFor === undefined) {
    return null;
  }
  const when = Date.parse(options.scheduledFor);
  if (Number.isNaN(when)) {
    return invalidValue(
      "--scheduled-for",
      "an ISO 8601 date-time such as 2030-01-01T09:00:00Z"
    );
  }
  body.scheduledFor = new Date(when).toISOString();
  return null;
}

/** variableMappings: a JSON array, or null to clear it. */
function applyVariableMappings(
  options: BroadcastsUpdateOptions,
  body: Json
): CliError | null {
  const conflictError = clearConflict(
    options,
    "variableMappings",
    options.variableMappings
  );
  if (conflictError) {
    return conflictError;
  }
  if (options.clear?.variableMappings) {
    body.variableMappings = null;
    return null;
  }
  if (options.variableMappings === undefined) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(options.variableMappings);
  } catch (error) {
    return invalidValue(
      "--variable-mappings",
      `a JSON array (${errorText(error)})`
    );
  }
  if (!Array.isArray(parsed)) {
    return invalidValue("--variable-mappings", "a JSON array");
  }
  body.variableMappings = parsed;
  return null;
}

/**
 * The route replaces topicId and segmentId with the values sent, so a topic or
 * segment audience must come with its own id (and not a --clear- of it).
 */
function audienceError(options: BroadcastsUpdateOptions): CliError | null {
  if (options.audienceType === undefined) {
    return null;
  }
  if (!AUDIENCE_TYPES.includes(options.audienceType)) {
    return invalidValue("--audience-type", "all, topic or segment");
  }
  const clear = options.clear ?? {};
  if (
    options.audienceType === "topic" &&
    (options.topicId === undefined || clear.topicId)
  ) {
    return {
      code: "MISSING_REQUIRED_FLAG",
      message: "--topic-id is required for a topic audience",
      suggestion:
        "Pass --topic-id <id> with --audience-type topic, or use --audience-type all.",
    };
  }
  if (
    options.audienceType === "segment" &&
    (options.segmentId === undefined || clear.segmentId)
  ) {
    return {
      code: "MISSING_REQUIRED_FLAG",
      message: "--segment-id is required for a segment audience",
      suggestion:
        "Pass --segment-id <id> with --audience-type segment, or use --audience-type all.",
    };
  }
  return null;
}

/**
 * Turn the update flags into a PATCH body. Returns the first problem found.
 * Only flags that were passed appear in the body; a `--clear-<field>` sends null.
 */
function buildUpdateBody(options: BroadcastsUpdateOptions): Outcome<Json> {
  const body: Json = {};

  if (options.channel !== undefined && !CHANNELS.includes(options.channel)) {
    return { ok: false, error: invalidValue("--channel", "email or sms") };
  }
  const error =
    applyTextFields(options, body) ??
    applySchedule(options, body) ??
    applyVariableMappings(options, body) ??
    audienceError(options);
  if (error) {
    return { ok: false, error };
  }
  if (options.channel !== undefined) {
    body.channel = options.channel;
  }
  if (options.audienceType !== undefined) {
    body.audienceType = options.audienceType;
  }

  if (Object.keys(body).length === 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message:
          "Nothing to update: pass at least one field flag, such as --name, --subject, --scheduled-for, or a --clear-<field> flag",
        suggestion:
          "Example: wraps broadcasts update <id> --subject 'New subject'. Flags match wraps broadcasts create. Check the draft first with wraps broadcasts status <id>.",
      },
    };
  }

  return { ok: true, value: body };
}

function conflict(setFlag: string, clearFlag: string): CliError {
  return {
    code: "INVALID_FLAG_USAGE",
    message: `${setFlag} and ${clearFlag} cannot be used together`,
    suggestion: `Pass ${setFlag} <value> to set the field, or ${clearFlag} to unset it, not both. Then retry.`,
  };
}

/**
 * Edit a DRAFT or SCHEDULED broadcast. Only the flags passed change. Other
 * statuses return 409 naming their status. Field flags match `broadcasts create`.
 */
export async function broadcastsUpdate(
  options: BroadcastsUpdateOptions
): Promise<void> {
  const command = "broadcasts.update";

  if (!options.id) {
    fail(command, missingId("update"));
    return;
  }

  const built = buildUpdateBody(options);
  if (!built.ok) {
    fail(command, built.error);
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const res = await callApi(target, {
    action: "update",
    method: "PATCH",
    path: `/v1/batch/${encodeURIComponent(options.id)}`,
    id: options.id,
    body: built.value,
  });
  if (!res.ok) {
    fail(command, res.error);
    return;
  }

  const r = res.value;
  const data: Json = {
    id: r.id ?? options.id,
    status: r.status ?? null,
    name: r.name ?? null,
    channel: r.channel ?? null,
    subject: r.subject ?? null,
    audienceType: r.audienceType ?? null,
    topicId: r.topicId ?? null,
    segmentId: r.segmentId ?? null,
    awsAccountId: r.awsAccountId ?? null,
    scheduledFor: r.scheduledFor ?? null,
    updatedFields: Object.keys(built.value),
  };
  succeed(command, data, () => {
    clack.log.success(`Updated draft ${String(data.id)}.`);
    clack.log.info(
      `Changed: ${(data.updatedFields as string[]).join(", ")}. Check it with: wraps broadcasts status ${String(data.id)}`
    );
  });
}
