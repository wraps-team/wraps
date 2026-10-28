/**
 * Workflow read commands: `wraps workflows list|get|executions|execution`.
 *
 * Calls the read routes from T2.6a (apps/api/src/(ee)/routes/workflows-read.ts):
 *   list       GET /v1/workflows                                  (--limit, --cursor, --search, --status)
 *   get        GET /v1/workflows/:workflowId
 *   executions GET /v1/workflows/:workflowId/executions           (--limit, --cursor, --status)
 *   execution  GET /v1/workflows/executions/:executionId          (step trace)
 *
 * Read-only: no --yes and no --dry-run.
 *
 * Pagination (list and executions): the routes are page-based (page, pageSize
 * 1..100, default 50). --cursor is the page number as a string ("2" = page 2),
 * and --limit maps to pageSize. nextCursor is String(page + 1) while
 * page < totalPages, computed from the route's total and pageSize, and null on
 * the last page. Both flags are validated locally before any request.
 *
 * Failure signalling: every error path prints one error envelope (or a clack
 * error in human mode), sets process.exitCode = 1, and returns. Nothing here
 * raises an exception to the dispatcher.
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

type CommonOptions = {
  token?: string;
  json?: boolean;
  region?: string;
};

/** Flags arrive as strings from the parser, but a bare number is also accepted. */
type RawFlag = string | number | undefined;

export type WorkflowsListOptions = CommonOptions & {
  limit?: RawFlag;
  cursor?: RawFlag;
  search?: RawFlag;
  status?: RawFlag;
};

export type WorkflowsGetOptions = CommonOptions & {
  workflowId?: string;
};

export type WorkflowsExecutionsOptions = CommonOptions & {
  workflowId?: string;
  limit?: RawFlag;
  cursor?: RawFlag;
  status?: RawFlag;
};

export type WorkflowsExecutionOptions = CommonOptions & {
  executionId?: string;
};

type Body = Record<string, unknown>;
type Failure = { code: string; message: string; suggestion: string };
type Parsed<T> = { ok: true; value: T } | { ok: false; failure: Failure };
type Target = { apiBase: string; token: string };
type ApiResult = { ok: true; body: Body } | { ok: false; failure: Failure };

const CMD = {
  list: "workflows.list",
  get: "workflows.get",
  executions: "workflows.executions",
  execution: "workflows.execution",
} as const;

const WORKFLOW_STATUSES = ["draft", "enabled", "paused", "archived"] as const;
const EXECUTION_STATUSES = [
  "pending",
  "active",
  "paused",
  "waiting",
  "completed",
  "failed",
  "cancelled",
] as const;

const SEARCH_MAX_LENGTH = 255;
const DIGITS_ONLY = /^\d+$/;
const PLAN_DENIAL = /requires .+ plan/i;
const SAFE_SHELL_WORD = /^[A-Za-z0-9_.-]+$/;

const WORKFLOW_KEYS = [
  "id",
  "name",
  "description",
  "status",
  "triggerType",
  "version",
  "totalExecutions",
  "activeExecutions",
  "completedExecutions",
  "failedExecutions",
  "createdBy",
  "createdAt",
  "updatedAt",
] as const;

const EXECUTION_KEYS = [
  "id",
  "workflowId",
  "contactId",
  "status",
  "currentStepId",
  "startedAt",
  "completedAt",
  "createdAt",
  "updatedAt",
] as const;

const STEP_KEYS = [
  "id",
  "executionId",
  "stepId",
  "stepType",
  "status",
  "createdAt",
] as const;

const HINT_WORKFLOW_NOT_FOUND =
  "Check the workflow ID belongs to this organization. List workflows with: wraps workflows list";
const HINT_EXECUTION_NOT_FOUND =
  "Check the execution ID belongs to this organization. Find a workflow's executions with: wraps workflows list, then wraps workflows executions <workflow-id>";

function fail(command: string, failure: Failure): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(command, {
      code: failure.code,
      message: failure.message,
      suggestion: failure.suggestion,
    });
    return;
  }
  log.error(failure.message);
  log.info(failure.suggestion);
}

function missingFailure(what: string, usage: string): Failure {
  return {
    code: "MISSING_REQUIRED_FLAG",
    message: `Missing ${what}.`,
    suggestion: `Usage: ${usage}`,
  };
}

function invalid(flag: string, raw: string, suggestion: string): Failure {
  return {
    code: "INVALID_FLAG_VALUE",
    message: `--${flag} "${raw}" is not valid`,
    suggestion,
  };
}

function parseLimit(raw: RawFlag): Parsed<number | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  const text = String(raw);
  const value = Number(text);
  if (!(DIGITS_ONLY.test(text) && value >= 1 && value <= 100)) {
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: `--limit must be a whole number from 1 to 100, got "${text}"`,
        suggestion:
          "Pass --limit with a whole number from 1 to 100, for example wraps workflows list --limit 20, or omit it.",
      },
    };
  }
  return { ok: true, value };
}

type Paging = { limit: number | undefined; page: number };

/** --limit and --cursor together, validated in one place before any request. */
function parsePaging(
  options: { limit?: RawFlag; cursor?: RawFlag },
  example: string
): Parsed<Paging> {
  const limit = parseLimit(options.limit);
  if (!limit.ok) {
    return limit;
  }
  const page = parseCursor(options.cursor, example);
  if (!page.ok) {
    return page;
  }
  return { ok: true, value: { limit: limit.value, page: page.value } };
}

function parseCursor(raw: RawFlag, example: string): Parsed<number> {
  if (raw === undefined) {
    return { ok: true, value: 1 };
  }
  const text = String(raw);
  const value = Number(text);
  if (!(DIGITS_ONLY.test(text) && value >= 1 && Number.isSafeInteger(value))) {
    return {
      ok: false,
      failure: invalid(
        "cursor",
        text,
        `Pass --cursor with the nextCursor value from the previous page, for example ${example} --cursor 2, or omit --cursor for the first page.`
      ),
    };
  }
  return { ok: true, value };
}

function parseEnum<T extends string>(
  flag: string,
  raw: RawFlag,
  values: readonly T[],
  example: string
): Parsed<T | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  const text = String(raw);
  const match = values.find((v) => v === text);
  if (match === undefined) {
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: `--${flag} "${text}" is not one of: ${values.join(", ")}`,
        suggestion: `Pass --${flag} with one of: ${values.join(", ")}, for example ${example} --${flag} ${values[0]}.`,
      },
    };
  }
  return { ok: true, value: match };
}

function parseSearch(
  raw: RawFlag,
  example: string
): Parsed<string | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  const text = String(raw).trim();
  if (text.length === 0) {
    return { ok: true, value: undefined };
  }
  if (text.length > SEARCH_MAX_LENGTH) {
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: `--search is longer than ${SEARCH_MAX_LENGTH} characters`,
        suggestion: `Pass --search with at most ${SEARCH_MAX_LENGTH} characters, for example ${example} --search welcome.`,
      },
    };
  }
  return { ok: true, value: text };
}

async function resolveTarget(
  token: string | undefined
): Promise<Parsed<Target>> {
  const check = checkApiTarget(await resolveApiTarget({ token }));
  if (!check.ok) {
    return {
      ok: false,
      failure: {
        code: "NOT_AUTHENTICATED",
        message: check.reason,
        suggestion: check.suggestion,
      },
    };
  }
  return {
    ok: true,
    value: { apiBase: check.target.apiBase, token: check.target.token },
  };
}

async function connect(
  command: string,
  token?: string
): Promise<Target | null> {
  const resolved = await resolveTarget(token);
  if (!resolved.ok) {
    fail(command, resolved.failure);
    return null;
  }
  return resolved.value;
}

function errorText(body: Body, status: number): string {
  if (typeof body.message === "string" && body.message.length > 0) {
    return body.message;
  }
  if (typeof body.error === "string" && body.error.length > 0) {
    return body.error;
  }
  return `Wraps API returned HTTP ${status}`;
}

/** Map an HTTP status from the workflow read routes to a CLI failure. */
function httpFailure(
  status: number,
  body: Body,
  notFoundHint: string,
  validationHint: string
): Failure {
  const message = errorText(body, status);
  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message,
      suggestion:
        "Run: wraps auth login, or pass --token <api-key> / set WRAPS_API_KEY.",
    };
  }
  if (status === 403 && PLAN_DENIAL.test(message)) {
    return {
      code: "PLAN_REQUIRED",
      message,
      suggestion:
        "Workflows need a plan that includes them. Upgrade the organization's plan in the Wraps dashboard, then retry.",
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message,
      suggestion:
        "Sign in with an account that can read workflows in this organization: wraps auth login.",
    };
  }
  if (status === 404) {
    return { code: "NOT_FOUND", message, suggestion: notFoundHint };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message,
      suggestion: "Too many requests. Wait a minute, then retry.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message,
      suggestion: validationHint,
    };
  }
  return {
    code: "API_ERROR",
    message,
    suggestion: `The Wraps API returned HTTP ${status}. Retry shortly. If it keeps failing, include this message in your report.`,
  };
}

async function getJson(
  target: Target,
  path: string,
  hints: { notFound: string; validation: string },
  query?: URLSearchParams
): Promise<ApiResult> {
  const qs = query?.toString();
  const url = `${target.apiBase}${path}${qs ? `?${qs}` : ""}`;

  let resp: Awaited<ReturnType<typeof fetch>>;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${target.token}` },
    });
  } catch (err) {
    return {
      ok: false,
      failure: {
        code: "NETWORK_ERROR",
        message: `Could not reach the Wraps API (${err instanceof Error ? err.message : String(err)})`,
        suggestion:
          "Check your network connection and WRAPS_API_URL, then retry, for example: wraps workflows list.",
      },
    };
  }

  const parsed: unknown = await resp.json().catch(() => null);
  const body: Body =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Body)
      : {};

  if (!resp.ok) {
    return {
      ok: false,
      failure: httpFailure(resp.status, body, hints.notFound, hints.validation),
    };
  }
  return { ok: true, body };
}

function pick(row: Body, keys: readonly string[]): Body {
  const out: Body = {};
  for (const key of keys) {
    out[key] = row[key] === undefined ? null : row[key];
  }
  return out;
}

function workflowData(row: Body): Body {
  return pick(row, WORKFLOW_KEYS);
}

function executionData(row: Body): Body {
  return {
    ...pick(row, EXECUTION_KEYS),
    contact: row.contact ?? null,
  };
}

/** Page fields from the route's total and echoed pageSize. nextCursor is the next page number. */
type PageInfo = {
  total: number | null;
  page: number;
  pageSize: number | null;
  totalPages: number;
  nextCursor: string | null;
};

function pageInfo(body: Body, currentPage: number): PageInfo {
  const total = typeof body.total === "number" ? body.total : null;
  const pageSize = typeof body.pageSize === "number" ? body.pageSize : null;
  const totalPages =
    total !== null && pageSize !== null && pageSize > 0
      ? Math.ceil(total / pageSize)
      : 0;
  return {
    total,
    page: currentPage,
    pageSize,
    totalPages,
    nextCursor: currentPage < totalPages ? String(currentPage + 1) : null,
  };
}

function shellWord(value: string): string {
  return SAFE_SHELL_WORD.test(value)
    ? value
    : `'${value.replace(/'/g, "'\\''")}'`;
}

/** The exact command that fetches the next page, keeping the same filters. */
function nextPageCommand(
  base: string,
  nextCursor: string,
  filters: [string, RawFlag][]
): string {
  const parts = [base];
  for (const [flag, value] of filters) {
    if (value !== undefined && String(value).length > 0) {
      parts.push(`--${flag} ${shellWord(String(value))}`);
    }
  }
  parts.push(`--cursor ${nextCursor}`);
  return parts.join(" ");
}

function kv(label: string, value: unknown): string {
  const text =
    value === null || value === undefined || value === ""
      ? pc.dim("—")
      : String(value);
  return `${pc.dim(label.padEnd(16))} ${text}`;
}

export async function workflowsList(
  options: WorkflowsListOptions
): Promise<void> {
  const example = "wraps workflows list";
  const paging = parsePaging(options, example);
  if (!paging.ok) {
    fail(CMD.list, paging.failure);
    return;
  }
  const { limit, page } = paging.value;
  const status = parseEnum(
    "status",
    options.status,
    WORKFLOW_STATUSES,
    example
  );
  if (!status.ok) {
    fail(CMD.list, status.failure);
    return;
  }
  const search = parseSearch(options.search, example);
  if (!search.ok) {
    fail(CMD.list, search.failure);
    return;
  }

  const target = await connect(CMD.list, options.token);
  if (!target) {
    return;
  }

  const query = new URLSearchParams({ page: String(page) });
  if (limit !== undefined) {
    query.set("pageSize", String(limit));
  }
  if (search.value !== undefined) {
    query.set("search", search.value);
  }
  if (status.value !== undefined) {
    query.set("status", status.value);
  }

  const result = await getJson(
    target,
    "/v1/workflows",
    {
      notFound: HINT_WORKFLOW_NOT_FOUND,
      validation: `Check --status (one of ${WORKFLOW_STATUSES.join(", ")}), --search (at most ${SEARCH_MAX_LENGTH} characters), --limit (1 to 100) and --cursor (a nextCursor value), then retry, for example: wraps workflows list --status enabled --limit 20.`,
    },
    query
  );
  if (!result.ok) {
    fail(CMD.list, result.failure);
    return;
  }

  const rows = Array.isArray(result.body.workflows)
    ? (result.body.workflows as Body[])
    : [];
  const info = pageInfo(result.body, page);
  const data = {
    workflows: rows.map(workflowData),
    ...info,
  };

  if (isJsonMode()) {
    jsonSuccess(CMD.list, data);
    return;
  }

  if (rows.length === 0) {
    log.info("No workflows found.");
  } else {
    const lines = rows.map((row) => {
      const id = pc.dim(String(row.id));
      const name = String(row.name ?? "—").padEnd(28);
      return `${id}  ${name}  ${String(row.status ?? "—")}`;
    });
    note(
      lines.join("\n"),
      data.total === null ? "Workflows" : `Workflows — ${data.total} total`
    );
  }
  if (data.nextCursor) {
    log.info(
      `More workflows available. Next page: ${pc.cyan(
        nextPageCommand(example, data.nextCursor, [
          ["limit", limit],
          ["search", search.value],
          ["status", status.value],
        ])
      )}`
    );
  }
}

export async function workflowsGet(
  options: WorkflowsGetOptions
): Promise<void> {
  if (!options.workflowId) {
    fail(
      CMD.get,
      missingFailure("workflow ID", "wraps workflows get <workflow-id>")
    );
    return;
  }
  const target = await connect(CMD.get, options.token);
  if (!target) {
    return;
  }

  const result = await getJson(
    target,
    `/v1/workflows/${encodeURIComponent(options.workflowId)}`,
    {
      notFound: HINT_WORKFLOW_NOT_FOUND,
      validation:
        "Workflow IDs are at most 64 characters. Copy one from: wraps workflows list.",
    }
  );
  if (!result.ok) {
    fail(CMD.get, result.failure);
    return;
  }

  const data = workflowData(result.body);
  if (isJsonMode()) {
    jsonSuccess(CMD.get, data);
    return;
  }

  note(
    [
      kv("ID", data.id),
      kv("Name", data.name),
      kv("Description", data.description),
      kv("Status", data.status),
      kv("Trigger", data.triggerType),
      kv("Version", data.version),
      kv("Executions", data.totalExecutions),
      kv("Active", data.activeExecutions),
      kv("Completed", data.completedExecutions),
      kv("Failed", data.failedExecutions),
      kv("Updated", data.updatedAt),
    ].join("\n"),
    `Workflow ${String(data.name ?? data.id)}`
  );
}

export async function workflowsExecutions(
  options: WorkflowsExecutionsOptions
): Promise<void> {
  const example = `wraps workflows executions ${options.workflowId ? shellWord(options.workflowId) : "<workflow-id>"}`;
  if (!options.workflowId) {
    fail(
      CMD.executions,
      missingFailure("workflow ID", "wraps workflows executions <workflow-id>")
    );
    return;
  }
  const paging = parsePaging(options, example);
  if (!paging.ok) {
    fail(CMD.executions, paging.failure);
    return;
  }
  const { limit, page } = paging.value;
  const status = parseEnum(
    "status",
    options.status,
    EXECUTION_STATUSES,
    example
  );
  if (!status.ok) {
    fail(CMD.executions, status.failure);
    return;
  }

  const target = await connect(CMD.executions, options.token);
  if (!target) {
    return;
  }

  const query = new URLSearchParams({ page: String(page) });
  if (limit !== undefined) {
    query.set("pageSize", String(limit));
  }
  if (status.value !== undefined) {
    query.set("status", status.value);
  }

  const result = await getJson(
    target,
    `/v1/workflows/${encodeURIComponent(options.workflowId)}/executions`,
    {
      notFound: HINT_WORKFLOW_NOT_FOUND,
      validation: `Check --status (one of ${EXECUTION_STATUSES.join(", ")}), --limit (1 to 100) and --cursor (a nextCursor value), then retry, for example: wraps workflows executions <workflow-id> --status failed --limit 20.`,
    },
    query
  );
  if (!result.ok) {
    fail(CMD.executions, result.failure);
    return;
  }

  const rows = Array.isArray(result.body.executions)
    ? (result.body.executions as Body[])
    : [];
  const info = pageInfo(result.body, page);
  const data = {
    workflowId: options.workflowId,
    executions: rows.map(executionData),
    ...info,
  };

  if (isJsonMode()) {
    jsonSuccess(CMD.executions, data);
    return;
  }

  if (rows.length === 0) {
    log.info("No executions found for this workflow.");
  } else {
    const lines = rows.map((row) => {
      const id = pc.dim(String(row.id));
      const contact = row.contact as Body | null;
      const who = String(contact?.email ?? row.contactId ?? "—").padEnd(32);
      return `${id}  ${who}  ${String(row.status ?? "—")}`;
    });
    note(
      lines.join("\n"),
      data.total === null ? "Executions" : `Executions — ${data.total} total`
    );
  }
  if (data.nextCursor) {
    log.info(
      `More executions available. Next page: ${pc.cyan(
        nextPageCommand(
          `wraps workflows executions ${shellWord(options.workflowId)}`,
          data.nextCursor,
          [
            ["limit", limit],
            ["status", status.value],
          ]
        )
      )}`
    );
  }
}

export async function workflowsExecution(
  options: WorkflowsExecutionOptions
): Promise<void> {
  if (!options.executionId) {
    fail(
      CMD.execution,
      missingFailure("execution ID", "wraps workflows execution <execution-id>")
    );
    return;
  }
  const target = await connect(CMD.execution, options.token);
  if (!target) {
    return;
  }

  const result = await getJson(
    target,
    `/v1/workflows/executions/${encodeURIComponent(options.executionId)}`,
    {
      notFound: HINT_EXECUTION_NOT_FOUND,
      validation:
        "Execution IDs are at most 64 characters. Find one with: wraps workflows executions <workflow-id>.",
    }
  );
  if (!result.ok) {
    fail(CMD.execution, result.failure);
    return;
  }

  const body = result.body;
  const workflow = body.workflow as Body | null | undefined;
  const steps = Array.isArray(body.stepExecutions)
    ? (body.stepExecutions as Body[]).map((s) => pick(s, STEP_KEYS))
    : [];
  const data: Body = {
    ...executionData(body),
    workflowName:
      workflow && typeof workflow.name === "string" ? workflow.name : null,
    steps,
    stepEngagement: body.stepEngagement ?? null,
  };

  if (isJsonMode()) {
    jsonSuccess(CMD.execution, data);
    return;
  }

  const header = [
    kv("ID", data.id),
    kv("Workflow", data.workflowName),
    kv("Status", data.status),
    kv("Current step", data.currentStepId),
    kv("Started", data.startedAt),
    kv("Completed", data.completedAt),
  ];
  const trace =
    steps.length === 0
      ? [pc.dim("No steps recorded yet.")]
      : steps.map(
          (s) =>
            `${String(s.stepId).padEnd(24)}  ${String(s.stepType).padEnd(16)}  ${String(s.status)}`
        );
  note([...header, "", ...trace].join("\n"), "Execution");
}
