/**
 * wraps contacts list|get|create|update|delete
 *
 * Thin client over the existing /v1/contacts routes. Authenticates with an API
 * key or session token (the routes accept both). Under --json every call prints
 * exactly one envelope with a dotted command name (contacts.list, ...), and every
 * error path sets process.exitCode = 1.
 *
 * Cursor rule (list): the contacts route is page-based (page + pageSize, no
 * cursor, no nextCursor). --cursor is therefore the page number as a string
 * ("2" = page 2). nextCursor is String(page + 1) while page < totalPages, and
 * null on the last page. --limit maps to pageSize and must be 1..100; the route
 * clamps larger values silently, so the CLI rejects them instead.
 *
 * Identifier rule (get, update, delete): the route accepts a contact UUID, an
 * email, or an externalId in the path. The CLI passes whatever was given,
 * encoded as one path segment. Org scoping is enforced by the server.
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

const CMD = {
  list: "contacts.list",
  get: "contacts.get",
  create: "contacts.create",
  update: "contacts.update",
  delete: "contacts.delete",
} as const;

type CommonOptions = {
  json?: boolean;
  token?: string;
  region?: string;
};

export type ContactsListOptions = CommonOptions & {
  limit?: string;
  cursor?: string;
  emailStatus?: string;
  smsStatus?: string;
  preferredChannel?: string;
  search?: string;
};

export type ContactsGetOptions = CommonOptions & {
  id?: string;
};

export type ContactFieldOptions = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  externalId?: string;
  emailStatus?: string;
  smsStatus?: string;
  preferredChannel?: string;
  topicIds?: string;
  properties?: string;
};

export type ContactsCreateOptions = CommonOptions & ContactFieldOptions;

export type ContactsUpdateOptions = CommonOptions &
  ContactFieldOptions & {
    id?: string;
  };

export type ContactsDeleteOptions = CommonOptions & {
  id?: string;
  yes?: boolean;
  dryRun?: boolean;
};

type Body = Record<string, unknown>;
type CliFailure = { code: string; message: string; suggestion: string };
type Parsed<T> = { ok: true; value: T } | { ok: false; failure: CliFailure };
type Target = { apiBase: string; token: string };
type ApiResult = { ok: true; body: Body } | { ok: false; failure: CliFailure };

// Fields the contacts routes return, in the order the envelope reports them.
const CONTACT_KEYS = [
  "id",
  "externalId",
  "email",
  "phone",
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "emailStatus",
  "smsStatus",
  "preferredChannel",
  "properties",
  "emailsSent",
  "emailsOpened",
  "emailsClicked",
  "smsSent",
  "smsClicked",
  "createdAt",
  "updatedAt",
] as const;

function fail(command: string, failure: CliFailure): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(command, {
      code: failure.code,
      message: failure.message,
      suggestion: failure.suggestion,
    });
    return;
  }
  log.error(`${failure.message}. ${failure.suggestion}`);
}

function invalid(message: string, suggestion: string): Parsed<never> {
  return {
    ok: false,
    failure: { code: "INVALID_FLAG_USAGE", message, suggestion },
  };
}

function missingId(command: string, usage: string): void {
  fail(command, {
    code: "MISSING_REQUIRED_FLAG",
    message: "Missing contact id",
    suggestion: `Usage: wraps ${usage}. The id can be a contact UUID, email, or externalId.`,
  });
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function messageOf(body: Body): string | undefined {
  // Read `message` before `error`: some 409 bodies carry the human text in `message`.
  for (const key of ["message", "error"]) {
    const value = body[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return;
}

async function connect(
  command: string,
  token?: string
): Promise<Target | null> {
  const check = checkApiTarget(await resolveApiTarget({ token }));
  if (!check.ok) {
    fail(command, {
      code: "NOT_AUTHENTICATED",
      message: check.reason,
      suggestion: check.suggestion,
    });
    return null;
  }
  return { apiBase: check.target.apiBase, token: check.target.token };
}

function httpFailure(
  status: number,
  body: Body,
  conflictSuggestion: string
): CliFailure {
  const detail = messageOf(body) ?? `HTTP ${status}`;
  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message: `The API rejected the credentials (${detail})`,
      suggestion:
        "Run `wraps auth login`, or pass a valid key with --token or WRAPS_API_KEY.",
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: detail,
      suggestion:
        "The credentials are valid but cannot access this contact. Check that the key belongs to the organization that owns it, then retry.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: detail,
      suggestion:
        "Check the id: use a contact UUID, email, or externalId. To find the contact, run `wraps contacts list --search <email-or-phone>`.",
    };
  }
  if (status === 409) {
    return {
      code: "CONFLICT",
      message: detail,
      suggestion: conflictSuggestion,
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message: detail,
      suggestion: "Wait a minute, then retry.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message: detail,
      suggestion:
        "Check the flag values: --email-status, --sms-status and --preferred-channel take the listed values, and fields have length limits. Then retry.",
    };
  }
  if (status >= 500) {
    return {
      code: "API_ERROR",
      message: detail,
      suggestion:
        "The Wraps API failed. Retry shortly; if it keeps failing, contact support.",
    };
  }
  return {
    code: "API_ERROR",
    message: detail,
    suggestion: "The API rejected the request. Check the arguments and retry.",
  };
}

async function callApi(
  target: Target,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: {
    query?: URLSearchParams;
    body?: Body;
    conflictSuggestion?: string;
  } = {}
): Promise<ApiResult> {
  const qs = options.query?.toString();
  const url = `${target.apiBase}${path}${qs ? `?${qs}` : ""}`;
  const hasBody = options.body !== undefined;

  let resp: Awaited<ReturnType<typeof fetch>>;
  try {
    resp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${target.token}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
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
      failure: httpFailure(
        resp.status,
        body,
        options.conflictSuggestion ??
          "The value conflicts with an existing record. Check it and retry."
      ),
    };
  }
  return { ok: true, body };
}

type WholeRange = {
  raw: string | undefined;
  flag: string;
  min: number;
  max: number;
  suggestion: string;
};

function parseWhole(range: WholeRange): Parsed<number | undefined> {
  if (range.raw === undefined) {
    return { ok: true, value: undefined };
  }
  const n = Number(range.raw);
  if (!Number.isInteger(n) || n < range.min || n > range.max) {
    return invalid(
      `${range.flag} must be a whole number from ${range.min} to ${range.max}, got "${range.raw}"`,
      range.suggestion
    );
  }
  return { ok: true, value: n };
}

function parseProperties(raw: string | undefined): Parsed<Body | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return invalid(
      `--properties is not valid JSON (${errorText(err)})`,
      `Pass a JSON object, for example --properties '{"plan":"pro"}'.`
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return invalid(
      "--properties must be a JSON object",
      `Pass a JSON object, for example --properties '{"plan":"pro"}'.`
    );
  }
  return { ok: true, value: parsed as Body };
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Builds the request body from the field flags. Only flags that were given are
// sent, so an update never overwrites a field the user did not name.
function buildContactBody(options: ContactFieldOptions): Parsed<Body> {
  const properties = parseProperties(options.properties);
  if (!properties.ok) {
    return properties;
  }
  const body: Body = {};
  const scalars: Record<string, string | undefined> = {
    email: options.email,
    phone: options.phone,
    firstName: options.firstName,
    lastName: options.lastName,
    company: options.company,
    jobTitle: options.jobTitle,
    externalId: options.externalId,
    emailStatus: options.emailStatus,
    smsStatus: options.smsStatus,
    preferredChannel: options.preferredChannel,
  };
  for (const [key, value] of Object.entries(scalars)) {
    if (value !== undefined) {
      body[key] = value;
    }
  }
  const topicIds = splitList(options.topicIds);
  if (topicIds.length > 0) {
    body.topicIds = topicIds;
  }
  if (properties.value !== undefined) {
    body.properties = properties.value;
  }
  return { ok: true, value: body };
}

// Fixed key set: every field is present even when the route omits it.
function contactData(raw: Body): Body {
  const data: Body = {};
  for (const key of CONTACT_KEYS) {
    data[key] = raw[key] ?? (key === "properties" ? {} : null);
  }
  return data;
}

function mutationData(raw: Body): Body {
  const pending = Array.isArray(raw.pendingTopics) ? raw.pendingTopics : [];
  return { ...contactData(raw), pendingTopics: pending };
}

function kv(label: string, value: unknown): string {
  const text =
    value === null || value === undefined || value === ""
      ? pc.dim("—")
      : String(value);
  return `${pc.dim(label.padEnd(16))} ${text}`;
}

type ListFilters = Pick<
  ContactsListOptions,
  "emailStatus" | "smsStatus" | "preferredChannel" | "search"
>;

function buildListQuery(
  page: number,
  pageSize: number | undefined,
  filters: ListFilters
): URLSearchParams {
  const query = new URLSearchParams({ page: String(page) });
  if (pageSize !== undefined) {
    query.set("pageSize", String(pageSize));
  }
  const filterParams: Record<string, string | undefined> = {
    emailStatus: filters.emailStatus,
    smsStatus: filters.smsStatus,
    preferredChannel: filters.preferredChannel,
    search: filters.search,
  };
  for (const [key, value] of Object.entries(filterParams)) {
    if (value) {
      query.set(key, value);
    }
  }
  return query;
}

// Maps the list response to the fixed envelope. nextCursor is the next page
// number as a string, or null when the current page is the last one.
function listData(body: Body, currentPage: number): Body {
  const contacts = Array.isArray(body.contacts)
    ? (body.contacts as Body[])
    : [];
  const totalPages = typeof body.totalPages === "number" ? body.totalPages : 0;
  return {
    contacts: contacts.map((c) => contactData(c)),
    total: typeof body.total === "number" ? body.total : null,
    page: currentPage,
    pageSize: typeof body.pageSize === "number" ? body.pageSize : null,
    totalPages,
    nextCursor: currentPage < totalPages ? String(currentPage + 1) : null,
  };
}

export async function contactsList(
  options: ContactsListOptions
): Promise<void> {
  const page = parseWhole({
    raw: options.cursor,
    flag: "--cursor",
    min: 1,
    max: 1_000_000,
    suggestion:
      "Pass the nextCursor value from the previous page, or omit --cursor for the first page.",
  });
  if (!page.ok) {
    fail(CMD.list, page.failure);
    return;
  }
  const pageSize = parseWhole({
    raw: options.limit,
    flag: "--limit",
    min: 1,
    max: 100,
    suggestion: "Pass --limit as a whole number from 1 to 100, or omit it.",
  });
  if (!pageSize.ok) {
    fail(CMD.list, pageSize.failure);
    return;
  }

  const target = await connect(CMD.list, options.token);
  if (!target) {
    return;
  }

  const currentPage = page.value ?? 1;
  const query = buildListQuery(currentPage, pageSize.value, options);

  const result = await callApi(target, "GET", "/v1/contacts", { query });
  if (!result.ok) {
    fail(CMD.list, result.failure);
    return;
  }

  const data = listData(result.body, currentPage);
  const contacts = data.contacts as Body[];

  if (isJsonMode()) {
    jsonSuccess(CMD.list, data);
    return;
  }

  if (contacts.length === 0) {
    log.info("No contacts found.");
    return;
  }
  const lines = contacts.map((row) => {
    const who = String(row.email ?? row.phone ?? "—");
    return `${pc.dim(String(row.id))}  ${who.padEnd(32)}  ${String(row.emailStatus ?? "—")}`;
  });
  note(
    lines.join("\n"),
    data.total === null ? "Contacts" : `Contacts — ${data.total} total`
  );
  if (data.nextCursor) {
    log.info(
      `More contacts available. Use: ${pc.cyan(`--cursor ${data.nextCursor}`)}`
    );
  }
}

export async function contactsGet(options: ContactsGetOptions): Promise<void> {
  if (!options.id) {
    missingId(CMD.get, "contacts get <id>");
    return;
  }
  const target = await connect(CMD.get, options.token);
  if (!target) {
    return;
  }

  const result = await callApi(
    target,
    "GET",
    `/v1/contacts/${encodeURIComponent(options.id)}`
  );
  if (!result.ok) {
    fail(CMD.get, result.failure);
    return;
  }

  const topics = Array.isArray(result.body.topics) ? result.body.topics : [];
  const data: Body = { ...contactData(result.body), topics };

  if (isJsonMode()) {
    jsonSuccess(CMD.get, data);
    return;
  }

  const topicNames = (topics as Body[]).map(
    (t) => `${String(t.topicName ?? t.topicId)} (${String(t.status ?? "?")})`
  );
  note(
    [
      kv("ID:", data.id),
      kv("Email:", data.email),
      kv("Phone:", data.phone),
      kv("Name:", [data.firstName, data.lastName].filter(Boolean).join(" ")),
      kv("Company:", data.company),
      kv("Email status:", data.emailStatus),
      kv("SMS status:", data.smsStatus),
      kv("Preferred:", data.preferredChannel),
      kv("Topics:", topicNames.length > 0 ? topicNames.join(", ") : null),
    ].join("\n"),
    `Contact ${String(data.id)}`
  );
}

export async function contactsCreate(
  options: ContactsCreateOptions
): Promise<void> {
  if (!(options.email || options.phone)) {
    fail(CMD.create, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Missing --email or --phone",
      suggestion:
        "Pass --email, --phone, or both. A contact needs at least one address.",
    });
    return;
  }
  const built = buildContactBody(options);
  if (!built.ok) {
    fail(CMD.create, built.failure);
    return;
  }

  const target = await connect(CMD.create, options.token);
  if (!target) {
    return;
  }

  const result = await callApi(target, "POST", "/v1/contacts", {
    body: built.value,
    conflictSuggestion:
      "A contact with this email, phone or externalId already exists. Find it with `wraps contacts list --search <value>`, then change it with `wraps contacts update <id>`.",
  });
  if (!result.ok) {
    fail(CMD.create, result.failure);
    return;
  }

  const data = mutationData(result.body);
  if (isJsonMode()) {
    jsonSuccess(CMD.create, data);
    return;
  }
  log.success(`Created contact ${String(data.id)}`);
  const pending = data.pendingTopics as unknown[];
  if (pending.length > 0) {
    log.info(
      `${pending.length} topic subscription(s) are waiting for the contact to confirm.`
    );
  }
}

export async function contactsUpdate(
  options: ContactsUpdateOptions
): Promise<void> {
  if (!options.id) {
    missingId(CMD.update, "contacts update <id> [flags]");
    return;
  }
  const built = buildContactBody(options);
  if (!built.ok) {
    fail(CMD.update, built.failure);
    return;
  }
  if (Object.keys(built.value).length === 0) {
    fail(CMD.update, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Nothing to update",
      suggestion:
        "Pass at least one field flag, for example --first-name, --email-status or --topic-ids.",
    });
    return;
  }

  const target = await connect(CMD.update, options.token);
  if (!target) {
    return;
  }

  const result = await callApi(
    target,
    "PATCH",
    `/v1/contacts/${encodeURIComponent(options.id)}`,
    {
      body: built.value,
      conflictSuggestion:
        "The new value is already used by another contact (for example an externalId), or the contact is already subscribed to one of these topics. Check the value and retry.",
    }
  );
  if (!result.ok) {
    fail(CMD.update, result.failure);
    return;
  }

  const data = mutationData(result.body);
  if (isJsonMode()) {
    jsonSuccess(CMD.update, data);
    return;
  }
  log.success(`Updated contact ${String(data.id)}`);
}

export async function contactsDelete(
  options: ContactsDeleteOptions
): Promise<void> {
  if (!options.id) {
    missingId(CMD.delete, "contacts delete <id> --yes");
    return;
  }
  const id = options.id;

  // --dry-run wins over everything: it reports what would happen and makes no request.
  if (options.dryRun) {
    const data: Body = { id, deleted: false, dryRun: true };
    if (isJsonMode()) {
      jsonSuccess(CMD.delete, data);
      return;
    }
    log.info(`Dry run: contact ${id} would be deleted. Nothing was changed.`);
    return;
  }

  if (!options.yes) {
    fail(CMD.delete, {
      code: "CONFIRMATION_REQUIRED",
      message: `Deleting contact ${id} cannot be undone from the CLI`,
      suggestion:
        "Re-run with --yes to delete, or with --dry-run to preview without changes.",
    });
    return;
  }

  const target = await connect(CMD.delete, options.token);
  if (!target) {
    return;
  }

  const result = await callApi(
    target,
    "DELETE",
    `/v1/contacts/${encodeURIComponent(id)}`
  );
  if (!result.ok) {
    fail(CMD.delete, result.failure);
    return;
  }

  const data: Body = { id, deleted: true, dryRun: false };
  if (isJsonMode()) {
    jsonSuccess(CMD.delete, data);
    return;
  }
  log.success(`Deleted contact ${id}`);
}
