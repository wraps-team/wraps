/**
 * `wraps email health`: SES health for every AWS account connected to the org.
 *
 * Reads GET /v1/account/health. The API answers from Postgres only (the last
 * hourly sweep), so this makes zero AWS calls and is safe to run often.
 *
 * Where to get an account id: the `id` of each account printed here is the
 * awsAccount row id. Pass it as `--aws-account-id` to commands that need one
 * (templates publish, broadcasts create/send). It is NOT the 12-digit AWS
 * account number, which is shown separately as `accountNumber`.
 *
 * Exit code: 0 whenever the health read succeeds, including when the status is
 * `at_risk` or `in_danger`. Read `data.status` to decide. Any failure to read
 * sets process.exitCode = 1.
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

const COMMAND = "email.health";

type EmailHealthOptions = {
  json?: boolean;
  token?: string;
  region?: string;
};

type HealthStatus = "healthy" | "at_risk" | "in_danger" | "unknown";

/**
 * Allowlist projection of the API's per-account view. Only these fields are
 * copied to the output, so anything else the API sends (now or later) is
 * dropped rather than printed.
 */
type AccountHealth = {
  id: string;
  accountNumber: string | null;
  region: string | null;
  status: HealthStatus;
  checkedAt: string | null;
  sandbox: boolean | null;
  productionAccessEnabled: boolean | null;
  sendingEnabled: boolean | null;
  enforcementStatus: string | null;
  quota: {
    max24Hour: number | null;
    sentLast24Hours: number | null;
    usedRatio: number | null;
    maxSendRate: number | null;
  };
  reputation: {
    bounceRate: number | null;
    complaintRate: number | null;
  };
  thresholds: {
    bounceReview: number | null;
    bouncePause: number | null;
    complaintReview: number | null;
    complaintPause: number | null;
    quotaWarn: number | null;
  };
  reasons: string[];
};

type HealthPayload = {
  status: HealthStatus;
  checkedAt: string | null;
  accounts: AccountHealth[];
};

const HEALTH_STATUSES: readonly HealthStatus[] = [
  "healthy",
  "at_risk",
  "in_danger",
  "unknown",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toHealthStatus(value: unknown): HealthStatus {
  return HEALTH_STATUSES.find((s) => s === value) ?? "unknown";
}

function projectAccount(raw: unknown): AccountHealth | null {
  if (!isRecord(raw) || typeof raw.id !== "string") {
    return null;
  }
  const quota = isRecord(raw.quota) ? raw.quota : {};
  const reputation = isRecord(raw.reputation) ? raw.reputation : {};
  const thresholds = isRecord(raw.thresholds) ? raw.thresholds : {};
  return {
    id: raw.id,
    accountNumber: nullableString(raw.accountNumber),
    region: nullableString(raw.region),
    status: toHealthStatus(raw.status),
    checkedAt: nullableString(raw.checkedAt),
    sandbox: nullableBoolean(raw.sandbox),
    productionAccessEnabled: nullableBoolean(raw.productionAccessEnabled),
    sendingEnabled: nullableBoolean(raw.sendingEnabled),
    enforcementStatus: nullableString(raw.enforcementStatus),
    quota: {
      max24Hour: nullableNumber(quota.max24Hour),
      sentLast24Hours: nullableNumber(quota.sentLast24Hours),
      usedRatio: nullableNumber(quota.usedRatio),
      maxSendRate: nullableNumber(quota.maxSendRate),
    },
    reputation: {
      bounceRate: nullableNumber(reputation.bounceRate),
      complaintRate: nullableNumber(reputation.complaintRate),
    },
    thresholds: {
      bounceReview: nullableNumber(thresholds.bounceReview),
      bouncePause: nullableNumber(thresholds.bouncePause),
      complaintReview: nullableNumber(thresholds.complaintReview),
      complaintPause: nullableNumber(thresholds.complaintPause),
      quotaWarn: nullableNumber(thresholds.quotaWarn),
    },
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.filter((r): r is string => typeof r === "string")
      : [],
  };
}

/** Returns null when the body is not the shape this CLI understands. */
function parseHealthPayload(raw: unknown): HealthPayload | null {
  if (!(isRecord(raw) && Array.isArray(raw.accounts))) {
    return null;
  }
  const accounts: AccountHealth[] = [];
  for (const item of raw.accounts) {
    const account = projectAccount(item);
    if (!account) {
      return null;
    }
    accounts.push(account);
  }
  return {
    status: toHealthStatus(raw.status),
    checkedAt: nullableString(raw.checkedAt),
    accounts,
  };
}

/** Error text from an API body. `message` is read before `error`. */
function apiMessageOf(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  if (typeof body.message === "string" && body.message.length > 0) {
    return body.message;
  }
  if (typeof body.error === "string" && body.error.length > 0) {
    return body.error;
  }
  return null;
}

type Failure = { code: string; message: string; suggestion: string };

function describeHttpFailure(
  status: number,
  apiMessage: string | null,
  apiBase: string,
  loginCommand: string
): Failure {
  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message: "The Wraps API rejected your credentials (HTTP 401).",
      suggestion: `Run: ${loginCommand}, or set WRAPS_API_KEY to a valid key, then run the command again.`,
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: "This API key is not allowed to read account health (HTTP 403).",
      suggestion:
        "Use an API key that belongs to this organization, or ask an owner or admin to check the key's permissions.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: `The account health endpoint was not found at ${apiBase} (HTTP 404).`,
      suggestion: `Check the API URL (WRAPS_API_URL, or run: ${loginCommand} again), then run the command again.`,
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message: apiMessage ?? "Too many requests (HTTP 429).",
      suggestion:
        "Wait a minute, then run the command again. Requests share the rate limit of this API key.",
    };
  }
  if (status >= 500) {
    return {
      code: "SERVER_ERROR",
      message: apiMessage ?? `The Wraps API failed (HTTP ${status}).`,
      suggestion:
        "This is on the Wraps side. Wait a few minutes and run the command again. If it keeps failing, contact Wraps support with the HTTP status.",
    };
  }
  return {
    code: "API_ERROR",
    message: apiMessage ?? `Request failed (HTTP ${status}).`,
    suggestion:
      "Read the message above and run the command again. If it keeps failing, contact Wraps support with the HTTP status.",
  };
}

/** Prints the failure in the active output mode and marks the process failed. */
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
  clack.log.error(failure.message);
  clack.log.info(failure.suggestion);
}

function colorStatus(status: HealthStatus): string {
  if (status === "healthy") {
    return pc.green(status);
  }
  if (status === "at_risk") {
    return pc.yellow(status);
  }
  if (status === "in_danger") {
    return pc.red(status);
  }
  return pc.dim(status);
}

function yesNo(value: boolean | null): string {
  if (value === null) {
    return "unknown";
  }
  return value ? "yes" : "no";
}

function quotaText(quota: AccountHealth["quota"]): string {
  const sent = quota.sentLast24Hours ?? "?";
  const max = quota.max24Hour ?? "?";
  const pct =
    quota.usedRatio === null ? "" : ` (${(quota.usedRatio * 100).toFixed(1)}%)`;
  return `${sent}/${max} sent in 24h${pct}`;
}

function renderHuman(payload: HealthPayload): void {
  if (payload.accounts.length === 0) {
    clack.log.info("No AWS accounts are connected to this organization.");
    clack.log.info(
      "Connect an AWS account in the Wraps dashboard, then run this command again."
    );
    return;
  }

  const lines: string[] = [
    `${pc.bold("Overall:")} ${colorStatus(payload.status)}   ${pc.dim(`checked ${payload.checkedAt ?? "never"}`)}`,
    "",
    pc.bold(
      "Account ids (pass one as --aws-account-id; this is not the 12-digit AWS account number):"
    ),
  ];
  for (const account of payload.accounts) {
    lines.push(
      `${colorStatus(account.status)}  ${pc.bold(account.id)}  ${pc.dim(`AWS ${account.accountNumber ?? "?"} · ${account.region ?? "?"}`)}`
    );
    lines.push(
      `    sending: ${yesNo(account.sendingEnabled)}  sandbox: ${yesNo(account.sandbox)}  quota: ${quotaText(account.quota)}`
    );
    if (account.reasons.length > 0) {
      lines.push(`    reasons: ${account.reasons.join("; ")}`);
    }
  }
  clack.note(lines.join("\n"), "Email health");
}

export async function emailHealth(options: EmailHealthOptions): Promise<void> {
  const check = checkApiTarget(
    await resolveApiTarget({ token: options.token })
  );
  if (!check.ok) {
    fail({
      code: "NOT_AUTHENTICATED",
      message: `${check.reason}.`,
      suggestion: check.suggestion,
    });
    return;
  }
  const { apiBase, token, loginCommand } = check.target;

  let resp: Response;
  try {
    resp = await fetch(`${apiBase}/v1/account/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    fail({
      code: "NETWORK_ERROR",
      message: `Could not reach the Wraps API at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
      suggestion:
        "Check your network connection and the API URL (WRAPS_API_URL), then run the command again.",
    });
    return;
  }

  if (!resp.ok) {
    const body: unknown = await resp.json().catch(() => null);
    fail(
      describeHttpFailure(
        resp.status,
        apiMessageOf(body),
        apiBase,
        loginCommand
      )
    );
    return;
  }

  const payload = parseHealthPayload(await resp.json().catch(() => null));
  if (!payload) {
    fail({
      code: "API_ERROR",
      message:
        "The Wraps API returned a health response this CLI does not understand.",
      suggestion:
        "Upgrade the wraps CLI to the latest version and run the command again. If it keeps failing, contact Wraps support.",
    });
    return;
  }

  if (isJsonMode()) {
    jsonSuccess(COMMAND, {
      status: payload.status,
      checkedAt: payload.checkedAt,
      accounts: payload.accounts,
    });
    return;
  }

  renderHuman(payload);
}
