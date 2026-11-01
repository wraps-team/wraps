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
 *
 * Adding addresses is also gated by --yes (--dry-run previews). One address
 * uses POST /v1/suppressions; two or more use POST /v1/suppressions/bulk, which
 * reports each address on its own, so a bulk add can partly fail.
 */

import { readFile } from "node:fs/promises";
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

export type SuppressionsAddOptions = {
  emails?: string[];
  file?: string;
  account?: string;
  reason?: string;
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

type AddReason = "BOUNCE" | "COMPLAINT";
type AddResult = {
  email: string;
  success: boolean;
  alreadyPresent?: boolean;
  error?: string;
};

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
const ADD_COMMAND = "email.suppressions.add";
const ADD_USAGE =
  "wraps email suppressions add <email...> --account <awsAccountId> --reason bounce|complaint --yes";

const MAX_BATCH = 100;
const MAX_LIMIT = 100;
const MAX_CURSOR_LENGTH = 8192;
const MAX_EMAIL_LENGTH = 320;
const MAX_ACCOUNT_ID_LENGTH = 128;
const DIGITS_ONLY = /^\d+$/;
const LINE_BREAK = /\r?\n/;
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
  action: "list" | "remove" | "add",
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
    let suggestion: string;
    if (action === "list") {
      suggestion =
        "The Wraps API failed. Retry shortly; to find a failing account, run `wraps email health`.";
    } else if (action === "add") {
      suggestion =
        "The Wraps API failed. Retry shortly; adding an address twice is safe, so re-running the same command is fine.";
    } else {
      suggestion = `The Wraps API failed. Retry shortly; check the address is still listed with \`${LIST_USAGE}\` first.`;
    }
    return { code: "API_ERROR", message: text, suggestion };
  }
  return {
    code: "API_ERROR",
    message: text,
    suggestion: "The API rejected the request. Check the arguments and retry.",
  };
}

async function callApi(request: {
  target: Target;
  method: "GET" | "DELETE" | "POST";
  path: string;
  query: URLSearchParams;
  body?: unknown;
  onFailure: (status: number, text: string) => Failure;
}): Promise<Outcome> {
  const { target, method, path, query, body: payload, onFailure } = request;
  const qs = query.toString();
  const url = `${target.apiBase}${path}${qs ? `?${qs}` : ""}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${target.token}`,
  };
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let resp: Awaited<ReturnType<typeof fetch>>;
  try {
    resp = await fetch(url, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
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

/** Add-specific hints for 400 and 404; every other status uses httpFailure("add"). */
function addFailure(status: number, text: string): Failure {
  if (status === 400) {
    return {
      code: "VALIDATION_FAILED",
      message: text,
      suggestion: `Check the arguments, then re-run: ${ADD_USAGE}`,
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: text,
      suggestion:
        "Check that --account is the awsAccountId of a connected account. `wraps email health` lists each account's SES status.",
    };
  }
  return httpFailure("add", status, text);
}

function undoHint(accountId: string, reason: AddReason): string {
  const ack = reason === "COMPLAINT" ? " --acknowledge-complaint" : "";
  return `wraps email suppressions remove <email> --account ${accountId} --yes${ack}`;
}

/** Trims, drops blanks, and keeps the first spelling of each address (case-insensitive). */
function uniqueAddresses(raw: string[]): string[] {
  const seen = new Map<string, string>();
  for (const item of raw) {
    const email = item.trim();
    if (email !== "" && !seen.has(email.toLowerCase())) {
      seen.set(email.toLowerCase(), email);
    }
  }
  return [...seen.values()];
}

/** One address per line; blank lines and lines starting with # are skipped. */
async function readAddressFile(path: string): Promise<Parsed<string[]>> {
  try {
    const text = await readFile(path, "utf8");
    const lines = text
      .split(LINE_BREAK)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
    return { ok: true, value: lines };
  } catch (err) {
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: `Could not read --file ${path} (${errorText(err)})`,
        suggestion:
          "Check the path, then pass --file <path> to a text file with one address per line.",
      },
    };
  }
}

/** Maps one bulk entry. The API answers in request order, one result per entry. */
function bulkResult(email: string, item: unknown): AddResult {
  if (item !== null && typeof item === "object") {
    const row = item as Record<string, unknown>;
    if (row.success === true) {
      return {
        email,
        success: true,
        alreadyPresent: row.alreadyPresent === true,
      };
    }
    if (row.success === false) {
      return {
        email,
        success: false,
        error:
          typeof row.error === "string"
            ? row.error
            : "Failed to add suppression",
      };
    }
  }
  return {
    email,
    success: false,
    error: "The API returned no result for this address",
  };
}

/** Positional addresses first, then --file lines; deduped and checked against MAX_BATCH. */
async function collectAddresses(
  options: SuppressionsAddOptions
): Promise<Parsed<string[]>> {
  const file = optionalText(
    "--file",
    options.file,
    `Pass --file <path> to a text file with one address per line, or give the addresses as arguments: ${ADD_USAGE}`
  );
  if (!file.ok) {
    return file;
  }
  let fromFile: string[] = [];
  if (file.value !== undefined) {
    const read = await readAddressFile(file.value);
    if (!read.ok) {
      return read;
    }
    fromFile = read.value;
  }

  const fromArgs = Array.isArray(options.emails)
    ? options.emails.filter((item): item is string => typeof item === "string")
    : [];
  const emails = uniqueAddresses([...fromArgs, ...fromFile]);
  if (emails.length === 0) {
    return {
      ok: false,
      failure: {
        code: "MISSING_REQUIRED_FLAG",
        message: "No email addresses given",
        suggestion: `Usage: ${ADD_USAGE}, or pass --file <path>`,
      },
    };
  }
  if (emails.length > MAX_BATCH) {
    return {
      ok: false,
      failure: {
        code: "VALIDATION_FAILED",
        message: `${emails.length} addresses given; one command adds at most ${MAX_BATCH}`,
        suggestion: `Split the list into files of ${MAX_BATCH} or fewer, then run the command once per file with --file <path>.`,
      },
    };
  }
  return { ok: true, value: emails };
}

function parseAccount(raw: unknown): Parsed<string> {
  const account = optionalText(
    "--account",
    raw,
    `Find the awsAccountId with \`${LIST_USAGE}\`, then re-run: ${ADD_USAGE}`
  );
  if (!account.ok) {
    return account;
  }
  if (account.value === undefined) {
    return {
      ok: false,
      failure: {
        code: "VALIDATION_FAILED",
        message: "Missing --account <awsAccountId>",
        suggestion: `Find the awsAccountId with \`${LIST_USAGE}\`, then re-run: ${ADD_USAGE}`,
      },
    };
  }
  if (account.value.length > MAX_ACCOUNT_ID_LENGTH) {
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: "--account is longer than 128 characters",
        suggestion: `Copy the awsAccountId exactly from \`${LIST_USAGE}\`.`,
      },
    };
  }
  return { ok: true, value: account.value };
}

function parseAddReason(raw: unknown): Parsed<AddReason> {
  const text = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (text === "bounce") {
    return { ok: true, value: "BOUNCE" };
  }
  if (text === "complaint") {
    return { ok: true, value: "COMPLAINT" };
  }
  return {
    ok: false,
    failure: {
      code: raw === undefined ? "MISSING_REQUIRED_FLAG" : "INVALID_FLAG_VALUE",
      message: "--reason must be bounce or complaint",
      suggestion: `Re-run with --reason bounce or --reason complaint: ${ADD_USAGE}`,
    },
  };
}

/** One address uses the single route; two or more use the bulk route. */
async function sendAdds(
  target: Target,
  accountId: string,
  reason: AddReason,
  emails: string[]
): Promise<Parsed<AddResult[]>> {
  const only = emails.length === 1 ? emails[0] : undefined;
  if (only !== undefined) {
    const outcome = await callApi({
      target,
      method: "POST",
      path: "/v1/suppressions",
      query: new URLSearchParams(),
      body: { awsAccountId: accountId, email: only, reason },
      onFailure: addFailure,
    });
    if (!outcome.ok) {
      return outcome;
    }
    return {
      ok: true,
      value: [
        {
          email: only,
          success: true,
          alreadyPresent: outcome.body.alreadyPresent === true,
        },
      ],
    };
  }

  const outcome = await callApi({
    target,
    method: "POST",
    path: "/v1/suppressions/bulk",
    query: new URLSearchParams(),
    body: {
      entries: emails.map((email) => ({
        awsAccountId: accountId,
        email,
        reason,
      })),
    },
    onFailure: addFailure,
  });
  if (!outcome.ok) {
    return outcome;
  }
  const rows: unknown[] = Array.isArray(outcome.body.results)
    ? outcome.body.results
    : [];
  return {
    ok: true,
    value: emails.map((email, index) => bulkResult(email, rows[index])),
  };
}

function printAddHuman(
  accountId: string,
  reason: AddReason,
  results: AddResult[],
  counts: { added: number; alreadyPresent: number; failed: number }
): void {
  for (const r of results) {
    if (!r.success) {
      log.error(`${r.email}: ${r.error ?? "Failed to add suppression"}`);
    } else if (r.alreadyPresent === true) {
      log.info(
        `${r.email} was already suppressed on account ${accountId}; nothing changed.`
      );
    } else {
      log.success(
        `Suppressed ${r.email} on account ${accountId} as ${reason}.`
      );
    }
  }
  log.info(
    `${counts.added} added, ${counts.alreadyPresent} already suppressed, ${counts.failed} failed.`
  );
  if (counts.added > 0) {
    log.info(`Undo with: ${undoHint(accountId, reason)}`);
  }
}

/**
 * wraps email suppressions add <email...> --account <awsAccountId> --reason bounce|complaint --yes
 *
 * --json data: { awsAccountId, reason: "BOUNCE"|"COMPLAINT", dryRun, results,
 * added, alreadyPresent, failed }. Each result is { email, success } plus
 * alreadyPresent on success or error on failure. Exit code is 1 when any
 * address failed, and the envelope still reports success: true with the counts.
 */
export async function suppressionsAdd(
  options: SuppressionsAddOptions
): Promise<void> {
  const command = ADD_COMMAND;

  const addresses = await collectAddresses(options);
  if (!addresses.ok) {
    emitError(command, addresses.failure);
    return;
  }
  const account = parseAccount(options.account);
  if (!account.ok) {
    emitError(command, account.failure);
    return;
  }
  const parsedReason = parseAddReason(options.reason);
  if (!parsedReason.ok) {
    emitError(command, parsedReason.failure);
    return;
  }
  const emails = addresses.value;
  const accountId = account.value;
  const reason = parsedReason.value;

  // --dry-run makes no request, so it needs no credentials and no --yes.
  if (options.dryRun) {
    const data = {
      awsAccountId: accountId,
      reason,
      dryRun: true,
      emails,
      results: [],
      added: 0,
      alreadyPresent: 0,
      failed: 0,
    };
    if (isJsonMode()) {
      jsonSuccess(command, data);
      return;
    }
    note(
      emails.join("\n"),
      `Dry run: ${emails.length} address(es) on account ${accountId} as ${reason}`
    );
    log.info("No request was sent.");
    return;
  }

  if (!options.yes) {
    const shown = emails.length === 1 ? emails[0] : "<email...>";
    emitError(command, {
      code: "CONFIRMATION_REQUIRED",
      message:
        "Suppressing an address stops Wraps from sending to it. Nothing was added because --yes was not passed.",
      suggestion: `Re-run with --yes to confirm: wraps email suppressions add ${shown} --account ${accountId} --reason ${reason.toLowerCase()} --yes. Undo later with: ${undoHint(accountId, reason)}`,
    });
    return;
  }

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }

  const sent = await sendAdds(target, accountId, reason, emails);
  if (!sent.ok) {
    emitError(command, sent.failure);
    return;
  }
  const results = sent.value;
  const added = results.filter(
    (r) => r.success && r.alreadyPresent !== true
  ).length;
  const alreadyPresent = results.filter(
    (r) => r.success && r.alreadyPresent === true
  ).length;
  const failed = results.filter((r) => !r.success).length;

  if (failed > 0) {
    process.exitCode = 1;
  }
  if (isJsonMode()) {
    jsonSuccess(command, {
      awsAccountId: accountId,
      reason,
      dryRun: false,
      results,
      added,
      alreadyPresent,
      failed,
    });
    return;
  }
  printAddHuman(accountId, reason, results, { added, alreadyPresent, failed });
}
