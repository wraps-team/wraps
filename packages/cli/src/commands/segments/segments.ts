/**
 * `wraps segments` — audience segments over the /v1/segments API.
 *
 * Pattern: commands/email/logs.ts. Every error goes through emitError(), which
 * writes the JSON envelope (or a clack message in human mode) and sets
 * process.exitCode = 1, so an agent can tell failure from success on exit code.
 * Missing ids and flags are reported here, before any request is made.
 *
 * Pagination (uniform --limit/--cursor surface): the segments route is
 * offset-based (`limit`, `offset`; limit 1-100, default 20). The CLI turns the
 * offset into an opaque cursor, which is the offset as a decimal string.
 * `--cursor 40` means "start at offset 40". nextCursor is computed from the
 * response: String(offset + items.length) while that is below `total`, and null
 * once the page reaches `total` (or the route returns an empty page).
 *
 * Plan: the whole segments route group needs the Pro plan. A 403 whose message
 * names a required plan maps to PLAN_REQUIRED, separate from a plain FORBIDDEN.
 *
 * Read-only preview: `segments preview <id>` reads the saved condition, then
 * POSTs it to the preview route. Nothing is saved and only the route's
 * count/sample are echoed back.
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

type SegmentsCommonOptions = {
  token?: string;
  json?: boolean;
  region?: string;
};

type SegmentsListOptions = SegmentsCommonOptions & {
  limit?: string;
  cursor?: string;
};

type SegmentsGetOptions = SegmentsCommonOptions & {
  id?: string;
};

type SegmentsCreateOptions = SegmentsCommonOptions & {
  name?: string;
  description?: string;
  condition?: string;
  trackMembership?: boolean;
};

type SegmentsUpdateOptions = SegmentsCommonOptions & {
  id?: string;
  name?: string;
  description?: string;
  condition?: string;
  trackMembership?: boolean;
};

type SegmentsDeleteOptions = SegmentsCommonOptions & {
  id?: string;
  yes?: boolean;
  dryRun?: boolean;
};

type SegmentsPreviewOptions = SegmentsCommonOptions & {
  id?: string;
  limit?: string;
};

type ErrorSpec = {
  code: string;
  message: string;
  suggestion: string;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: ErrorSpec };

type Target = { apiBase: string; token: string };

type ApiOutcome = { ok: true; body: Record<string, unknown> } | { ok: false };

type SegmentSummary = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  trackMembership: boolean;
  lastComputedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SegmentDetail = SegmentSummary & { condition: unknown };

const DEFAULT_LIST_LIMIT = 20;
const DIGITS_ONLY = /^\d+$/;
const PLAN_DENIAL = /requires .+ plan/i;

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
  if (!Number.isInteger(value) || value < min || value > max) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG_VALUE",
        message: `--${flag} must be a whole number from ${min} to ${max}, got "${raw}"`,
        suggestion: `Pass --${flag} with a whole number from ${min} to ${max}.`,
      },
    };
  }
  return { ok: true, value };
}

function parseCursor(raw: string | undefined): Parsed<number> {
  if (raw === undefined) {
    return { ok: true, value: 0 };
  }
  const value = Number(raw);
  if (!(DIGITS_ONLY.test(raw) && Number.isSafeInteger(value))) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG_VALUE",
        message: `--cursor "${raw}" is not a valid cursor`,
        suggestion:
          "Pass the nextCursor value from the previous page unchanged, or omit --cursor for the first page.",
      },
    };
  }
  return { ok: true, value };
}

function parseCondition(raw: string): Parsed<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG_VALUE",
        message: `--condition is not valid JSON (${error instanceof Error ? error.message : "parse error"})`,
        suggestion:
          "Pass the filter condition as one JSON object, for example --condition '{...}'. See https://wraps.dev/docs/reference/segments for its shape.",
      },
    };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG_VALUE",
        message: "--condition must be a JSON object",
        suggestion:
          "Pass the filter condition as one JSON object, for example --condition '{...}'. See https://wraps.dev/docs/reference/segments for its shape.",
      },
    };
  }
  return { ok: true, value: value as Record<string, unknown> };
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
        "Segments need the Pro plan or higher. Upgrade the organization's plan in the Wraps dashboard, then retry.",
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: text,
      suggestion:
        "This API key is not allowed to do this. Use a key from an organization with access to segments.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: text,
      suggestion:
        "Check the segment id. List segments with: wraps segments list",
    };
  }
  if (status === 409) {
    return {
      code: "CONFLICT",
      message: text,
      suggestion:
        "Wait for the broadcast using this segment to finish, or cancel it, then retry.",
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
        "Fix the values named in the message and retry. See https://wraps.dev/docs/reference/segments for the condition shape.",
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
function summaryJson(segment: SegmentSummary): Record<string, unknown> {
  return {
    id: segment.id,
    name: segment.name,
    description: segment.description,
    memberCount: segment.memberCount,
    trackMembership: segment.trackMembership,
    lastComputedAt: segment.lastComputedAt,
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
  };
}

function detailJson(segment: SegmentDetail): Record<string, unknown> {
  return { ...summaryJson(segment), condition: segment.condition };
}

function kv(label: string, value: string): string {
  return `${pc.dim(label.padEnd(16))} ${value}`;
}

function printDetail(segment: SegmentDetail): void {
  note(
    [
      kv("ID:", segment.id),
      kv("Name:", segment.name),
      kv("Description:", segment.description ?? pc.dim("—")),
      kv("Members:", String(segment.memberCount)),
      kv("Track members:", segment.trackMembership ? "yes" : "no"),
      kv("Last computed:", segment.lastComputedAt ?? pc.dim("never")),
      kv("Condition:", JSON.stringify(segment.condition)),
    ].join("\n"),
    `Segment — ${segment.name}`
  );
}

export async function segmentsList(
  options: SegmentsListOptions
): Promise<void> {
  const command = "segments.list";

  const limitParsed: Parsed<number> =
    options.limit === undefined
      ? { ok: true, value: DEFAULT_LIST_LIMIT }
      : parseBoundedInt(options.limit, "limit", 1, 100);
  if (!limitParsed.ok) {
    emitError(command, limitParsed.error);
    return;
  }
  const cursorParsed = parseCursor(options.cursor);
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

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const outcome = await callApi({
    command,
    target,
    method: "GET",
    path: `/v1/segments?${params}`,
  });
  if (!outcome.ok) {
    return;
  }

  const items = (outcome.body.segments ?? []) as SegmentSummary[];
  const total = typeof outcome.body.total === "number" ? outcome.body.total : 0;
  const nextOffset = offset + items.length;
  const nextCursor =
    items.length > 0 && nextOffset < total ? String(nextOffset) : null;

  const data = {
    segments: items.map(summaryJson),
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
    log.info("No segments found.");
    return;
  }

  const rows = items.map(
    (segment) =>
      `${segment.id}  ${segment.name}  ${pc.dim(`${segment.memberCount} members`)}`
  );
  note(rows.join("\n"), `Segments — ${total} total`);
  if (nextCursor !== null) {
    log.info(
      `More segments available. Use: ${pc.cyan(`--cursor ${nextCursor}`)}`
    );
  }
}

export async function segmentsGet(options: SegmentsGetOptions): Promise<void> {
  const command = "segments.get";
  if (!options.id) {
    emitError(
      command,
      missingInput("segment id", "wraps segments get <segment-id>")
    );
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
    path: `/v1/segments/${encodeURIComponent(options.id)}`,
  });
  if (!outcome.ok) {
    return;
  }

  const segment = outcome.body as unknown as SegmentDetail;
  if (isJsonMode()) {
    jsonSuccess(command, detailJson(segment));
    return;
  }
  printDetail(segment);
}

export async function segmentsCreate(
  options: SegmentsCreateOptions
): Promise<void> {
  const command = "segments.create";
  const usage =
    "wraps segments create --name <name> --condition '<json>' [--description <text>] [--track-membership]";
  if (!options.name) {
    emitError(command, missingInput("--name", usage));
    return;
  }
  if (!options.condition) {
    emitError(command, missingInput("--condition", usage));
    return;
  }
  const conditionParsed = parseCondition(options.condition);
  if (!conditionParsed.ok) {
    emitError(command, conditionParsed.error);
    return;
  }

  const body: Record<string, unknown> = {
    name: options.name,
    condition: conditionParsed.value,
  };
  if (options.description !== undefined) {
    body.description = options.description;
  }
  if (options.trackMembership) {
    body.trackMembership = true;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const outcome = await callApi({
    command,
    target,
    method: "POST",
    path: "/v1/segments",
    body,
  });
  if (!outcome.ok) {
    return;
  }

  const segment = outcome.body as unknown as SegmentDetail;
  if (isJsonMode()) {
    jsonSuccess(command, detailJson(segment));
    return;
  }
  log.success(`Created segment ${segment.name} (${segment.id})`);
  printDetail(segment);
}

export async function segmentsUpdate(
  options: SegmentsUpdateOptions
): Promise<void> {
  const command = "segments.update";
  if (!options.id) {
    emitError(
      command,
      missingInput(
        "segment id",
        "wraps segments update <segment-id> [--name <name>] [--description <text>] [--condition '<json>'] [--track-membership]"
      )
    );
    return;
  }

  const body: Record<string, unknown> = {};
  if (options.name !== undefined) {
    body.name = options.name;
  }
  if (options.description !== undefined) {
    body.description = options.description;
  }
  if (options.condition !== undefined) {
    const conditionParsed = parseCondition(options.condition);
    if (!conditionParsed.ok) {
      emitError(command, conditionParsed.error);
      return;
    }
    body.condition = conditionParsed.value;
  }
  if (options.trackMembership) {
    body.trackMembership = true;
  }
  if (Object.keys(body).length === 0) {
    emitError(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Nothing to update",
      suggestion:
        "Pass at least one of --name, --description, --condition, --track-membership.",
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
    path: `/v1/segments/${encodeURIComponent(options.id)}`,
    body,
  });
  if (!outcome.ok) {
    return;
  }

  const segment = outcome.body as unknown as SegmentDetail;
  if (isJsonMode()) {
    jsonSuccess(command, detailJson(segment));
    return;
  }
  log.success(`Updated segment ${segment.name} (${segment.id})`);
  printDetail(segment);
}

export async function segmentsDelete(
  options: SegmentsDeleteOptions
): Promise<void> {
  const command = "segments.delete";
  if (!options.id) {
    emitError(
      command,
      missingInput("segment id", "wraps segments delete <segment-id> --yes")
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
      `Dry run: segment ${options.id} would be deleted. No request was sent.`
    );
    return;
  }

  if (!options.yes) {
    emitError(command, {
      code: "CONFIRMATION_REQUIRED",
      message:
        "Deleting a segment is permanent. Nothing was deleted because --yes was not passed.",
      suggestion: `Re-run with --yes to confirm: wraps segments delete ${options.id} --yes`,
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
    path: `/v1/segments/${encodeURIComponent(options.id)}`,
  });
  if (!outcome.ok) {
    return;
  }

  const data = { id: options.id, deleted: true, dryRun: false };
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }
  log.success(`Deleted segment ${options.id}`);
}

export async function segmentsPreview(
  options: SegmentsPreviewOptions
): Promise<void> {
  const command = "segments.preview";
  if (!options.id) {
    emitError(
      command,
      missingInput(
        "segment id",
        "wraps segments preview <segment-id> [--limit <n>]"
      )
    );
    return;
  }
  let limit: number | undefined;
  if (options.limit !== undefined) {
    const limitParsed = parseBoundedInt(options.limit, "limit", 1, 100);
    if (!limitParsed.ok) {
      emitError(command, limitParsed.error);
      return;
    }
    limit = limitParsed.value;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }

  // Step 1: read the saved condition. Step 2: ask the preview route who it
  // would reach. Nothing is written.
  const segmentOutcome = await callApi({
    command,
    target,
    method: "GET",
    path: `/v1/segments/${encodeURIComponent(options.id)}`,
  });
  if (!segmentOutcome.ok) {
    return;
  }
  const condition = segmentOutcome.body.condition;

  const previewBody: Record<string, unknown> = { condition };
  if (limit !== undefined) {
    previewBody.limit = limit;
  }
  const previewOutcome = await callApi({
    command,
    target,
    method: "POST",
    path: "/v1/segments/preview",
    body: previewBody,
  });
  if (!previewOutcome.ok) {
    return;
  }

  const count =
    typeof previewOutcome.body.count === "number"
      ? previewOutcome.body.count
      : 0;
  const sample = Array.isArray(previewOutcome.body.sample)
    ? (previewOutcome.body.sample as string[])
    : [];

  if (isJsonMode()) {
    jsonSuccess(command, { id: options.id, count, sample });
    return;
  }
  note(
    [
      kv("Segment:", options.id),
      kv("Would reach:", `${count} recipients`),
      kv("Sample:", sample.length > 0 ? sample.join(", ") : pc.dim("none")),
    ].join("\n"),
    "Segment preview"
  );
}
