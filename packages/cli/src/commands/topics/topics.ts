/**
 * `wraps topics` — subscription topics over the /v1/topics API.
 *
 * Pattern: commands/segments/segments.ts. Every error goes through emitError(),
 * which writes the JSON envelope (or a clack message in human mode) and sets
 * process.exitCode = 1. Missing ids, flags and bad values are reported before
 * any request is made.
 *
 * Plan: topics are a Pro-plan feature. A 403 whose message names a required
 * plan maps to PLAN_REQUIRED with an upgrade suggestion; any other 403 is
 * FORBIDDEN.
 *
 * Pagination, list (`topics list`): the route returns every topic in one
 * response and has no paging of its own. The CLI pages the full list itself:
 * --limit (1-100, default 20) is the page size and --cursor is a decimal offset
 * into the list (default 0). nextCursor is String(offset + limit) while that is
 * below the total, and null on the last page.
 *
 * Pagination, subscribers (`topics subscribers`): the route is page-based
 * (page, pageSize). --cursor is the page number as a string ("2" = page 2,
 * starting at 1), --limit maps to pageSize (1-100, default 50), and the route
 * is always sent both. nextCursor is String(page + 1) while page * pageSize is
 * below the total, and null on the last page.
 *
 * Delete is destructive: it needs --yes, and --dry-run previews with no request.
 * The route also requires confirm=true in the query string, which the CLI sends
 * only after --yes.
 */

import { log, note } from "@clack/prompts";
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

type TopicsCommonOptions = {
  token?: string;
  json?: boolean;
  region?: string;
};

type TopicsListOptions = TopicsCommonOptions & {
  limit?: string;
  cursor?: string;
};

type TopicsGetOptions = TopicsCommonOptions & {
  id?: string;
};

type TopicsCreateOptions = TopicsCommonOptions & {
  name?: string;
  description?: string;
  slug?: string;
  public?: string;
  doubleOptIn?: string;
};

type TopicsUpdateOptions = TopicsCommonOptions & {
  id?: string;
  name?: string;
  description?: string;
  slug?: string;
  public?: string;
  doubleOptIn?: string;
};

type TopicsDeleteOptions = TopicsCommonOptions & {
  id?: string;
  yes?: boolean;
  dryRun?: boolean;
};

type TopicsSubscribersOptions = TopicsCommonOptions & {
  id?: string;
  status?: string;
  limit?: string;
  cursor?: string;
};

type ErrorSpec = {
  code: string;
  message: string;
  suggestion: string;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: ErrorSpec };

type Target = { apiBase: string; token: string };

type ApiOutcome = { ok: true; body: Record<string, unknown> } | { ok: false };

type TopicSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  public: boolean;
  doubleOptIn: boolean;
  subscriberCount: number;
  sendableCount: number;
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string } | null;
};

type SubscriberRow = {
  contactId: string;
  email: string;
  status: string;
  subscribedAt: string | null;
  unsubscribedAt: string | null;
};

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_SUBSCRIBER_PAGE_SIZE = 50;
const MAX_CURSOR = 1_000_000;
const DIGITS_ONLY = /^\d+$/;
const PLAN_DENIAL = /requires .+ plan/i;
const SUBSCRIBER_STATUSES = ["subscribed", "pending", "unsubscribed"];

function emitError(command: string, error: ErrorSpec): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(command, error);
    return;
  }
  log.error(error.message);
  log.info(error.suggestion);
}

function missingInput(what: string, usage: string): ErrorSpec {
  return {
    code: "MISSING_REQUIRED_FLAG",
    message: `Missing ${what}`,
    suggestion: `Usage: ${usage}`,
  };
}

function parseBoundedInt(
  raw: string,
  flag: string,
  min: number,
  max: number
): Parsed<number> {
  const value = Number(raw);
  if (
    !(DIGITS_ONLY.test(raw) && Number.isSafeInteger(value)) ||
    value < min ||
    value > max
  ) {
    return invalidValue(
      `--${flag} must be a whole number from ${min} to ${max}, got "${raw}"`,
      `Pass --${flag} with a whole number from ${min} to ${max}.`
    );
  }
  return { ok: true, value };
}

function parseCursor(raw: string | undefined, minimum: number): Parsed<number> {
  if (raw === undefined) {
    return { ok: true, value: minimum };
  }
  const value = Number(raw);
  if (
    !(
      DIGITS_ONLY.test(raw) &&
      Number.isSafeInteger(value) &&
      value >= minimum &&
      value <= MAX_CURSOR
    )
  ) {
    return invalidValue(
      `--cursor "${raw}" is not a valid cursor`,
      "Pass the nextCursor value from the previous page unchanged, or omit --cursor for the first page."
    );
  }
  return { ok: true, value };
}

function parseBoolean(
  raw: string | undefined,
  flag: string
): Parsed<boolean | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (raw === "true") {
    return { ok: true, value: true };
  }
  if (raw === "false") {
    return { ok: true, value: false };
  }
  return invalidValue(
    `--${flag} must be "true" or "false", got "${raw}"`,
    `Pass --${flag} true or --${flag} false.`
  );
}

function parseSubscriberStatus(
  raw: string | undefined
): Parsed<string | undefined> {
  if (raw === undefined || SUBSCRIBER_STATUSES.includes(raw)) {
    return { ok: true, value: raw };
  }
  return invalidValue(
    `--status must be one of ${SUBSCRIBER_STATUSES.join(", ")}, got "${raw}"`,
    `Pass --status with one of ${SUBSCRIBER_STATUSES.join(", ")}.`
  );
}

function invalidValue(
  message: string,
  suggestion: string
): { ok: false; error: ErrorSpec } {
  return {
    ok: false,
    error: { code: "INVALID_FLAG_VALUE", message, suggestion },
  };
}

function apiErrorSpec(status: number, text: string): ErrorSpec {
  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message: text,
      suggestion:
        "Run: wraps auth login, or pass --token <api-key> / set WRAPS_API_KEY.",
    };
  }
  if (status === 403 && PLAN_DENIAL.test(text)) {
    return {
      code: "PLAN_REQUIRED",
      message: text,
      suggestion:
        "Topics need the Pro plan or higher. Upgrade the organization's plan at https://wraps.dev/upgrade, then retry.",
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: text,
      suggestion:
        "Your role or this API key's scopes do not allow this. A signed-in session (wraps auth login) is checked against your role; an API key is checked against its own scopes. Ask an owner or admin for topics access, or use a key with the topics:read or topics:write scope it needs, then retry.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: text,
      suggestion: "Check the topic id. List topics with: wraps topics list",
    };
  }
  if (status === 409) {
    return {
      code: "CONFLICT",
      message: text,
      suggestion:
        "A topic with this slug already exists. Pass a different --slug and retry, or list topics with: wraps topics list",
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message: text,
      suggestion: "Too many requests. Wait a minute, then retry.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message: text,
      suggestion:
        "Fix the values named in the message and retry. Run a command with --help to see the accepted flags.",
    };
  }
  return {
    code: "API_ERROR",
    message: text,
    suggestion: `The Wraps API returned HTTP ${status}. Retry shortly. If it keeps failing, include this message in your report.`,
  };
}

// Read `message` before `error`: some bodies carry the human text in `message`.
function errorText(body: Record<string, unknown>, status: number): string {
  if (typeof body.message === "string" && body.message.length > 0) {
    return body.message;
  }
  if (typeof body.error === "string" && body.error.length > 0) {
    return body.error;
  }
  return `HTTP ${status}`;
}

async function resolveTarget(
  command: string,
  token: string | undefined
): Promise<Target | null> {
  const check = checkApiTarget(await resolveApiTarget({ token }));
  if (!check.ok) {
    emitError(command, {
      code: "NOT_AUTHENTICATED",
      message: `${check.reason}.`,
      suggestion: check.suggestion,
    });
    return null;
  }
  return { apiBase: check.target.apiBase, token: check.target.token };
}

type ApiRequest = {
  command: string;
  target: Target;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
};

async function callApi(request: ApiRequest): Promise<ApiOutcome> {
  const { command, target, method, path, body } = request;
  let resp: Response;
  try {
    resp = await fetch(`${target.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${target.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    emitError(command, {
      code: "NETWORK_ERROR",
      message: `Could not reach the Wraps API (${error instanceof Error ? error.message : "unknown error"}).`,
      suggestion:
        "Check your network connection and WRAPS_API_URL, then retry.",
    });
    return { ok: false };
  }

  if (!resp.ok) {
    const parsedError: unknown = await resp.json().catch(() => null);
    const errBody =
      parsedError !== null && typeof parsedError === "object"
        ? (parsedError as Record<string, unknown>)
        : {};
    emitError(
      command,
      apiErrorSpec(resp.status, errorText(errBody, resp.status))
    );
    return { ok: false };
  }

  const parsed: unknown = await resp.json().catch(() => null);
  if (parsed === null || typeof parsed !== "object") {
    emitError(command, {
      code: "API_ERROR",
      message: "The Wraps API returned a response that could not be read.",
      suggestion:
        "Retry shortly. If it keeps failing, include the command you ran in your report.",
    });
    return { ok: false };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

// Fixed output shapes. Explicit field lists keep the JSON keys stable even if
// the route later adds fields.
function topicJson(topic: TopicSummary): Record<string, unknown> {
  return {
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    description: topic.description,
    public: topic.public,
    doubleOptIn: topic.doubleOptIn,
    subscriberCount: topic.subscriberCount,
    sendableCount: topic.sendableCount,
    pendingCount: topic.pendingCount,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    createdBy: topic.createdBy,
  };
}

function subscriberJson(row: SubscriberRow): Record<string, unknown> {
  return {
    contactId: row.contactId,
    email: row.email,
    status: row.status,
    subscribedAt: row.subscribedAt,
    unsubscribedAt: row.unsubscribedAt,
  };
}

function kv(label: string, value: string): string {
  return `${pc.dim(label.padEnd(16))} ${value}`;
}

function printTopic(topic: TopicSummary): void {
  note(
    [
      kv("ID:", topic.id),
      kv("Name:", topic.name),
      kv("Slug:", topic.slug),
      kv("Description:", topic.description ?? pc.dim("—")),
      kv("Public:", topic.public ? "yes" : "no"),
      kv("Double opt-in:", topic.doubleOptIn ? "yes" : "no"),
      kv("Subscribers:", String(topic.subscriberCount)),
      kv("Sendable:", String(topic.sendableCount)),
      kv("Pending:", String(topic.pendingCount)),
    ].join("\n"),
    `Topic — ${topic.name}`
  );
}

export async function topicsList(options: TopicsListOptions): Promise<void> {
  const command = "topics.list";

  const limitParsed: Parsed<number> =
    options.limit === undefined
      ? { ok: true, value: DEFAULT_LIST_LIMIT }
      : parseBoundedInt(options.limit, "limit", 1, 100);
  if (!limitParsed.ok) {
    emitError(command, limitParsed.error);
    return;
  }
  const cursorParsed = parseCursor(options.cursor, 0);
  if (!cursorParsed.ok) {
    emitError(command, cursorParsed.error);
    return;
  }
  const limit = limitParsed.value;
  const offset = cursorParsed.value;

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }

  // The route has no paging: it returns the whole list. Page it here.
  const outcome = await callApi({
    command,
    target,
    method: "GET",
    path: "/v1/topics",
  });
  if (!outcome.ok) {
    return;
  }

  const all = (outcome.body.topics ?? []) as TopicSummary[];
  const total = all.length;
  const items = all.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const nextCursor = nextOffset < total ? String(nextOffset) : null;

  const data = {
    topics: items.map(topicJson),
    total,
    limit,
    offset,
    nextCursor,
  };

  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }

  if (items.length === 0) {
    log.info("No topics found.");
    return;
  }

  const rows = items.map(
    (topic) =>
      `${topic.id}  ${topic.name}  ${pc.dim(`${topic.subscriberCount} subscribers`)}`
  );
  note(rows.join("\n"), `Topics — ${total} total`);
  if (nextCursor !== null) {
    const limitPart = options.limit === undefined ? "" : ` --limit ${limit}`;
    log.info(
      `More topics available. Use: ${pc.cyan(`wraps topics list${limitPart} --cursor ${nextCursor}`)}`
    );
  }
}

export async function topicsGet(options: TopicsGetOptions): Promise<void> {
  const command = "topics.get";
  if (!options.id) {
    emitError(command, missingInput("topic id", "wraps topics get <topic-id>"));
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const outcome = await callApi({
    command,
    target,
    method: "GET",
    path: `/v1/topics/${encodeURIComponent(options.id)}`,
  });
  if (!outcome.ok) {
    return;
  }

  const topic = outcome.body as unknown as TopicSummary;
  if (isJsonMode()) {
    jsonSuccess(command, topicJson(topic));
    return;
  }
  printTopic(topic);
}

export async function topicsCreate(
  options: TopicsCreateOptions
): Promise<void> {
  const command = "topics.create";
  const usage =
    "wraps topics create --name <name> [--description <text>] [--slug <slug>] [--public true|false] [--double-opt-in true|false]";
  if (!options.name) {
    emitError(command, missingInput("--name", usage));
    return;
  }

  const body: Record<string, unknown> = { name: options.name };
  if (options.description !== undefined) {
    body.description = options.description;
  }
  if (options.slug !== undefined) {
    body.slug = options.slug;
  }
  const publicParsed = parseBoolean(options.public, "public");
  if (!publicParsed.ok) {
    emitError(command, publicParsed.error);
    return;
  }
  if (publicParsed.value !== undefined) {
    body.public = publicParsed.value;
  }
  const optInParsed = parseBoolean(options.doubleOptIn, "double-opt-in");
  if (!optInParsed.ok) {
    emitError(command, optInParsed.error);
    return;
  }
  if (optInParsed.value !== undefined) {
    body.doubleOptIn = optInParsed.value;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const outcome = await callApi({
    command,
    target,
    method: "POST",
    path: "/v1/topics",
    body,
  });
  if (!outcome.ok) {
    return;
  }

  const topic = outcome.body as unknown as TopicSummary;
  if (isJsonMode()) {
    jsonSuccess(command, topicJson(topic));
    return;
  }
  log.success(`Created topic ${topic.name} (${topic.id})`);
  printTopic(topic);
}

export async function topicsUpdate(
  options: TopicsUpdateOptions
): Promise<void> {
  const command = "topics.update";
  const usage =
    "wraps topics update <topic-id> [--name <name>] [--description <text>] [--slug <slug>] [--public true|false] [--double-opt-in true|false]";
  if (!options.id) {
    emitError(command, missingInput("topic id", usage));
    return;
  }

  const body: Record<string, unknown> = {};
  if (options.name !== undefined) {
    body.name = options.name;
  }
  if (options.description !== undefined) {
    body.description = options.description;
  }
  if (options.slug !== undefined) {
    body.slug = options.slug;
  }
  const publicParsed = parseBoolean(options.public, "public");
  if (!publicParsed.ok) {
    emitError(command, publicParsed.error);
    return;
  }
  if (publicParsed.value !== undefined) {
    body.public = publicParsed.value;
  }
  const optInParsed = parseBoolean(options.doubleOptIn, "double-opt-in");
  if (!optInParsed.ok) {
    emitError(command, optInParsed.error);
    return;
  }
  if (optInParsed.value !== undefined) {
    body.doubleOptIn = optInParsed.value;
  }
  if (Object.keys(body).length === 0) {
    emitError(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Nothing to update",
      suggestion:
        "Pass at least one of --name, --description, --slug, --public, --double-opt-in.",
    });
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const outcome = await callApi({
    command,
    target,
    method: "PATCH",
    path: `/v1/topics/${encodeURIComponent(options.id)}`,
    body,
  });
  if (!outcome.ok) {
    return;
  }

  const topic = outcome.body as unknown as TopicSummary;
  if (isJsonMode()) {
    jsonSuccess(command, topicJson(topic));
    return;
  }
  log.success(`Updated topic ${topic.name} (${topic.id})`);
  printTopic(topic);
}

export async function topicsDelete(
  options: TopicsDeleteOptions
): Promise<void> {
  const command = "topics.delete";
  if (!options.id) {
    emitError(
      command,
      missingInput("topic id", "wraps topics delete <topic-id> --yes")
    );
    return;
  }

  // --dry-run makes no request, so it needs no credentials and no --yes.
  if (options.dryRun) {
    const data = { id: options.id, deleted: false, dryRun: true };
    if (isJsonMode()) {
      jsonSuccess(command, data);
      return;
    }
    log.info(
      `Dry run: topic ${options.id} would be deleted with every subscription to it. No request was sent.`
    );
    return;
  }

  if (!options.yes) {
    emitError(command, {
      code: "CONFIRMATION_REQUIRED",
      message:
        "Deleting a topic also removes every subscription to it. Nothing was deleted because --yes was not passed.",
      suggestion: `Re-run with --yes to confirm: wraps topics delete ${options.id} --yes`,
    });
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const outcome = await callApi({
    command,
    target,
    method: "DELETE",
    path: `/v1/topics/${encodeURIComponent(options.id)}?confirm=true`,
  });
  if (!outcome.ok) {
    return;
  }

  const data = { id: options.id, deleted: true, dryRun: false };
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }
  log.success(`Deleted topic ${options.id}`);
}

function parseSubscriberFlags(
  options: TopicsSubscribersOptions
): Parsed<{ pageSize: number; page: number; status: string | undefined }> {
  const pageSize =
    options.limit === undefined
      ? { ok: true as const, value: DEFAULT_SUBSCRIBER_PAGE_SIZE }
      : parseBoundedInt(options.limit, "limit", 1, 100);
  if (!pageSize.ok) {
    return pageSize;
  }
  const page = parseCursor(options.cursor, 1);
  if (!page.ok) {
    return page;
  }
  const status = parseSubscriberStatus(options.status);
  if (!status.ok) {
    return status;
  }
  return {
    ok: true,
    value: {
      pageSize: pageSize.value,
      page: page.value,
      status: status.value,
    },
  };
}

export async function topicsSubscribers(
  options: TopicsSubscribersOptions
): Promise<void> {
  const command = "topics.subscribers";
  const usage =
    "wraps topics subscribers <topic-id> [--status subscribed|pending|unsubscribed] [--limit <1-100>] [--cursor <page>]";
  if (!options.id) {
    emitError(command, missingInput("topic id", usage));
    return;
  }

  const parsed = parseSubscriberFlags(options);
  if (!parsed.ok) {
    emitError(command, parsed.error);
    return;
  }
  const { pageSize, page, status } = parsed.value;

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }

  // page and pageSize are always sent so the request URL is deterministic.
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (status !== undefined) {
    params.set("status", status);
  }
  const outcome = await callApi({
    command,
    target,
    method: "GET",
    path: `/v1/topics/${encodeURIComponent(options.id)}/subscribers?${params}`,
  });
  if (!outcome.ok) {
    return;
  }

  const items = (outcome.body.subscribers ?? []) as SubscriberRow[];
  const total = typeof outcome.body.total === "number" ? outcome.body.total : 0;
  const nextCursor = page * pageSize < total ? String(page + 1) : null;

  const data = {
    topicId: options.id,
    subscribers: items.map(subscriberJson),
    total,
    page,
    pageSize,
    nextCursor,
  };

  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }

  if (items.length === 0) {
    log.info("No subscribers found.");
    return;
  }

  const rows = items.map((row) => `${row.email}  ${pc.dim(row.status)}`);
  note(rows.join("\n"), `Subscribers — ${total} total`);
  if (nextCursor !== null) {
    const statusPart = status === undefined ? "" : ` --status ${status}`;
    const limitPart = options.limit === undefined ? "" : ` --limit ${pageSize}`;
    log.info(
      `More subscribers available. Use: ${pc.cyan(`wraps topics subscribers ${options.id}${statusPart}${limitPart} --cursor ${nextCursor}`)}`
    );
  }
}
