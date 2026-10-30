/**
 * `wraps broadcasts draft`: save a new broadcast as a draft.
 *
 * Thin client over POST /v1/batch/drafts. Nothing is sent or queued. A draft
 * is sent only by `wraps broadcasts send <id> --yes`. The content (subject,
 * template or HTML, audience, sender) is set here, at draft time.
 *
 * Flag names match `wraps broadcasts create` (broadcasts.ts) so one set of
 * names works for both commands.
 *
 * Every error sets process.exitCode = 1 and is reported as a JSON envelope
 * (--json) or a clack message (human mode). Nothing in this file raises an
 * exception to the router.
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

export type BroadcastsDraftOptions = {
  name?: string;
  subject?: string;
  previewText?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  templateId?: string;
  htmlContent?: string;
  audienceType?: string;
  segmentId?: string;
  topicId?: string;
  awsAccountId?: string;
  scheduledFor?: string;
  json?: boolean;
  token?: string;
  region?: string;
};

const COMMAND = "broadcasts.draft";
const AUDIENCE_TYPES = ["all", "topic", "segment"];
const PLAN_DENIAL = /plan or higher|upgrade/i;
const TEMPLATE_NOT_FOUND = /template/i;
const SEGMENT_NOT_FOUND = /segment/i;
const TOPIC_NOT_FOUND = /topic/i;
const AWS_ACCOUNT_NOT_FOUND = /aws account/i;
const ACCOUNT_PLACEHOLDER = "<aws-account-id>";
const COUNT_PLACEHOLDER = "<n>";

/** Report a failure and set the exit code. Used by every error path. */
function fail(error: CliError): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(COMMAND, error);
    return;
  }
  clack.log.error(error.message);
  clack.log.info(error.suggestion);
}

function missingFlag(flag: string, suggestion: string): CliError {
  return {
    code: "MISSING_REQUIRED_FLAG",
    message: `${flag} is required`,
    suggestion,
  };
}

function invalidUsage(message: string, suggestion: string): CliError {
  return { code: "INVALID_FLAG_USAGE", message, suggestion };
}

/**
 * Build the route body from the flags. Validates locally first so a bad flag
 * never costs a request. Returns the first problem found.
 */
function buildBody(options: BroadcastsDraftOptions): Outcome<Json> {
  const audienceType = options.audienceType ?? "all";
  if (!AUDIENCE_TYPES.includes(audienceType)) {
    return {
      ok: false,
      error: invalidUsage(
        "--audience-type must be all, topic or segment",
        "Pass --audience-type all, --audience-type topic --topic-id <id>, or --audience-type segment --segment-id <id>, then retry."
      ),
    };
  }
  if (audienceType === "topic" && !options.topicId) {
    return {
      ok: false,
      error: missingFlag(
        "--topic-id",
        "A topic audience needs --topic-id <id>. Use --audience-type all to send to every contact."
      ),
    };
  }
  if (audienceType === "segment" && !options.segmentId) {
    return {
      ok: false,
      error: missingFlag(
        "--segment-id",
        "A segment audience needs --segment-id <id>. Use --audience-type all to send to every contact."
      ),
    };
  }
  if (audienceType === "all" && (options.topicId || options.segmentId)) {
    return {
      ok: false,
      error: invalidUsage(
        "--topic-id and --segment-id need --audience-type topic or --audience-type segment",
        "Add --audience-type topic with --topic-id <id>, or --audience-type segment with --segment-id <id>, or drop the id flag."
      ),
    };
  }

  const payload: Json = {};
  const text: [string, string | undefined][] = [
    ["name", options.name],
    ["subject", options.subject],
    ["previewText", options.previewText],
    ["from", options.from],
    ["fromName", options.fromName],
    ["replyTo", options.replyTo],
    ["templateId", options.templateId],
    ["htmlContent", options.htmlContent],
    ["awsAccountId", options.awsAccountId],
  ];
  for (const [key, value] of text) {
    if (value) {
      payload[key] = value;
    }
  }

  const recipientFilter: Json = { audienceType };
  if (options.topicId) {
    recipientFilter.topicId = options.topicId;
  }
  if (options.segmentId) {
    recipientFilter.segmentId = options.segmentId;
  }
  payload.recipientFilter = recipientFilter;

  if (options.scheduledFor !== undefined) {
    const when = Date.parse(options.scheduledFor);
    if (Number.isNaN(when)) {
      return {
        ok: false,
        error: invalidUsage(
          "--scheduled-for must be an ISO 8601 date-time such as 2030-01-01T09:00:00Z",
          "Pass --scheduled-for as an ISO 8601 date-time such as 2030-01-01T09:00:00Z, then retry."
        ),
      };
    }
    payload.scheduledFor = new Date(when).toISOString();
  }

  return { ok: true, value: payload };
}

async function resolveTarget(
  token: string | undefined
): Promise<Target | null> {
  const check = checkApiTarget(await resolveApiTarget({ token }));
  if (!check.ok) {
    fail({
      code: "NOT_AUTHENTICATED",
      message: check.reason,
      suggestion: `${check.suggestion}. You can also pass --token or set WRAPS_API_KEY.`,
    });
    return null;
  }
  return check.target;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

/** Name the flag and the list command for a 404 from the route's message. */
function notFoundSuggestion(message: string): string {
  if (TEMPLATE_NOT_FOUND.test(message)) {
    return "Pass --template-id with an email template id from this organization. List ids with wraps email templates list, then retry.";
  }
  if (SEGMENT_NOT_FOUND.test(message)) {
    return "Pass --segment-id with a segment id from this organization. List ids with wraps segments list, then retry.";
  }
  if (TOPIC_NOT_FOUND.test(message)) {
    return "Pass --topic-id with a topic id from this organization. List ids with wraps topics list, then retry.";
  }
  if (AWS_ACCOUNT_NOT_FOUND.test(message)) {
    return "Pass --aws-account-id with an AWS account row id from this organization. wraps email health lists each account with its id, then retry.";
  }
  return "A referenced id does not belong to this organization. Check the --template-id, --segment-id, --topic-id and --aws-account-id values, then retry.";
}

function mapHttpError(status: number, body: Json | null): CliError {
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
        "This key's role cannot save broadcasts. Ask an owner or admin of the organization for the broadcasts write permission, or use a key that has it (--token or WRAPS_API_KEY), then retry.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message,
      suggestion: notFoundSuggestion(message),
    };
  }
  if (status === 409) {
    return {
      code: "CONFLICT",
      message,
      suggestion:
        "The draft could not be saved in its current state. Check the flags, then retry.",
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
        "The Wraps API failed, so the draft may or may not have been saved. Check the broadcasts list in the dashboard before retrying, so you do not save a duplicate draft.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message,
      suggestion:
        "The API rejected the draft. Fix the input named in the message, then retry.",
    };
  }
  return {
    code: "REQUEST_FAILED",
    message,
    suggestion:
      "The API rejected the request. Read the message above, fix the input, then retry.",
  };
}

async function postDraft(target: Target, body: Json): Promise<Outcome<Json>> {
  let resp: Awaited<ReturnType<typeof fetch>>;
  try {
    resp = await fetch(`${target.apiBase}/v1/batch/drafts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: `Could not reach the Wraps API: ${errorText(error)}`,
        suggestion:
          "Check your network connection and WRAPS_API_URL, then retry. The draft may already have been saved: check the broadcasts list before retrying.",
      },
    };
  }

  const parsed = (await resp.json().catch(() => null)) as Json | null;
  if (!resp.ok) {
    return { ok: false, error: mapHttpError(resp.status, parsed) };
  }
  if (parsed === null || typeof parsed !== "object" || !parsed.id) {
    return {
      ok: false,
      error: {
        code: "REQUEST_FAILED",
        message: "The API returned a response without a draft id",
        suggestion:
          "Check the broadcasts list in the dashboard before retrying, so you do not save a duplicate draft.",
      },
    };
  }
  return { ok: true, value: parsed };
}

/**
 * Save a draft broadcast. Makes no send. Prints the draft id and a complete
 * send command. The send command's --aws-account-id is filled in when this
 * call passed one; --total-recipients is always a placeholder, because the
 * draft response does not carry a recipient count.
 */
export async function broadcastsDraft(
  options: BroadcastsDraftOptions
): Promise<void> {
  const built = buildBody(options);
  if (!built.ok) {
    fail(built.error);
    return;
  }

  const target = await resolveTarget(options.token);
  if (!target) {
    return;
  }
  const res = await postDraft(target, built.value);
  if (!res.ok) {
    fail(res.error);
    return;
  }

  const r = res.value;
  const id = String(r.id);
  const accountForSend = options.awsAccountId || ACCOUNT_PLACEHOLDER;
  const sendCommand = `wraps broadcasts send ${id} --yes --aws-account-id ${accountForSend} --total-recipients ${COUNT_PLACEHOLDER}`;
  const data: Json = {
    id,
    status: typeof r.status === "string" ? r.status : "draft",
    name: typeof r.name === "string" ? r.name : null,
    channel: typeof r.channel === "string" ? r.channel : "email",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : null,
    sendCommand,
    sendRequires: ["--aws-account-id", "--total-recipients"],
  };
  if (isJsonMode()) {
    jsonSuccess(COMMAND, data);
    return;
  }
  clack.log.success(`Draft ${id} saved. Nothing was sent.`);
  clack.log.info(
    "The content was set when the draft was created. To change it, create another draft."
  );
  clack.log.info(`Send it with: ${sendCommand}`);
  if (accountForSend === ACCOUNT_PLACEHOLDER) {
    clack.log.info(
      "Replace <aws-account-id> with an AWS account row id (wraps email health lists each id) and <n> with the recipient count from wraps broadcasts status <id>."
    );
  } else {
    clack.log.info(
      "Replace <n> with the recipient count from wraps broadcasts status <id>."
    );
  }
}
