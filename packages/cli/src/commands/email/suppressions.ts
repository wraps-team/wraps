/**
 * `wraps email suppressions` — the SES account-level suppression list, over the
 * /v1/suppressions API (apps/api/src/routes/suppressions.ts).
 *
 * Pattern: commands/email/logs.ts and commands/segments/segments.ts. Every error
 * goes through emitError(), which prints the JSON envelope (or a clack message
 * in human mode) and sets process.exitCode = 1. Local checks run before any
 * request is made.
 *
 * `awsAccountId` is the Wraps id of a connected account, carried on every list
 * entry. It is not the 12-digit AWS account number.
 *
 * Cursor: the value is opaque and is passed back unchanged. It holds one SES
 * token per account for the --account/--reason filter it came from, so repeat
 * those flags with --cursor. SES can return a token on the last non-empty page,
 * so a page can be empty while hasMore is true.
 *
 * Removing an address is destructive: --yes is required, and --dry-run previews
 * with no request. Complaint suppressions also need --acknowledge-complaint.
 * That flag is sent to the API only when the user passed it.
 */

import { log, note } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../utils/shared/api-target.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../utils/shared/json-output.js";

export type SuppressionsListOptions = {
  account?: string;
  reason?: string;
  limit?: string;
  cursor?: string;
  json?: boolean;
  token?: string;
  region?: string;
};

export type SuppressionsRemoveOptions = {
  email?: string;
  account?: string;
  acknowledgeComplaint?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  token?: string;
  region?: string;
};

type Failure = { code: string; message: string; suggestion: string };
type Parsed<T> = { ok: true; value: T } | { ok: false; failure: Failure };
type Target = { apiBase: string; token: string };
type Body = Record<string, unknown>;
type Outcome = { ok: true; body: Body } | { ok: false; failure: Failure };

type SuppressedEntry = {
  email: string;
  reason: string;
  lastUpdated: string;
  awsAccountId: string;
  region: string;
};

const LIST_COMMAND = "email.suppressions.list";
const REMOVE_COMMAND = "email.suppressions.remove";
const LIST_USAGE = "wraps email suppressions list --json";
const REMOVE_USAGE =
  "wraps email suppressions remove <email> --account <awsAccountId> --yes";

const MAX_LIMIT = 100;
const MAX_CURSOR_LENGTH = 8192;
const MAX_EMAIL_LENGTH = 320;
const MAX_ACCOUNT_ID_LENGTH = 128;
const DIGITS_ONLY = /^\d+$/;
const PERMISSION_TEXT = /update-role|permission/i;

const DENIED_SUGGESTION =
  "Wraps cannot read or change the suppression list on these accounts: their AWS role lacks SES permission. Run `wraps platform update-role` to refresh the permissions, then retry.";
const UNREACHABLE_SUGGESTION =
  "Wraps could not reach these accounts (an AWS error, or the assume-role failed). Run `wraps email health` to see each account's SES status, then retry.";

function emitError(command: string, failure: Failure): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(command, failure);
    return;
  }
  log.error(failure.message);
  log.info(failure.suggestion);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function messageOf(body: Body, status: number): string {
  const value = body.error;
  return typeof value === "string" && value.length > 0
    ? value
    : `HTTP ${status}`;
}

/** A flag given with no value arrives from the parser as `true`, not a string. */
function optionalText(
  name: string,
  value: unknown,
  suggestion: string
): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: `${name} needs a value`,
        suggestion,
      },
    };
  }
  return { ok: true, value };
}

function removeCommand(email: string, account: string, ack: boolean): string {
  return `wraps email suppressions remove ${email} --account ${account} --yes${ack ? " --acknowledge-complaint" : ""}`;
}

function nextPageCommand(
  scope: { account?: string; reason?: string; limit?: string },
  cursor: string
): string {
  const parts = ["wraps email suppressions list"];
  if (scope.account) {
    parts.push(`--account ${scope.account}`);
  }
  if (scope.reason) {
    parts.push(`--reason ${scope.reason}`);
  }
  if (scope.limit) {
    parts.push(`--limit ${scope.limit}`);
  }
  parts.push(`--cursor ${cursor}`);
  return parts.join(" ");
}

function accountSuggestion(
  denied: string[],
  unreachable: string[]
): string | null {
  const parts: string[] = [];
  if (denied.length > 0) {
    parts.push(DENIED_SUGGESTION);
  }
  if (unreachable.length > 0) {
    parts.push(UNREACHABLE_SUGGESTION);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Maps a non-2xx response to a failure. `action` picks the hints: list and
 * remove differ on 400, 403 and 404.
 */
function httpFailure(
  action: "list" | "remove",
  status: number,
  text: string,
  remove?: { email: string; account: string; ack: boolean }
): Failure {
  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message: `The API rejected the credentials (${text})`,
      suggestion:
        "Run `wraps auth login`, or pass a valid key with --token or WRAPS_API_KEY.",
    };
  }
  if (status === 403) {
    if (PERMISSION_TEXT.test(text)) {
      return {
        code: "FORBIDDEN",
        message: text,
        suggestion:
          "Refresh the Wraps role's permissions with `wraps platform update-role`, then retry.",
      };
    }
    const need = action === "list" ? "read" : "write";
    return {
      code: "FORBIDDEN",
      message: text,
      suggestion: `Your role needs awsAccounts ${need} access for this command. Ask an org owner or admin to grant it, then retry.`,
    };
  }
  if (status === 400) {
    if (action === "list") {
      return {
        code: "VALIDATION_FAILED",
        message: text,
        suggestion:
          "Pass the nextCursor value from the previous page unchanged, with the same --account and --reason, or start again without --cursor.",
      };
    }
    const retry = remove
      ? removeCommand(remove.email, remove.account, remove.ack)
      : REMOVE_USAGE;
    return {
      code: "VALIDATION_FAILED",
      message: text,
      suggestion: `Check the arguments, then re-run: ${retry}`,
    };
  }
  if (status === 404) {
    if (action === "list") {
      return {
        code: "NOT_FOUND",
        message: text,
        suggestion: `Run \`${LIST_USAGE}\` and copy an awsAccountId from an entry into --account, or omit --account to list every account.`,
      };
    }
    return {
      code: "NOT_FOUND",
      message: text,
      suggestion: `Run \`${LIST_USAGE}\` to check the address is on the list and that --account is the awsAccountId of its entry.`,
    };
  }
  if (status === 409) {
    const retry = remove
      ? removeCommand(remove.email, remove.account, true)
      : REMOVE_USAGE;
    return {
      code: "CONFLICT",
      message:
        "This address is suppressed because of a spam complaint. Removing a complaint suppression risks your sending reputation, because Wraps would send to an address that complained. Nothing was removed.",
      suggestion: `Only if you have confirmed it is safe, re-run with --acknowledge-complaint: ${retry}`,
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message: text,
      suggestion: "Wait a minute, then retry.",
    };
  }
  if (status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message: text,
      suggestion: "Check the flag values, then retry.",
    };
  }
  if (status >= 500) {
    return {
      code: "API_ERROR",
      message: text,
      suggestion:
        action === "list"
          ? "The Wraps API failed. Retry shortly; to find a failing account, run `wraps email health`."
          : `The Wraps API failed. Retry shortly; check the address is still listed with \`${LIST_USAGE}\` first.`,
    };
  }
  return {
    code: "API_ERROR",
    message: text,
    suggestion: "The API rejected the request. Check the arguments and retry.",
  };
}

async function callApi(request: {
  target: Target;
  method: "GET" | "DELETE";
  path: string;
  query: URLSearchParams;
  onFailure: (status: number, text: string) => Failure;
}): Promise<Outcome> {
  const { target, method, path, query, onFailure } = request;
  const qs = query.toString();
  const url = `${target.apiBase}${path}${qs ? `?${qs}` : ""}`;

  let resp: Awaited<ReturnType<typeof fetch>>;
  try {
    resp = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${target.token}` },
    });
  } catch (err) {
    return {
      ok: false,
      failure: {
        code: "NETWORK_ERROR",
        message: `Could not reach the Wraps API (${errorText(err)})`,
        suggestion:
          "Check your network connection and WRAPS_API_URL, then retry.",
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
      failure: onFailure(resp.status, messageOf(body, resp.status)),
    };
  }
  return { ok: true, body };
}

async function connect(
  command: string,
  token?: string
): Promise<Target | null> {
  const check = checkApiTarget(await resolveApiTarget({ token }));
  if (!check.ok) {
    emitError(command, {
      code: "NOT_AUTHENTICATED",
      message: check.reason,
      suggestion: check.suggestion,
    });
    return null;
  }
  return { apiBase: check.target.apiBase, token: check.target.token };
}

type SuppressionsListBody = {
  entries?: SuppressedEntry[];
  nextCursor?: string;
  hasMore?: boolean;
  deniedAccountIds?: string[];
  unreachableAccountIds?: string[];
};

function formatEntry(entry: SuppressedEntry): string {
  return `${entry.email}  ${entry.reason}  ${entry.awsAccountId}  ${entry.lastUpdated}`;
}

/** wraps email suppressions list [--account <awsAccountId>] [--reason bounce|complaint] */
export async function suppressionsList(
  options: SuppressionsListOptions
): Promise<void> {
  const command = LIST_COMMAND;

  const account = optionalText(
    "--account",
    options.account,
    `Pass the awsAccountId of an entry from \`${LIST_USAGE}\`, or omit --account.`
  );
  if (!account.ok) {
    emitError(command, account.failure);
    return;
  }
  if (
    account.value !== undefined &&
    account.value.length > MAX_ACCOUNT_ID_LENGTH
  ) {
    emitError(command, {
      code: "INVALID_FLAG_VALUE",
      message: "--account is longer than 128 characters",
      suggestion: `Copy the awsAccountId exactly from \`${LIST_USAGE}\`.`,
    });
    return;
  }

  let reason: "BOUNCE" | "COMPLAINT" | undefined;
  if (options.reason !== undefined) {
    const raw =
      typeof options.reason === "string" ? options.reason.toLowerCase() : "";
    if (raw !== "bounce" && raw !== "complaint") {
      emitError(command, {
        code: "INVALID_FLAG_VALUE",
        message: "--reason must be bounce or complaint",
        suggestion:
          "Run: wraps email suppressions list --reason bounce (or --reason complaint)",
      });
      return;
    }
    reason = raw === "bounce" ? "BOUNCE" : "COMPLAINT";
  }

  let limit: number | undefined;
  if (options.limit !== undefined) {
    const raw = String(options.limit);
    const value = Number(raw);
    if (!DIGITS_ONLY.test(raw) || value < 1 || value > MAX_LIMIT) {
      emitError(command, {
        code: "INVALID_FLAG_VALUE",
        message: `--limit must be a whole number from 1 to ${MAX_LIMIT}`,
        suggestion: "Run: wraps email suppressions list --limit 50",
      });
      return;
    }
    limit = value;
  }

  let cursor: string | undefined;
  if (options.cursor !== undefined) {
    if (
      typeof options.cursor !== "string" ||
      options.cursor.trim() === "" ||
      options.cursor.length > MAX_CURSOR_LENGTH
    ) {
      emitError(command, {
        code: "INVALID_FLAG_VALUE",
        message: "--cursor needs the nextCursor value from the previous page",
        suggestion: `Run \`${LIST_USAGE}\`, then pass its nextCursor as --cursor <value>.`,
      });
      return;
    }
    cursor = options.cursor;
  }

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }

  const query = new URLSearchParams();
  if (account.value !== undefined) {
    query.set("awsAccountId", account.value);
  }
  if (reason !== undefined) {
    query.set("reason", reason);
  }
  if (limit !== undefined) {
    query.set("limit", String(limit));
  }
  if (cursor !== undefined) {
    query.set("cursor", cursor);
  }

  const outcome = await callApi({
    target,
    method: "GET",
    path: "/v1/suppressions",
    query,
    onFailure: (status, text) => httpFailure("list", status, text),
  });
  if (!outcome.ok) {
    emitError(command, outcome.failure);
    return;
  }

  const body = outcome.body as SuppressionsListBody;
  const entries = Array.isArray(body.entries) ? body.entries : [];
  const denied = Array.isArray(body.deniedAccountIds)
    ? body.deniedAccountIds
    : [];
  const unreachable = Array.isArray(body.unreachableAccountIds)
    ? body.unreachableAccountIds
    : [];
  const hasMore = body.hasMore === true;
  const nextCursor =
    typeof body.nextCursor === "string" ? body.nextCursor : null;
  const suggestion = accountSuggestion(denied, unreachable);

  if (isJsonMode()) {
    jsonSuccess(command, {
      entries,
      nextCursor,
      hasMore,
      deniedAccountIds: denied,
      unreachableAccountIds: unreachable,
      suggestion,
    });
    return;
  }

  if (entries.length === 0) {
    log.info("No suppressed addresses match this filter.");
  } else {
    note(
      entries.map(formatEntry).join("\n"),
      `${entries.length} suppressed address(es)`
    );
  }

  if (denied.length > 0) {
    log.warn(
      `No permission on ${denied.length} account(s): ${denied.join(", ")}. They were skipped.`
    );
  }
  if (unreachable.length > 0) {
    log.warn(
      `Could not reach ${unreachable.length} account(s): ${unreachable.join(", ")}. They were skipped.`
    );
  }
  if (suggestion) {
    log.info(suggestion);
  }

  if (hasMore && nextCursor !== null) {
    log.info(
      `Next page: ${nextPageCommand({ account: account.value, reason: reason?.toLowerCase(), limit: limit === undefined ? undefined : String(limit) }, nextCursor)}`
    );
    log.info(
      "A page can come back empty while hasMore is true (SES reports a token on the last full page). Keep following nextCursor until hasMore is false."
    );
  }
}

/** wraps email suppressions remove <email> --account <awsAccountId> --yes */
export async function suppressionsRemove(
  options: SuppressionsRemoveOptions
): Promise<void> {
  const command = REMOVE_COMMAND;

  if (typeof options.email !== "string" || options.email.trim() === "") {
    emitError(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Missing email address",
      suggestion: `Usage: ${REMOVE_USAGE}`,
    });
    return;
  }
  const email = options.email.trim();
  if (email.length > MAX_EMAIL_LENGTH) {
    emitError(command, {
      code: "VALIDATION_FAILED",
      message: "The email address is longer than 320 characters",
      suggestion: `Check the address against \`${LIST_USAGE}\`.`,
    });
    return;
  }
  // The route takes the address as one path segment. A slash cannot survive
  // that, so refuse it here rather than send a different path.
  if (email.includes("/")) {
    emitError(command, {
      code: "VALIDATION_FAILED",
      message:
        'The email address contains "/", which cannot be sent as one URL path segment',
      suggestion: `Check the address with \`${LIST_USAGE}\`. An address that contains "/" cannot be removed with this command.`,
    });
    return;
  }

  const account = optionalText(
    "--account",
    options.account,
    `Find the entry with \`${LIST_USAGE}\`, then re-run with its awsAccountId: ${REMOVE_USAGE}`
  );
  if (!account.ok || account.value === undefined) {
    emitError(command, {
      code: "VALIDATION_FAILED",
      message: "Missing --account <awsAccountId>",
      suggestion: `Find the entry with \`${LIST_USAGE}\`, then re-run with its awsAccountId: ${REMOVE_USAGE}`,
    });
    return;
  }
  const accountId = account.value;
  if (accountId.length > MAX_ACCOUNT_ID_LENGTH) {
    emitError(command, {
      code: "INVALID_FLAG_VALUE",
      message: "--account is longer than 128 characters",
      suggestion: `Copy the awsAccountId exactly from \`${LIST_USAGE}\`.`,
    });
    return;
  }

  const ack = options.acknowledgeComplaint === true;

  // --dry-run makes no request, so it needs no credentials and no --yes.
  if (options.dryRun) {
    const data = {
      email,
      awsAccountId: accountId,
      dryRun: true,
      wasPresent: null,
    };
    if (isJsonMode()) {
      jsonSuccess(command, data);
      return;
    }
    log.info(
      `Dry run: ${email} would be removed from account ${accountId}. No request was sent.`
    );
    return;
  }

  if (!options.yes) {
    emitError(command, {
      code: "CONFIRMATION_REQUIRED",
      message:
        "Removing an address lets Wraps send to it again. Nothing was removed because --yes was not passed.",
      suggestion: `Re-run with --yes to confirm: ${removeCommand(email, accountId, ack)}`,
    });
    return;
  }

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }

  // confirm=true always; acknowledgedComplaint only when the user passed it.
  const query = new URLSearchParams({
    awsAccountId: accountId,
    confirm: "true",
  });
  if (ack) {
    query.set("acknowledgedComplaint", "true");
  }

  const outcome = await callApi({
    target,
    method: "DELETE",
    path: `/v1/suppressions/${encodeURIComponent(email)}`,
    query,
    onFailure: (status, text) =>
      httpFailure("remove", status, text, { email, account: accountId, ack }),
  });
  if (!outcome.ok) {
    emitError(command, outcome.failure);
    return;
  }

  const wasPresent = outcome.body.wasPresent === true;
  const data = {
    email,
    awsAccountId: accountId,
    dryRun: false,
    wasPresent,
  };
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }
  if (wasPresent) {
    log.success(
      `Removed ${email} from the suppression list of account ${accountId}.`
    );
  } else {
    log.warn(
      `${email} was no longer on the list of account ${accountId}; nothing changed.`
    );
  }
}
