/**
 * Remote management of templates: `wraps email templates list|get|pull|publish|duplicate`.
 *
 * These talk to the organization's templates API. Local authoring (init, push,
 * preview) stays in its own files. `pull` writes one `<slug>.tsx` per template
 * into the same folder `push` reads by default (`wraps/templates/`), with the
 * source byte-for-byte, so a pulled file pushes back as unchanged.
 *
 * Errors: every failure prints through `fail()`, which sets `process.exitCode`
 * and emits the JSON envelope (or a clack message in human mode). Nothing here
 * raises an exception to the caller.
 *
 * Route facts this file relies on (see docs/agents/graph/agent-surface-parity-tier1/learned-rules.md):
 * - A 409 body carries its text in `message`, not `error`. `apiFailure()` reads `message` first.
 * - `awsAccountId` is an awsAccount row id, which `GET /v1/account/health` lists as `accounts[].id`.
 * - `publish` writes to SES, so it requires `--yes`. Nothing is sent before the flag check.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { log, note } from "@clack/prompts";
import pc from "picocolors";
import {
  checkApiTarget,
  resolveApiTarget,
  type UsableApiTarget,
} from "../../../utils/shared/api-target.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../../utils/shared/json-output.js";

type TemplatesListOptions = {
  limit?: string;
  cursor?: string;
  status?: string;
  channel?: string;
  search?: string;
  json?: boolean;
  token?: string;
  region?: string;
};

type TemplatesGetOptions = {
  id?: string;
  withoutSource?: boolean;
  json?: boolean;
  token?: string;
  region?: string;
};

type TemplatesPublishOptions = {
  id?: string;
  awsAccountId?: string;
  yes?: boolean;
  json?: boolean;
  token?: string;
  region?: string;
};

type TemplatesPullOptions = {
  outDir?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  token?: string;
  region?: string;
};

type TemplatesDuplicateOptions = {
  id?: string;
  json?: boolean;
  token?: string;
  region?: string;
};

/** Raw template row as the templates routes return it. Optional fields are absent on some routes. */
type ApiTemplate = {
  id: string;
  name: string;
  description?: string | null;
  subject?: string | null;
  previewText?: string | null;
  emailType: string;
  channel: string;
  status: string;
  slug?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  sourceHash?: string | null;
  variables?: unknown[];
  lastEditedFrom?: string | null;
  source?: string | null;
  compiledHtml?: string | null;
  compiledText?: string | null;
};

/** A row from `GET /v1/templates/pull`. That route has no response schema, so only these fields are read. */
type PullRow = {
  id: string;
  slug?: string | null;
  source?: string | null;
};

type Failure = { code: string; message: string; suggestion: string };

type ErrorBody = { error?: unknown; message?: unknown; requestId?: unknown };

const CMD = {
  list: "email.templates.list",
  get: "email.templates.get",
  pull: "email.templates.pull",
  publish: "email.templates.publish",
  duplicate: "email.templates.duplicate",
} as const;

const TEMPLATE_STATUSES: string[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const TEMPLATE_CHANNELS: string[] = ["email", "sms"];

/** pull reads the route in pages of this size. The route caps `limit` at 200. */
const PULL_PAGE_SIZE = 200;
/** Safety stop for a cursor that never ends: 1000 pages of 200 is 200k templates. */
const PULL_MAX_PAGES = 1000;
/** A slug becomes a file name (`<slug>.tsx`), so only plain names are written. */
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// ── Shared plumbing ──

/**
 * Print one failure and mark the process as failed. JSON mode gets the envelope;
 * human mode gets a clack message and the next step.
 */
function fail(command: string, failure: Failure): void {
  if (isJsonMode()) {
    jsonError(command, failure);
  } else {
    log.error(failure.message);
    log.info(failure.suggestion);
  }
  process.exitCode = 1;
}

function failValidation(
  command: string,
  message: string,
  suggestion: string
): void {
  fail(command, { code: "VALIDATION_FAILED", message, suggestion });
}

function failMissingId(command: string, usage: string): void {
  fail(command, {
    code: "MISSING_REQUIRED_FLAG",
    message: "A template id is required.",
    suggestion: `Usage: ${usage}. Find ids with \`wraps email templates list\`.`,
  });
}

function failUnexpected(command: string): void {
  fail(command, {
    code: "API_ERROR",
    message: "The Wraps API sent a response this command could not read.",
    suggestion: "Retry. If it keeps failing, contact support.",
  });
}

async function connect(
  command: string,
  token: string | undefined
): Promise<UsableApiTarget | null> {
  const check = checkApiTarget(await resolveApiTarget({ token }));
  if (check.ok) {
    return check.target;
  }
  fail(command, {
    code: "NOT_AUTHENTICATED",
    message: check.reason,
    suggestion: check.suggestion,
  });
  return null;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function firstText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Performs one API request. On a network failure it reports the error and returns null. */
async function call(
  command: string,
  target: UsableApiTarget,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<Response | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${target.token}`,
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  try {
    return await fetch(`${target.apiBase}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (err) {
    fail(command, {
      code: "NETWORK_ERROR",
      message: `Could not reach the Wraps API: ${errorText(err)}`,
      suggestion:
        "Check your network connection and WRAPS_API_URL, then retry.",
    });
    return null;
  }
}

/**
 * Map a non-2xx response to a stable code. Status decides the code, never the
 * body's own `code` field, so each status keeps one code across routes.
 */
async function apiFailure(resp: Response): Promise<Failure> {
  const body = (await resp.json().catch(() => null)) as ErrorBody | null;
  // Template conflicts carry the human text in `message`; `error` is just the word "conflict".
  const message =
    firstText(body?.message) ?? firstText(body?.error) ?? `HTTP ${resp.status}`;
  const requestId = firstText(body?.requestId);

  if (resp.status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message,
      suggestion:
        "The API key was rejected. Run `wraps auth login`, or pass a valid key with --token or WRAPS_API_KEY.",
    };
  }
  if (resp.status === 403) {
    return {
      code: "FORBIDDEN",
      message,
      suggestion:
        "This API key may not do that in this organization. Use a key created by an owner or admin of the organization.",
    };
  }
  if (resp.status === 404) {
    return {
      code: "NOT_FOUND",
      message,
      suggestion:
        "Check the id. Template ids come from `wraps email templates list`; AWS account ids come from `wraps email health`.",
    };
  }
  if (resp.status === 409) {
    return {
      code: "CONFLICT",
      message,
      suggestion:
        "The template changed or conflicts with another one. Check its current state with `wraps email templates get <id>`, then retry.",
    };
  }
  if (resp.status === 429) {
    return {
      code: "RATE_LIMITED",
      message,
      suggestion: "Too many requests. Wait a minute, then retry.",
    };
  }
  if (resp.status === 400 || resp.status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message,
      suggestion:
        "The API rejected the request. Fix what the message names, then retry.",
    };
  }
  if (resp.status >= 500) {
    return {
      code: "SERVER_ERROR",
      message,
      suggestion: requestId
        ? `Retry shortly. If it keeps failing, contact support with request id ${requestId}.`
        : "Retry shortly. If it keeps failing, contact support.",
    };
  }
  return {
    code: "API_ERROR",
    message,
    suggestion:
      "Check the message, then retry. If it keeps failing, contact support.",
  };
}

async function readBody<T>(resp: Response): Promise<T | null> {
  return (await resp.json().catch(() => null)) as T | null;
}

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Parse an optional integer flag. The arg parser keeps numeric flags as strings, so convert here. */
function parseLimit(
  raw: string | undefined,
  max: number
): { ok: true; value?: number } | { ok: false; message: string } {
  if (raw === undefined) {
    return { ok: true };
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    return {
      ok: false,
      message: `--limit must be a whole number from 1 to ${max}, got "${raw}".`,
    };
  }
  return { ok: true, value };
}

// ── Output shapes ──
// Data keys are fixed per sub-command. Optional API fields become null, so a
// key never disappears from the envelope.

function listItem(row: ApiTemplate) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    subject: row.subject ?? null,
    previewText: row.previewText ?? null,
    emailType: row.emailType,
    channel: row.channel,
    status: row.status,
    slug: row.slug ?? null,
    publishedAt: row.publishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type TemplateDetail = ReturnType<typeof listItem> & {
  sourceHash: string | null;
  variables: unknown[];
  lastEditedFrom: string | null;
  source: string | null;
  compiledHtml: string | null;
  compiledText: string | null;
};

function detailItem(row: ApiTemplate): TemplateDetail {
  return {
    ...listItem(row),
    sourceHash: row.sourceHash ?? null,
    variables: row.variables ?? [],
    lastEditedFrom: row.lastEditedFrom ?? null,
    source: row.source ?? null,
    compiledHtml: row.compiledHtml ?? null,
    compiledText: row.compiledText ?? null,
  };
}

function printDetail(title: string, t: TemplateDetail): void {
  const kv = (label: string, value: string | null) =>
    `${pc.dim(label.padEnd(10))} ${value ?? pc.dim("—")}`;
  const sourceLine =
    t.source === null
      ? null
      : `${t.source.split("\n").length} lines (use --json to read the source)`;
  note(
    [
      kv("ID", t.id),
      kv("Name", t.name),
      kv("Slug", t.slug),
      kv("Status", t.status),
      kv("Channel", t.channel),
      kv("Subject", t.subject),
      kv("Updated", t.updatedAt),
      kv("Source", sourceLine),
    ].join("\n"),
    title
  );
}

// ── Commands ──

type ListFilters = { limit?: number; status?: string; channel?: string };

/** Checks `list` flags before any request. Returns the parsed filters, or the first problem found. */
function parseListFlags(
  options: TemplatesListOptions
):
  | { ok: true; filters: ListFilters }
  | { ok: false; message: string; suggestion: string } {
  const limit = parseLimit(options.limit, 100);
  if (!limit.ok) {
    return {
      ok: false,
      message: limit.message,
      suggestion: "Use a whole number from 1 to 100.",
    };
  }
  const status = options.status?.toUpperCase();
  if (status && !TEMPLATE_STATUSES.includes(status)) {
    return {
      ok: false,
      message: `--status must be one of ${TEMPLATE_STATUSES.join(", ")}, got "${options.status}".`,
      suggestion: "Pass one of those values to --status.",
    };
  }
  const channel = options.channel?.toLowerCase();
  if (channel && !TEMPLATE_CHANNELS.includes(channel)) {
    return {
      ok: false,
      message: `--channel must be one of ${TEMPLATE_CHANNELS.join(", ")}, got "${options.channel}".`,
      suggestion: "Pass email or sms to --channel.",
    };
  }
  return { ok: true, filters: { limit: limit.value, status, channel } };
}

function listQuery(
  options: TemplatesListOptions,
  filters: ListFilters
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.limit !== undefined) {
    params.set("limit", String(filters.limit));
  }
  if (options.cursor) {
    params.set("cursor", options.cursor);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.channel) {
    params.set("channel", filters.channel);
  }
  if (options.search) {
    params.set("search", options.search);
  }
  return params;
}

/**
 * `wraps email templates list`. Cursor-paged: pass `nextCursor` back as `--cursor`.
 * Flags are validated before any request is made.
 */
export async function templatesList(
  options: TemplatesListOptions
): Promise<void> {
  const command = CMD.list;
  const parsed = parseListFlags(options);
  if (!parsed.ok) {
    failValidation(command, parsed.message, parsed.suggestion);
    return;
  }

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }

  const resp = await call(
    command,
    target,
    withQuery("/v1/templates", listQuery(options, parsed.filters))
  );
  if (!resp) {
    return;
  }
  if (!resp.ok) {
    fail(command, await apiFailure(resp));
    return;
  }
  const body = await readBody<{
    data?: ApiTemplate[];
    nextCursor?: string | null;
  }>(resp);
  if (!body) {
    failUnexpected(command);
    return;
  }

  const templates = (body.data ?? []).map(listItem);
  const nextCursor = body.nextCursor ?? null;

  if (isJsonMode()) {
    jsonSuccess(command, { templates, nextCursor });
    return;
  }

  if (templates.length === 0) {
    log.info("No templates found.");
    return;
  }
  note(
    templates
      .map(
        (t) =>
          `${t.name}  ${pc.dim(t.id)}  ${t.status}  ${t.slug ?? pc.dim("no slug")}`
      )
      .join("\n"),
    `Templates (${templates.length})`
  );
  if (nextCursor) {
    log.info(`More templates: add ${pc.cyan(`--cursor ${nextCursor}`)}`);
  }
}

/** `wraps email templates get <id>`. `--without-source` omits the TSX source from the response. */
export async function templatesGet(
  options: TemplatesGetOptions
): Promise<void> {
  const command = CMD.get;
  const id = options.id?.trim() ?? "";
  if (!id) {
    failMissingId(command, "wraps email templates get <id>");
    return;
  }

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }

  const params = new URLSearchParams({
    source: options.withoutSource ? "false" : "true",
  });
  const resp = await call(
    command,
    target,
    withQuery(`/v1/templates/${encodeURIComponent(id)}`, params)
  );
  if (!resp) {
    return;
  }
  if (!resp.ok) {
    fail(command, await apiFailure(resp));
    return;
  }
  const body = await readBody<ApiTemplate>(resp);
  if (!body) {
    failUnexpected(command);
    return;
  }

  const template = detailItem(body);
  if (isJsonMode()) {
    jsonSuccess(command, template);
    return;
  }
  printDetail(`Template ${template.slug ?? template.id}`, template);
}

/**
 * Resolve the AWS account to publish through, when `--aws-account-id` is absent.
 * The API would otherwise pick an arbitrary account, so this only succeeds when
 * exactly one account is connected. Returns null after reporting an error.
 */
async function resolveAwsAccount(
  command: string,
  target: UsableApiTarget
): Promise<string | null> {
  const resp = await call(command, target, "/v1/account/health");
  if (!resp) {
    return null;
  }
  if (!resp.ok) {
    fail(command, await apiFailure(resp));
    return null;
  }
  const body = await readBody<{
    accounts?: Array<{ id: string; region: string }>;
  }>(resp);
  if (!body) {
    failUnexpected(command);
    return null;
  }

  const accounts = body.accounts ?? [];
  const [only] = accounts;
  if (accounts.length === 1 && only) {
    return only.id;
  }
  if (accounts.length === 0) {
    fail(command, {
      code: "NO_AWS_ACCOUNT",
      message:
        "No AWS account is connected to this organization, so there is nowhere to publish.",
      suggestion: "Set up an AWS account with `wraps email init`, then retry.",
    });
    return null;
  }
  fail(command, {
    code: "MISSING_REQUIRED_FLAG",
    message: `This organization has ${accounts.length} AWS accounts, so one must be named: ${accounts
      .map((a) => `${a.id} (${a.region})`)
      .join(", ")}.`,
    suggestion:
      "Re-run with --aws-account-id <id>, using an id from the list above or from `wraps email health`.",
  });
  return null;
}

/**
 * `wraps email templates publish <id> --yes`. This writes the template to SES
 * and makes it live, so it refuses without `--yes` before any request is made.
 */
export async function templatesPublish(
  options: TemplatesPublishOptions
): Promise<void> {
  const command = CMD.publish;
  const id = options.id?.trim() ?? "";
  if (!id) {
    failMissingId(command, "wraps email templates publish <id> --yes");
    return;
  }
  if (!options.yes) {
    fail(command, {
      code: "CONFIRMATION_REQUIRED",
      message: `Publishing ${id} makes its current content live in SES. Nothing was published.`,
      suggestion: `Review it first with \`wraps email templates get ${id}\`, then re-run with --yes.`,
    });
    return;
  }

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }

  const awsAccountId =
    options.awsAccountId?.trim() || (await resolveAwsAccount(command, target));
  if (!awsAccountId) {
    return;
  }

  const resp = await call(
    command,
    target,
    `/v1/templates/${encodeURIComponent(id)}/publish`,
    { method: "POST", body: { awsAccountId } }
  );
  if (!resp) {
    return;
  }
  if (!resp.ok) {
    fail(command, await apiFailure(resp));
    return;
  }
  const body = await readBody<{
    sesTemplateName?: string;
    publishedAt?: string;
  }>(resp);
  if (!body) {
    failUnexpected(command);
    return;
  }

  const data = {
    id,
    awsAccountId,
    sesTemplateName: body.sesTemplateName ?? null,
    publishedAt: body.publishedAt ?? null,
  };
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }
  log.success(
    `Published ${id} to SES${data.sesTemplateName ? ` as ${data.sesTemplateName}` : ""}.`
  );
}

/** `wraps email templates duplicate <id>`. The copy is always a DRAFT. */
export async function templatesDuplicate(
  options: TemplatesDuplicateOptions
): Promise<void> {
  const command = CMD.duplicate;
  const id = options.id?.trim() ?? "";
  if (!id) {
    failMissingId(command, "wraps email templates duplicate <id>");
    return;
  }

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }

  const resp = await call(
    command,
    target,
    `/v1/templates/${encodeURIComponent(id)}/duplicate`,
    { method: "POST" }
  );
  if (!resp) {
    return;
  }
  if (!resp.ok) {
    fail(command, await apiFailure(resp));
    return;
  }
  const body = await readBody<ApiTemplate>(resp);
  if (!body) {
    failUnexpected(command);
    return;
  }

  const copy = detailItem(body);
  if (isJsonMode()) {
    jsonSuccess(command, copy);
    return;
  }
  log.success(`Created draft copy ${copy.id} (${copy.name}).`);
}

/**
 * Read every code-pushed template in the organization.
 *
 * Uses the paginated form of `GET /v1/templates/pull` (`limit` set), not the
 * legacy unpaginated form. The unpaginated form returns everything in one
 * response with no `nextCursor`, and it has no response schema. The paginated
 * form is bounded per request. This command follows `nextCursor` until it is
 * null, then writes, so a partial read is never written.
 *
 * Consequence: `nextCursor` is not part of pull's envelope. A partial result is
 * never written, so there is no cursor to resume from.
 */
async function fetchAllPullRows(
  command: string,
  target: UsableApiTarget
): Promise<PullRow[] | null> {
  const rows: PullRow[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < PULL_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(PULL_PAGE_SIZE),
      source: "true",
    });
    if (cursor) {
      params.set("cursor", cursor);
    }

    const resp = await call(
      command,
      target,
      withQuery("/v1/templates/pull", params)
    );
    if (!resp) {
      return null;
    }
    if (!resp.ok) {
      fail(command, await apiFailure(resp));
      return null;
    }
    const body = await readBody<{
      templates?: PullRow[];
      nextCursor?: string | null;
    }>(resp);
    if (!body) {
      failUnexpected(command);
      return null;
    }

    rows.push(...(body.templates ?? []));
    if (!body.nextCursor) {
      return rows;
    }
    if (seenCursors.has(body.nextCursor)) {
      fail(command, {
        code: "API_ERROR",
        message:
          "The API returned a page cursor it had already returned. Nothing was written.",
        suggestion: "Retry. If it keeps failing, contact support.",
      });
      return null;
    }
    seenCursors.add(body.nextCursor);
    cursor = body.nextCursor;
  }

  fail(command, {
    code: "API_ERROR",
    message: `Stopped after ${PULL_MAX_PAGES} pages, so the organization has more templates than pull reads. Nothing was written.`,
    suggestion:
      "Contact support. Pull needs a larger page limit for this organization.",
  });
  return null;
}

type PulledFile = {
  id: string;
  slug: string;
  path: string;
  source: string;
  exists: boolean;
  written: boolean;
};

type SkippedRow = { id: string; slug: string | null; reason: string };

/**
 * Decides which rows become files and which are skipped. Nothing is written here.
 * A row is skipped when its slug cannot be a file name, is missing, or is taken by an earlier row.
 */
function planPullFiles(
  rows: PullRow[],
  outDir: string
): { files: PulledFile[]; skipped: SkippedRow[] } {
  const files: PulledFile[] = [];
  const skipped: SkippedRow[] = [];
  const slugs = new Set<string>();
  for (const row of rows) {
    const slug = row.slug ?? null;
    if (!slug) {
      skipped.push({ id: row.id, slug: null, reason: "template has no slug" });
      continue;
    }
    if (!SAFE_SLUG.test(slug)) {
      skipped.push({
        id: row.id,
        slug,
        reason: "slug cannot be used as a file name",
      });
      continue;
    }
    if (slugs.has(slug)) {
      skipped.push({
        id: row.id,
        slug,
        reason: "another template already uses this slug",
      });
      continue;
    }
    if (typeof row.source !== "string") {
      skipped.push({ id: row.id, slug, reason: "template has no source" });
      continue;
    }
    slugs.add(slug);
    const path = join(outDir, `${slug}.tsx`);
    files.push({
      id: row.id,
      slug,
      path,
      source: row.source,
      exists: existsSync(path),
      written: false,
    });
  }
  return { files, skipped };
}

/** Writes the planned files. Returns false after reporting a failure. */
async function writePulledFiles(
  command: string,
  outDir: string,
  files: PulledFile[]
): Promise<boolean> {
  try {
    await mkdir(outDir, { recursive: true });
    for (const file of files) {
      await writeFile(file.path, file.source, "utf8");
      file.written = true;
    }
    return true;
  } catch (err) {
    fail(command, {
      code: "WRITE_FAILED",
      message: `Could not write templates to ${outDir}: ${errorText(err)}`,
      suggestion:
        "Check that --out-dir is a folder you can write to, then retry. Files written before the error are kept; re-run with --yes to replace them.",
    });
    return false;
  }
}

/**
 * `wraps email templates pull [--out-dir <dir>] [--dry-run] [--yes]`.
 *
 * Writes `<slug>.tsx` per template to `--out-dir`, defaulting to
 * `wraps/templates` under the current directory, the folder `wraps email
 * templates push` reads. Overwrite protection: if any target file already
 * exists, nothing is written unless `--yes` is given. `--dry-run` never writes
 * and never refuses; it reports what would happen, including which files exist.
 */
export async function templatesPull(
  options: TemplatesPullOptions
): Promise<void> {
  const command = CMD.pull;
  const outDir = resolve(
    options.outDir || join(process.cwd(), "wraps", "templates")
  );

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }
  const rows = await fetchAllPullRows(command, target);
  if (!rows) {
    return;
  }

  const { files, skipped } = planPullFiles(rows, outDir);
  const dryRun = options.dryRun === true;
  const overwrites = files.filter((f) => f.exists);
  if (!dryRun && overwrites.length > 0 && !options.yes) {
    fail(command, {
      code: "WOULD_OVERWRITE",
      message: `${overwrites.length} local file(s) already exist and would be overwritten. Nothing was written: ${overwrites
        .map((f) => f.path)
        .join(", ")}.`,
      suggestion:
        "Re-run with --yes to overwrite them, --out-dir to write somewhere else, or --dry-run to preview.",
    });
    return;
  }
  if (!(dryRun || (await writePulledFiles(command, outDir, files)))) {
    return;
  }

  const data = {
    outDir,
    dryRun,
    files: files.map(({ id, slug, path, exists, written }) => ({
      id,
      slug,
      path,
      exists,
      written,
    })),
    skipped,
  };
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }

  if (dryRun) {
    log.info(
      `Dry run: ${files.length} template(s) would be written to ${outDir}. Nothing was written.`
    );
  } else {
    log.success(`Wrote ${files.length} template(s) to ${outDir}.`);
  }
  for (const row of skipped) {
    log.warn(`Skipped ${row.slug ?? row.id}: ${row.reason}.`);
  }
}
