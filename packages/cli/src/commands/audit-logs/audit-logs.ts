/**
 * `wraps audit-logs` — the organization's audit log over GET /v1/audit-logs and
 * GET /v1/audit-logs/export.
 *
 * Pattern: commands/segments/segments.ts. Every error goes through emitError(),
 * which writes the JSON envelope (or a message in human mode) and sets
 * process.exitCode = 1. Flags are validated here, before any request is made.
 *
 * Access: owners and admins only, on both routes. Export also needs the Business
 * plan. The two 403s are told apart by the route's message text (apiErrorSpec).
 *
 * Pagination: `list` passes the keyset cursor through unchanged. The route rejects
 * a cursor it cannot decode with a 400, so the CLI checks only its length. The
 * next-page line repeats the filters the user passed, so it can be run as printed.
 *
 * History window: the route cuts results to the plan's retention window and says
 * how long that is (retentionDays). `list` warns when --from is older than it.
 *
 * Export: `--format json` (default) or `csv`. Without --output, JSON mode returns
 * { logs, total, truncated } in the envelope, and human mode prints the body to
 * stdout. With --output the body is written to that file, and only after a
 * successful response. An existing file is never overwritten without --yes. The
 * route caps an export at 50,000 rows; the X-Truncated header says when it cut.
 */

import { existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { log } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../utils/shared/api-target.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../utils/shared/json-output.js";

type AuditLogsCommonOptions = {
  token?: string;
  json?: boolean;
  region?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
};

export type AuditLogsListOptions = AuditLogsCommonOptions & {
  limit?: string;
  cursor?: string;
};

export type AuditLogsExportOptions = AuditLogsCommonOptions & {
  format?: string;
  output?: string;
  yes?: boolean;
};

type ErrorSpec = {
  code: string;
  message: string;
  suggestion: string;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: ErrorSpec };

type Target = { apiBase: string; token: string };

type Filters = {
  action?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
};

/** The fields of one audit row that the human output prints. */
type AuditRowView = {
  createdAt: string;
  action: string;
  actorEmail: string | null;
  userId: string | null;
  resource: string;
  resourceId: string | null;
};

type ListBody = {
  data: AuditRowView[];
  nextCursor: string | null;
  retentionDays: number;
  canExtend: boolean;
};

type ExportBody = {
  logs: AuditRowView[];
  total: number;
  truncated: boolean;
};

type ArgPair = [flag: string, value: string | undefined];

const LIST_USAGE = "wraps audit-logs list";
const EXPORT_USAGE = "wraps audit-logs export";

const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const MAX_CURSOR_LENGTH = 512;
const MAX_ACTION_LENGTH = 64;
const MAX_ACTOR_LENGTH = 255;
/** Same cap as the route's export (MAX_EXPORT_ROWS). */
const EXPORT_ROW_CAP_TEXT = "50,000";
const DAY_MS = 24 * 60 * 60 * 1000;

const DIGITS_ONLY = /^\d+$/;
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
const PLAN_DENIAL = /Business plan/i;

/** Route validation messages name their query parameter; map it to the CLI flag. */
const FLAG_IN_MESSAGE: readonly [RegExp, string][] = [
  [/dateFrom/, "--from"],
  [/dateTo/, "--to"],
  [/limit/, "--limit"],
  [/cursor/i, "--cursor"],
  [/format/, "--format"],
  [/actorId/, "--actor"],
  [/action/, "--action"],
];

function emitError(command: string, error: ErrorSpec): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(command, error);
    return;
  }
  log.error(error.message);
  log.info(error.suggestion);
}

/** Quote a value for a copy-pasteable command line. */
function shellArg(value: string): string {
  return SHELL_SAFE.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

/** Join a base command with `--flag value` pairs, skipping unset values. */
function runnable(base: string, pairs: ArgPair[]): string {
  const args = pairs
    .filter((pair): pair is [string, string] => pair[1] !== undefined)
    .map(([flag, value]) => `${flag} ${shellArg(value)}`);
  return [base, ...args].join(" ");
}

function filterPairs(filters: Filters): ArgPair[] {
  return [
    ["--action", filters.action],
    ["--actor", filters.actorId],
    ["--from", filters.dateFrom],
    ["--to", filters.dateTo],
  ];
}

/** Query string keys are the route's names (actorId, dateFrom, dateTo), not the flags'. */
function filterQuery(filters: Filters): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.action !== undefined) {
    query.set("action", filters.action);
  }
  if (filters.actorId !== undefined) {
    query.set("actorId", filters.actorId);
  }
  if (filters.dateFrom !== undefined) {
    query.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo !== undefined) {
    query.set("dateTo", filters.dateTo);
  }
  return query;
}

function parseLimit(raw: string | undefined): Parsed<string | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  const value = Number(raw);
  if (!(DIGITS_ONLY.test(raw) && value >= MIN_LIMIT && value <= MAX_LIMIT)) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG_VALUE",
        message: `--limit must be a whole number from ${MIN_LIMIT} to ${MAX_LIMIT}, got "${raw}"`,
        suggestion: `Pass --limit with a whole number from ${MIN_LIMIT} to ${MAX_LIMIT}, for example: ${LIST_USAGE} --limit 50`,
      },
    };
  }
  return { ok: true, value: raw };
}

function parseCursor(raw: string | undefined): Parsed<string | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG_VALUE",
        message:
          raw.length === 0
            ? "--cursor must not be empty"
            : `--cursor is longer than the ${MAX_CURSOR_LENGTH} characters a cursor can be`,
        suggestion: `Pass the nextCursor value from the previous page unchanged, for example: ${LIST_USAGE} --cursor <nextCursor>. Omit --cursor for the first page.`,
      },
    };
  }
  return { ok: true, value: raw };
}

function parseDate(
  usage: string,
  flag: "from" | "to",
  raw: string | undefined
): Parsed<string | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (!(ISO_8601.test(raw) && !Number.isNaN(Date.parse(raw)))) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG_VALUE",
        message: `--${flag} must be an ISO 8601 date or timestamp, got "${raw}"`,
        suggestion: `Pass --${flag} as a date or a UTC timestamp, for example: ${usage} --${flag} 2026-10-01 or ${usage} --${flag} 2026-10-01T00:00:00Z`,
      },
    };
  }
  return { ok: true, value: raw };
}

function parseFilters(
  usage: string,
  options: AuditLogsCommonOptions
): Parsed<Filters> {
  if (
    options.action !== undefined &&
    (options.action.length === 0 || options.action.length > MAX_ACTION_LENGTH)
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG_VALUE",
        message: `--action must be 1 to ${MAX_ACTION_LENGTH} characters`,
        suggestion: `Pass --action with an action name, for example: ${usage} --action audit_log.exported`,
      },
    };
  }
  if (
    options.actor !== undefined &&
    (options.actor.length === 0 || options.actor.length > MAX_ACTOR_LENGTH)
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG_VALUE",
        message: `--actor must be 1 to ${MAX_ACTOR_LENGTH} characters`,
        suggestion: `Pass --actor with a user id, for example: ${usage} --actor <userId>`,
      },
    };
  }
  const from = parseDate(usage, "from", options.from);
  if (!from.ok) {
    return from;
  }
  const to = parseDate(usage, "to", options.to);
  if (!to.ok) {
    return to;
  }
  return {
    ok: true,
    value: {
      action: options.action,
      actorId: options.actor,
      dateFrom: from.value,
      dateTo: to.value,
    },
  };
}

function parseFormat(raw: string | undefined): Parsed<"json" | "csv"> {
  if (raw === undefined || raw === "json") {
    return { ok: true, value: "json" };
  }
  if (raw === "csv") {
    return { ok: true, value: "csv" };
  }
  return {
    ok: false,
    error: {
      code: "INVALID_FLAG_VALUE",
      message: `--format must be json or csv, got "${raw}"`,
      suggestion: `Pass --format json (the default) or --format csv, for example: ${EXPORT_USAGE} --format csv --output ./audit-logs.csv`,
    },
  };
}

function apiErrorSpec(status: number, text: string, usage: string): ErrorSpec {
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
        "Audit log export needs the Business plan or higher. Upgrade the organization's plan in the Wraps dashboard, then retry. wraps audit-logs list works on every plan.",
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: text,
      suggestion:
        "Only owners and admins can read the audit log: ask an org owner or admin to run this command for you.",
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
    const flag = FLAG_IN_MESSAGE.find(([pattern]) => pattern.test(text))?.[1];
    return {
      code: "VALIDATION_FAILED",
      message: text,
      suggestion: flag
        ? `Fix ${flag} and retry. ${usage} --help lists the flags.`
        : `Fix the value named in the message and retry. ${usage} --help lists the flags.`,
    };
  }
  return {
    code: "API_ERROR",
    message: text,
    suggestion: `The Wraps API returned HTTP ${status}. Retry shortly. If it keeps failing, include this message in your report.`,
  };
}

// Read `message` before `error`: some bodies carry the human text in `message`.
function errorText(
  body: Record<string, unknown> | null,
  status: number
): string {
  if (typeof body?.message === "string" && body.message.length > 0) {
    return body.message;
  }
  if (typeof body?.error === "string" && body.error.length > 0) {
    return body.error;
  }
  return `HTTP ${status}`;
}

async function readObject(
  resp: Response
): Promise<Record<string, unknown> | null> {
  const parsed: unknown = await resp.json().catch(() => null);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
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

function unreadable(command: string): void {
  emitError(command, {
    code: "API_ERROR",
    message: "The Wraps API returned a response that could not be read.",
    suggestion:
      "Retry shortly. If it keeps failing, include this message in your report.",
  });
}

/** GET a route; on any failure this reports the error and returns null. */
type ApiGet = {
  command: string;
  usage: string;
  target: Target;
  path: string;
  query: URLSearchParams;
};

async function getAuditApi({
  command,
  usage,
  target,
  path,
  query,
}: ApiGet): Promise<Response | null> {
  const queryString = query.toString();
  const url = `${target.apiBase}${path}${queryString ? `?${queryString}` : ""}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${target.token}` },
    });
  } catch (error) {
    emitError(command, {
      code: "NETWORK_ERROR",
      message: `Could not reach the Wraps API (${error instanceof Error ? error.message : "unknown error"}).`,
      suggestion:
        "Check your network connection and WRAPS_API_URL, then retry.",
    });
    return null;
  }

  if (!resp.ok) {
    const body = await readObject(resp);
    emitError(
      command,
      apiErrorSpec(resp.status, errorText(body, resp.status), usage)
    );
    return null;
  }
  return resp;
}

function isListBody(body: Record<string, unknown> | null): body is ListBody {
  return (
    body !== null &&
    Array.isArray(body.data) &&
    (typeof body.nextCursor === "string" || body.nextCursor === null) &&
    typeof body.retentionDays === "number" &&
    typeof body.canExtend === "boolean"
  );
}

function isExportBody(
  body: Record<string, unknown> | null
): body is ExportBody {
  return (
    body !== null &&
    Array.isArray(body.logs) &&
    typeof body.total === "number" &&
    typeof body.truncated === "boolean"
  );
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** True when a date-only or timestamp --from falls before the plan's window. */
function isBeforeWindow(from: string, retentionDays: number): boolean {
  const start = Date.parse(from);
  return Number.isFinite(start) && start < Date.now() - retentionDays * DAY_MS;
}

export async function auditLogsList(
  options: AuditLogsListOptions
): Promise<void> {
  const command = "audit-logs.list";

  const limit = parseLimit(options.limit);
  if (!limit.ok) {
    emitError(command, limit.error);
    return;
  }
  const cursor = parseCursor(options.cursor);
  if (!cursor.ok) {
    emitError(command, cursor.error);
    return;
  }
  const filters = parseFilters(LIST_USAGE, options);
  if (!filters.ok) {
    emitError(command, filters.error);
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }

  const query = filterQuery(filters.value);
  if (limit.value !== undefined) {
    query.set("limit", limit.value);
  }
  if (cursor.value !== undefined) {
    query.set("cursor", cursor.value);
  }

  const resp = await getAuditApi({
    command,
    usage: LIST_USAGE,
    target,
    path: "/v1/audit-logs",
    query,
  });
  if (!resp) {
    return;
  }
  const body = await readObject(resp);
  if (!isListBody(body)) {
    unreadable(command);
    return;
  }

  const { data, nextCursor, retentionDays, canExtend } = body;
  if (isJsonMode()) {
    jsonSuccess(command, { data, nextCursor, retentionDays, canExtend });
    return;
  }
  printListPage(body, options, filters.value, limit.value);
}

/** Human output for one page: rows, the retention window, a --from warning, and the next command. */
function printListPage(
  page: ListBody,
  options: AuditLogsListOptions,
  filters: Filters,
  limit: string | undefined
): void {
  const { data, nextCursor, retentionDays, canExtend } = page;
  if (data.length === 0) {
    log.info("No audit log entries match these filters.");
  } else {
    log.info(
      data
        .map((row) =>
          [
            row.createdAt,
            row.action,
            row.actorEmail ?? row.userId ?? "-",
            row.resourceId ? `${row.resource} ${row.resourceId}` : row.resource,
          ].join("  ")
        )
        .join("\n")
    );
  }
  log.info(`Your plan keeps audit history for ${retentionDays} days.`);
  if (
    options.from !== undefined &&
    isBeforeWindow(options.from, retentionDays)
  ) {
    log.warn(
      `Your plan limits audit history to ${retentionDays} days, so rows older than that are not returned, even with --from ${options.from}.${canExtend ? " A higher plan keeps history for longer." : ""}`
    );
  }
  if (nextCursor !== null) {
    log.info(
      `Next page: ${runnable(LIST_USAGE, [
        ...filterPairs(filters),
        ["--limit", limit],
        ["--cursor", nextCursor],
      ])}`
    );
  }
}

/** Refuses an --output that cannot be written, or would be overwritten without --yes. */
function outputProblem(
  typed: string,
  yes: boolean,
  rerunFor: (output: string | undefined) => string
): ErrorSpec | null {
  const outputPath = resolve(typed);
  if (!isDirectory(dirname(outputPath))) {
    return {
      code: "VALIDATION_FAILED",
      message: `--output directory does not exist: ${dirname(outputPath)}`,
      suggestion: `Create that directory, or pass a path in one that exists, for example: ${rerunFor("./audit-logs.csv")}`,
    };
  }
  if (isDirectory(outputPath)) {
    return {
      code: "VALIDATION_FAILED",
      message: `--output is a directory: ${outputPath}`,
      suggestion: `Pass --output with a file path, for example: ${rerunFor("./audit-logs.csv")}`,
    };
  }
  if (existsSync(outputPath) && !yes) {
    return {
      code: "CONFIRMATION_REQUIRED",
      message: `${outputPath} already exists. Nothing was exported because --yes was not passed.`,
      suggestion: `Re-run with --yes to overwrite it: ${rerunFor(typed)} --yes`,
    };
  }
  return null;
}

/** Reads the export body in full. A CSV body's counts come from its headers. */
async function readExportBody(
  resp: Response,
  format: "json" | "csv"
): Promise<{ content: string; body: ExportBody } | null> {
  if (format === "csv") {
    const text = await resp.text().catch(() => null);
    const totalHeader = resp.headers.get("x-total-count");
    const truncatedHeader = resp.headers.get("x-truncated");
    if (
      text === null ||
      totalHeader === null ||
      !DIGITS_ONLY.test(totalHeader) ||
      (truncatedHeader !== "true" && truncatedHeader !== "false")
    ) {
      return null;
    }
    return {
      content: text,
      body: {
        logs: [],
        total: Number(totalHeader),
        truncated: truncatedHeader === "true",
      },
    };
  }
  const parsed = await readObject(resp);
  if (!isExportBody(parsed)) {
    return null;
  }
  return { content: `${JSON.stringify(parsed, null, 2)}\n`, body: parsed };
}

function truncationNotice(total: number): string {
  return `The export is truncated at the ${EXPORT_ROW_CAP_TEXT}-row cap: ${total} rows match, and only the first ${EXPORT_ROW_CAP_TEXT} are included. Narrow it with --from and --to, for example --from 2026-10-01 --to 2026-10-08, then export again.`;
}

type FinishExport = {
  command: string;
  format: "json" | "csv";
  content: string;
  body: ExportBody;
  output: string | undefined;
  jsonMode: boolean;
};

/** Prints or writes an export that has been read in full. The only place a file is written. */
async function finishExport({
  command,
  format,
  content,
  body,
  output,
  jsonMode,
}: FinishExport): Promise<void> {
  const { total, truncated } = body;
  if (output === undefined) {
    if (jsonMode) {
      jsonSuccess(command, { logs: body.logs, total, truncated });
      return;
    }
    // Human mode prints the body to stdout, so notes go to stderr to keep it clean.
    process.stdout.write(content);
    if (truncated) {
      process.stderr.write(`${truncationNotice(total)}\n`);
    }
    return;
  }

  const outputPath = resolve(output);
  try {
    await writeFile(outputPath, content, "utf8");
  } catch (error) {
    emitError(command, {
      code: "WRITE_FAILED",
      message: `Could not write ${outputPath} (${error instanceof Error ? error.message : "unknown error"}).`,
      suggestion:
        "Check that the directory is writable, then retry. The export was already recorded in the audit log.",
    });
    return;
  }

  if (jsonMode) {
    jsonSuccess(command, {
      format,
      output: outputPath,
      total,
      truncated,
      bytes: Buffer.byteLength(content, "utf8"),
    });
    return;
  }
  log.success(
    `Wrote ${total} matching audit log rows to ${outputPath} (${format}).`
  );
  if (truncated) {
    log.warn(truncationNotice(total));
  }
}

export async function auditLogsExport(
  options: AuditLogsExportOptions
): Promise<void> {
  const command = "audit-logs.export";

  const format = parseFormat(options.format);
  if (!format.ok) {
    emitError(command, format.error);
    return;
  }
  const filters = parseFilters(EXPORT_USAGE, options);
  if (!filters.ok) {
    emitError(command, filters.error);
    return;
  }

  const jsonMode = isJsonMode();
  const rerunFor = (output: string | undefined): string =>
    runnable(EXPORT_USAGE, [
      ...filterPairs(filters.value),
      ["--format", format.value],
      ["--output", output],
    ]);

  // In JSON mode the envelope is the only thing on stdout, so CSV needs a file.
  if (format.value === "csv" && jsonMode && options.output === undefined) {
    emitError(command, {
      code: "VALIDATION_FAILED",
      message:
        "--format csv in --json mode needs --output. The CSV is written to a file, not into the JSON envelope.",
      suggestion: `Add --output to write the file: ${rerunFor("./audit-logs.csv")} --json`,
    });
    return;
  }

  // Checked before any request, so a refused export does not record an export row.
  if (options.output !== undefined) {
    const problem = outputProblem(
      options.output,
      options.yes === true,
      rerunFor
    );
    if (problem) {
      emitError(command, problem);
      return;
    }
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }

  const query = filterQuery(filters.value);
  query.set("format", format.value);

  const resp = await getAuditApi({
    command,
    usage: EXPORT_USAGE,
    target,
    path: "/v1/audit-logs/export",
    query,
  });
  if (!resp) {
    return;
  }

  // Nothing is written until the body has been read in full.
  const read = await readExportBody(resp, format.value);
  if (!read) {
    unreadable(command);
    return;
  }
  await finishExport({
    command,
    format: format.value,
    content: read.content,
    body: read.body,
    output: options.output,
    jsonMode,
  });
}
