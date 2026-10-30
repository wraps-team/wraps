/**
 * `wraps email inbound list|get` — the parsed inbound emails the customer's S3
 * inbound bucket holds, over GET /v1/email/inbound and
 * GET /v1/email/inbound/:emailId (apps/api/src/routes/inbound-emails.ts).
 *
 * Read-only. Nothing is stored in Wraps; the API reads the bucket live.
 *
 * Pattern: commands/email/suppressions.ts. Every error goes through emitError(),
 * which prints the JSON envelope (or a clack message in human mode) and sets
 * process.exitCode = 1. Local checks run before any request is made.
 *
 * Ordering: results come in S3 key order, not received time, so the newest
 * email is not necessarily first.
 *
 * Pagination: the cursor is opaque. It names the account the next page starts
 * in and that account's S3 token, so repeat --account with --cursor. A page
 * can be empty while nextCursor is set (pages close on S3 tokens and span
 * accounts), so keep following nextCursor until it is null.
 *
 * Attachments are metadata only. The API has no route that downloads them.
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

export type InboundEmailsListOptions = {
  account?: string;
  limit?: string;
  cursor?: string;
  json?: boolean;
  token?: string;
  region?: string;
};

export type InboundEmailsGetOptions = {
  emailId?: string;
  account?: string;
  json?: boolean;
  token?: string;
  region?: string;
};

type Failure = { code: string; message: string; suggestion: string };
type Parsed<T> = { ok: true; value: T } | { ok: false; failure: Failure };
type Target = { apiBase: string; token: string };
type Body = Record<string, unknown>;
type Outcome = { ok: true; body: Body } | { ok: false; failure: Failure };

type Address = { address: string; name: string };

type InboundSummary = {
  awsAccountId: string;
  emailId: string;
  from: Address;
  to: Address[];
  subject: string;
  receivedAt: string;
  hasAttachments: boolean;
  attachmentCount: number;
  spamVerdict: string | null;
  virusVerdict: string | null;
};

type InboundAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  s3Key: string;
  contentDisposition: string | null;
  cid: string | null;
};

type InboundDetail = {
  awsAccountId: string;
  emailId: string;
  messageId: string;
  from: Address;
  to: Address[];
  cc: Address[];
  subject: string;
  date: string;
  html: string | null;
  htmlTruncated: boolean;
  text: string | null;
  headers: Record<string, unknown>;
  attachments: InboundAttachment[];
  spamVerdict: string | null;
  virusVerdict: string | null;
  rawS3Key: string;
  receivedAt: string;
};

const LIST_COMMAND = "email.inbound.list";
const GET_COMMAND = "email.inbound.get";
const LIST_USAGE = "wraps email inbound list";
const GET_USAGE = "wraps email inbound get <emailId>";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_CURSOR_LENGTH = 8192;
const MAX_ACCOUNT_ID_LENGTH = 128;
const DIGITS_ONLY = /^\d+$/;

const ORDER_NOTE =
  "Emails are in S3 key order, not received time, so the newest is not necessarily first.";
const DENIED_SUGGESTION =
  "Their AWS role cannot read the inbound bucket, so these accounts were skipped. Run `wraps platform update-role` to refresh the role's permissions, then retry.";
const UNREACHABLE_SUGGESTION =
  "Wraps could not read these accounts' inbound buckets, so they were skipped. Run `wraps email health` to see each account's status, then retry.";

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

function parseAccount(value: unknown): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  // A flag given with no value arrives from the parser as `true`.
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > MAX_ACCOUNT_ID_LENGTH
  ) {
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: `--account needs an awsAccountId of up to ${MAX_ACCOUNT_ID_LENGTH} characters`,
        suggestion: `Copy an awsAccountId from an entry of \`${LIST_USAGE} --json\` into --account, or omit --account.`,
      },
    };
  }
  return { ok: true, value };
}

function parseLimit(value: string | undefined): Parsed<number | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  const raw = String(value);
  const number = Number(raw);
  if (!DIGITS_ONLY.test(raw) || number < 1 || number > MAX_LIMIT) {
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: `--limit must be a whole number from 1 to ${MAX_LIMIT}, got "${raw}"`,
        suggestion: `Run: ${LIST_USAGE} --limit ${DEFAULT_LIMIT}`,
      },
    };
  }
  return { ok: true, value: number };
}

function parseCursor(value: unknown): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > MAX_CURSOR_LENGTH
  ) {
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: "--cursor needs the nextCursor value from the previous page",
        suggestion: `Run \`${LIST_USAGE}\`, then pass its nextCursor as --cursor <value>.`,
      },
    };
  }
  return { ok: true, value };
}

/** Maps a non-2xx response to a failure. `action` picks the hints. */
function httpFailure(
  action: "list" | "get",
  status: number,
  text: string
): Failure {
  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message: `The API rejected the credentials (${text})`,
      suggestion:
        "Run: wraps auth login, or pass --token <api-key> / set WRAPS_API_KEY.",
    };
  }
  if (status === 400) {
    return {
      code: "VALIDATION_FAILED",
      message: text,
      suggestion:
        action === "list"
          ? "Pass the nextCursor value from the previous page unchanged as --cursor, or omit --cursor to start from the first page."
          : `Check the emailId, then re-run: ${GET_USAGE}`,
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: text,
      suggestion:
        "This API key is not allowed to read inbound email. Use a key from an organization that has it, then retry.",
    };
  }
  if (status === 404) {
    if (action === "list") {
      return {
        code: "NOT_FOUND",
        message: text,
        suggestion:
          "--account must be the awsAccountId of an account in this organization. Run `wraps email health` to list the account ids, or omit --account.",
      };
    }
    return {
      code: "NOT_FOUND",
      message: text,
      suggestion:
        "No inbound email with that emailId was found in the accounts this key can read. Run `wraps email inbound list --json` to find emailIds. If you passed --account, it must be an awsAccountId in this organization (`wraps email health` lists them).",
    };
  }
  if (status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message: text,
      suggestion: "Check --account, --limit and --cursor, then retry.",
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message: text,
      suggestion: "Too many requests. Wait a minute, then retry.",
    };
  }
  if (status >= 500) {
    return {
      code: "API_ERROR",
      message: text,
      suggestion: `The Wraps API returned HTTP ${status}. Retry shortly. If it keeps failing, include this message in your report.`,
    };
  }
  return {
    code: "API_ERROR",
    message: text,
    suggestion: "The API rejected the request. Check the arguments and retry.",
  };
}

async function resolveTarget(
  command: string,
  token: string | undefined
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

async function callApi(
  target: Target,
  path: string,
  query: URLSearchParams,
  onFailure: (status: number, text: string) => Failure
): Promise<Outcome> {
  const qs = query.toString();
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

// Fixed output shapes. Explicit field lists keep the JSON keys stable even if
// the route later adds fields.
function summaryJson(email: InboundSummary): Record<string, unknown> {
  return {
    awsAccountId: email.awsAccountId,
    emailId: email.emailId,
    from: email.from,
    to: email.to,
    subject: email.subject,
    receivedAt: email.receivedAt,
    hasAttachments: email.hasAttachments,
    attachmentCount: email.attachmentCount,
    spamVerdict: email.spamVerdict,
    virusVerdict: email.virusVerdict,
  };
}

function attachmentJson(a: InboundAttachment): Record<string, unknown> {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    s3Key: a.s3Key,
    contentDisposition: a.contentDisposition,
    cid: a.cid,
  };
}

function detailJson(email: InboundDetail): Record<string, unknown> {
  return {
    awsAccountId: email.awsAccountId,
    emailId: email.emailId,
    messageId: email.messageId,
    from: email.from,
    to: email.to,
    cc: email.cc,
    subject: email.subject,
    date: email.date,
    receivedAt: email.receivedAt,
    html: email.html,
    htmlTruncated: email.htmlTruncated,
    text: email.text,
    headers: email.headers,
    attachments: email.attachments.map(attachmentJson),
    spamVerdict: email.spamVerdict,
    virusVerdict: email.virusVerdict,
    rawS3Key: email.rawS3Key,
  };
}

/** Pads or cuts a cell to a fixed width so the table columns line up. */
function cell(value: string | null | undefined, width: number): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text === "") {
    return "—".padEnd(width);
  }
  if (text.length > width) {
    return `${text.slice(0, width - 1)}…`;
  }
  return text.padEnd(width);
}

function formatAddress(address: Address): string {
  return address.name
    ? `${address.name} <${address.address}>`
    : address.address;
}

function formatAddresses(addresses: Address[]): string {
  return addresses.length > 0 ? addresses.map(formatAddress).join(", ") : "—";
}

function kv(label: string, value: string): string {
  return `${pc.dim(label.padEnd(16))} ${value}`;
}

/** The exact command for the next page, repeating the filters it came from. */
function nextPageCommand(
  scope: { account?: string; limit?: number },
  cursor: string
): string {
  const parts = [LIST_USAGE];
  if (scope.account !== undefined) {
    parts.push(`--account ${scope.account}`);
  }
  if (scope.limit !== undefined) {
    parts.push(`--limit ${scope.limit}`);
  }
  parts.push(`--cursor ${cursor}`);
  return parts.join(" ");
}

type ListView = {
  data: InboundSummary[];
  denied: string[];
  unreachable: string[];
  nextCursor: string | null;
  account: string | undefined;
  limit: number | undefined;
};

function printListHuman(view: ListView): void {
  const { data, denied, unreachable, nextCursor } = view;
  if (data.length > 0) {
    const COL = { id: 24, from: 28, subject: 36, received: 24, att: 11 };
    const header =
      pc.bold("Email ID".padEnd(COL.id)) +
      "  " +
      pc.bold("From".padEnd(COL.from)) +
      "  " +
      pc.bold("Subject".padEnd(COL.subject)) +
      "  " +
      pc.bold("Received".padEnd(COL.received)) +
      "  " +
      pc.bold("Attachments");
    const rows = data.map(
      (email) =>
        `${cell(email.emailId, COL.id)}  ${cell(email.from?.address, COL.from)}  ${cell(email.subject, COL.subject)}  ${cell(email.receivedAt, COL.received)}  ${cell(String(email.attachmentCount ?? 0), COL.att)}`
    );
    note(
      [header, ...rows].join("\n"),
      `Inbound emails: ${data.length} on this page. ${ORDER_NOTE}`
    );
  } else if (nextCursor === null) {
    log.info("No inbound emails match this request.");
  }

  if (denied.length > 0) {
    log.warn(
      `No permission on ${denied.length} account(s): ${denied.join(", ")}. They were skipped.`
    );
  }
  if (unreachable.length > 0) {
    log.warn(
      `Could not read ${unreachable.length} account(s): ${unreachable.join(", ")}. They were skipped.`
    );
  }
  if (denied.length > 0) {
    log.info(DENIED_SUGGESTION);
  }
  if (unreachable.length > 0) {
    log.info(UNREACHABLE_SUGGESTION);
  }

  if (nextCursor !== null) {
    if (data.length === 0) {
      log.info(
        "This page is empty, but more emails follow. A page can be empty while nextCursor is set, so run the next page command below."
      );
    }
    log.info(
      `Next page: ${nextPageCommand({ account: view.account, limit: view.limit }, nextCursor)}`
    );
  } else if (data.length > 0) {
    log.info("Last page: no nextCursor.");
  }
}

function printDetailHuman(email: InboundDetail): void {
  const lines = [
    kv("Email ID:", email.emailId),
    kv("Message ID:", email.messageId ?? pc.dim("—")),
    kv("From:", email.from ? formatAddress(email.from) : pc.dim("—")),
    kv("To:", formatAddresses(email.to ?? [])),
    ...((email.cc ?? []).length > 0
      ? [kv("Cc:", formatAddresses(email.cc))]
      : []),
    kv("Subject:", email.subject || pc.dim("—")),
    kv("Date:", email.date || pc.dim("—")),
    kv("Received:", email.receivedAt),
    kv("Account:", email.awsAccountId),
    kv("Spam:", email.spamVerdict ?? pc.dim("—")),
    kv("Virus:", email.virusVerdict ?? pc.dim("—")),
  ];
  note(lines.join("\n"), `Inbound email — ${email.subject || email.emailId}`);

  if (email.htmlTruncated) {
    log.warn(
      "htmlTruncated: true. The HTML body was longer than 200 KB when the email arrived, so only a prefix was kept. The html field is incomplete markup."
    );
  }

  printBodyHuman(email);
  printAttachmentsHuman(email.attachments ?? []);
}

function printBodyHuman(email: InboundDetail): void {
  if (email.text !== null && email.text !== undefined) {
    note(email.text, "Text body");
  } else if (email.html !== null && email.html !== undefined) {
    log.info(
      `This email has an HTML part and no plain-text part. Run \`${GET_USAGE} --json\` to read its html field.`
    );
  } else {
    log.info("This email has no text or HTML body.");
  }
}

function printAttachmentsHuman(attachments: InboundAttachment[]): void {
  if (attachments.length === 0) {
    log.info("No attachments.");
    return;
  }
  note(
    attachments
      .map((a) => `${a.filename}  ${a.contentType}  ${a.size} bytes`)
      .join("\n"),
    `Attachments: ${attachments.length} (metadata only; the API cannot download their contents)`
  );
}

export async function inboundEmailsList(
  options: InboundEmailsListOptions
): Promise<void> {
  const command = LIST_COMMAND;

  const account = parseAccount(options.account);
  if (!account.ok) {
    emitError(command, account.failure);
    return;
  }
  const limit = parseLimit(options.limit);
  if (!limit.ok) {
    emitError(command, limit.failure);
    return;
  }
  const cursor = parseCursor(options.cursor);
  if (!cursor.ok) {
    emitError(command, cursor.failure);
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }

  const query = new URLSearchParams();
  if (account.value !== undefined) {
    query.set("awsAccountId", account.value);
  }
  if (limit.value !== undefined) {
    query.set("limit", String(limit.value));
  }
  if (cursor.value !== undefined) {
    query.set("cursor", cursor.value);
  }

  const outcome = await callApi(
    target,
    "/v1/email/inbound",
    query,
    (status, text) => httpFailure("list", status, text)
  );
  if (!outcome.ok) {
    emitError(command, outcome.failure);
    return;
  }

  const body = outcome.body;
  const data = Array.isArray(body.data) ? (body.data as InboundSummary[]) : [];
  const denied = Array.isArray(body.deniedAccountIds)
    ? (body.deniedAccountIds as string[])
    : [];
  const unreachable = Array.isArray(body.unreachableAccountIds)
    ? (body.unreachableAccountIds as string[])
    : [];
  const nextCursor =
    typeof body.nextCursor === "string" ? body.nextCursor : null;

  if (isJsonMode()) {
    jsonSuccess(command, {
      data: data.map(summaryJson),
      nextCursor,
      deniedAccountIds: denied,
      unreachableAccountIds: unreachable,
    });
    return;
  }

  printListHuman({
    data,
    denied,
    unreachable,
    nextCursor,
    account: account.value,
    limit: limit.value,
  });
}

export async function inboundEmailsGet(
  options: InboundEmailsGetOptions
): Promise<void> {
  const command = GET_COMMAND;

  if (typeof options.emailId !== "string" || options.emailId.trim() === "") {
    emitError(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Missing emailId",
      suggestion: `Usage: ${GET_USAGE}`,
    });
    return;
  }
  const account = parseAccount(options.account);
  if (!account.ok) {
    emitError(command, account.failure);
    return;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }

  const query = new URLSearchParams();
  if (account.value !== undefined) {
    query.set("awsAccountId", account.value);
  }

  const outcome = await callApi(
    target,
    `/v1/email/inbound/${encodeURIComponent(options.emailId)}`,
    query,
    (status, text) => httpFailure("get", status, text)
  );
  if (!outcome.ok) {
    emitError(command, outcome.failure);
    return;
  }

  const email = outcome.body as unknown as InboundDetail;

  if (isJsonMode()) {
    jsonSuccess(command, detailJson(email));
    return;
  }

  printDetailHuman(email);
}
