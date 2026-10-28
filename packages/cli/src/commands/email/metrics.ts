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

/*
 * `wraps email metrics`: aggregate sends, opens, clicks, bounces and cost for
 * the organization, from GET /v1/email/metrics (apps/api/src/routes/metrics.ts).
 *
 * - Not paginated. The route returns one aggregate with no limit and no
 *   cursor, so there is no --limit, --cursor or nextCursor here.
 * - Query names are snake_case on the wire; the flags are kebab-case and are
 *   mapped below. Only flags the caller set are sent, so the route defaults
 *   (window, timezone, granularity) still apply.
 * - The route clamps a future end_date to now. The only client-side range check
 *   is start after end, on the raw values. That check can never reject a
 *   request the route would accept, because the clamp only moves the end
 *   earlier.
 * - Error bodies are {error, code}. The text is read from `message` first,
 *   then `error`.
 */

const COMMAND = "email.metrics";
const GRANULARITIES: readonly string[] = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
];

const DATE_SUGGESTION =
  "Use an ISO 8601 date (2026-10-01) or timestamp (2026-10-01T00:00:00Z) for --start-date and --end-date.";
const VALIDATION_SUGGESTION =
  "Check --start-date, --end-date, --timezone, --granularity, --dimensions and the ID filters. Dimensions are period, domain, broadcast, template, source, account and region. Each ID filter takes up to 100 comma-separated values.";

type EmailMetricsOptions = {
  startDate?: string;
  endDate?: string;
  timezone?: string;
  granularity?: string;
  dimensions?: string;
  broadcastId?: string;
  templateId?: string;
  awsAccountId?: string;
  domain?: string;
  json?: boolean;
  token?: string;
  region?: string;
};

type MetricsResponse = {
  object: string;
  totals: Record<string, unknown>;
  data: unknown[];
  meta: {
    start_date: string;
    end_date: string;
    timezone: string;
    granularity: string;
    dimensions: string[];
  };
};

type Failure = { code: string; message: string; suggestion: string };

// The one place a failure is reported. It sets the exit code, so a failed
// command exits 1 (logs.ts returns with exit 0; learned-rules section 1).
function fail(failure: Failure): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(COMMAND, {
      code: failure.code,
      message: failure.message,
      suggestion: failure.suggestion,
    });
    return;
  }
  log.error(failure.message);
  log.info(failure.suggestion);
}

function badDate(flag: string, raw: string): Failure | null {
  if (!Number.isNaN(Date.parse(raw))) {
    return null;
  }
  return {
    code: "INVALID_DATE",
    message: `${flag} "${raw}" is not a valid date`,
    suggestion: DATE_SUGGESTION,
  };
}

// Client-side checks, run before any request. The route rejects the same
// inputs with a 400, so this only saves a round trip and gives a clearer
// message.
function checkInput(options: EmailMetricsOptions): Failure | null {
  const dates: [string, string | undefined][] = [
    ["--start-date", options.startDate],
    ["--end-date", options.endDate],
  ];
  for (const [flag, raw] of dates) {
    if (raw) {
      const failure = badDate(flag, raw);
      if (failure) {
        return failure;
      }
    }
  }

  if (
    options.startDate &&
    options.endDate &&
    Date.parse(options.startDate) > Date.parse(options.endDate)
  ) {
    return {
      code: "INVALID_DATE_RANGE",
      message: `--start-date (${options.startDate}) is after --end-date (${options.endDate})`,
      suggestion: "Set --start-date on or before --end-date.",
    };
  }

  if (options.granularity && !GRANULARITIES.includes(options.granularity)) {
    return {
      code: "INVALID_GRANULARITY",
      message: `--granularity "${options.granularity}" is not supported`,
      suggestion: `Use one of: ${GRANULARITIES.join(", ")}.`,
    };
  }

  return null;
}

function readErrorText(
  body: { message?: unknown; error?: unknown } | null,
  status: number
): string {
  // `message` before `error`: some route bodies carry the text in `message`.
  if (typeof body?.message === "string") {
    return body.message;
  }
  if (typeof body?.error === "string") {
    return body.error;
  }
  return `HTTP ${status}`;
}

function classifyHttpStatus(status: number, message: string): Failure {
  if (status === 400 || status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message,
      suggestion: VALIDATION_SUGGESTION,
    };
  }
  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message,
      suggestion:
        "The API key was rejected. Check WRAPS_API_KEY or --token, or sign in again with `wraps auth login`.",
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message,
      suggestion:
        "This API key cannot read metrics for its organization. Use an API key created for this organization.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message,
      suggestion:
        "The metrics endpoint was not found. Check that WRAPS_API_URL points at the Wraps API and that the CLI is up to date.",
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message,
      suggestion:
        "Too many requests. Wait a minute, then run the command again.",
    };
  }
  if (status >= 500) {
    return {
      code: "SERVER_ERROR",
      message,
      suggestion:
        "The Wraps API failed while computing metrics. Retry in a few minutes.",
    };
  }
  return {
    code: "API_ERROR",
    message,
    suggestion:
      "Run the command again. If it keeps failing, contact support with the message above.",
  };
}

function formatTotal(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return pc.dim("unknown");
  }
  if (key === "costUsd" && typeof value === "number") {
    return `$${value.toFixed(4)}`;
  }
  if (typeof value === "number") {
    return value.toLocaleString("en-US");
  }
  return String(value);
}

function renderHuman(body: MetricsResponse): void {
  const kv = (label: string, value: string) =>
    `${pc.dim(label.padEnd(14))} ${value}`;

  const lines = Object.entries(body.totals).map(([key, value]) =>
    kv(key, formatTotal(key, value))
  );
  lines.push(
    "",
    kv("Window", `${body.meta.start_date} to ${body.meta.end_date}`),
    kv("Timezone", body.meta.timezone),
    kv("Granularity", body.meta.granularity)
  );

  note(lines.join("\n"), "Email Metrics");
  log.info(
    `${body.data.length} breakdown row(s). Use --json for the full data.`
  );
}

export async function emailMetrics(
  options: EmailMetricsOptions
): Promise<void> {
  const invalid = checkInput(options);
  if (invalid) {
    fail(invalid);
    return;
  }

  const check = checkApiTarget(
    await resolveApiTarget({ token: options.token })
  );
  if (!check.ok) {
    fail({
      code: "NOT_AUTHENTICATED",
      message: `${check.reason}. ${check.suggestion}`,
      suggestion: check.suggestion,
    });
    return;
  }
  const { apiBase, token } = check.target;

  const params = new URLSearchParams();
  const query: [string, string | undefined][] = [
    ["start_date", options.startDate],
    ["end_date", options.endDate],
    ["timezone", options.timezone],
    ["granularity", options.granularity],
    ["dimensions", options.dimensions],
    ["broadcast_id", options.broadcastId],
    ["template_id", options.templateId],
    ["aws_account_id", options.awsAccountId],
    ["domain", options.domain],
  ];
  for (const [key, value] of query) {
    if (value) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  const url = `${apiBase}/v1/email/metrics${qs ? `?${qs}` : ""}`;

  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    fail({
      code: "NETWORK_ERROR",
      message: `Could not reach the Wraps API: ${err instanceof Error ? err.message : String(err)}`,
      suggestion:
        "Check your network connection and WRAPS_API_URL, then run the command again.",
    });
    return;
  }

  if (!resp.ok) {
    const body = (await resp.json().catch(() => null)) as {
      message?: unknown;
      error?: unknown;
    } | null;
    fail(classifyHttpStatus(resp.status, readErrorText(body, resp.status)));
    return;
  }

  let body: MetricsResponse;
  try {
    body = (await resp.json()) as MetricsResponse;
  } catch (err) {
    fail({
      code: "INVALID_RESPONSE",
      message: `The Wraps API returned a response that is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      suggestion:
        "Run the command again. If it keeps failing, contact support with the message above.",
    });
    return;
  }

  if (isJsonMode()) {
    // Fixed top-level keys: the route's four fields, nothing else.
    jsonSuccess(COMMAND, {
      object: body.object,
      totals: body.totals,
      data: body.data,
      meta: body.meta,
    });
    return;
  }

  renderHuman(body);
}
