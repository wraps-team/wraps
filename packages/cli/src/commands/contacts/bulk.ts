/**
 * wraps contacts import|export|validate
 *
 * Bulk contact commands over the /v1/contacts bulk routes
 * (apps/api/src/routes/contacts-bulk.ts). Same conventions as contacts.ts:
 * one --json envelope per run with a dotted command name, every failure sets
 * process.exitCode = 1, and no interactive prompts.
 *
 * Local work comes first. Files are parsed and capped before any credential is
 * resolved, so a bad file fails without a request. --dry-run stops after the
 * local work: no target, no request.
 *
 * Cost gates. SES Email Address Insights is billed by AWS per address, so
 * `import --validate` and `validate` refuse without --yes (CONFIRMATION_REQUIRED).
 * `--dry-run` never needs --yes.
 *
 * File writes. `export --output` writes only after the API answered 200. An
 * existing file is refused unless --yes is given, and the write uses flag "wx"
 * so a file created in the meantime is not clobbered either.
 *
 * Row numbers in import errors are data-row numbers (the header is not counted),
 * the same numbering the route uses in its `errors` list.
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve as resolvePath } from "node:path";
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

const CMD = {
  import: "contacts.import",
  export: "contacts.export",
  validate: "contacts.validate",
} as const;

/** Rows per import request. Matches MAX_IMPORT_SIZE in the API service. */
export const IMPORT_ROW_CAP = 10_000;
/** Addresses per validate request. Matches MAX_VALIDATE_ADDRESSES in the API. */
export const VALIDATE_ADDRESS_CAP = 100;
/** Rows one export returns. Matches MAX_EXPORT_ROWS in the API service. */
export const EXPORT_ROW_CAP = 50_000;

const FORMATS = ["csv", "json"] as const;
const DUPLICATE_STRATEGIES = ["skip", "update"] as const;
const EMAIL_STATUSES = [
  "active",
  "unsubscribed",
  "bounced",
  "soft_bounced",
  "complained",
  "suppressed",
] as const;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Characters an account id or path may use without quoting in a suggested command. */
const PLAIN_SHELL_ARG = /^[\w./:@=,-]+$/;

/** Header names that map to a contact field. Mirrors KNOWN_COLUMNS in apps/web/src/lib/csv-column-mapping.ts. */
const KNOWN_COLUMNS = {
  email: ["email", "email_address", "e-mail", "mail", "email address"],
  phone: [
    "phone",
    "phone_number",
    "phone number",
    "mobile",
    "cell",
    "tel",
    "telephone",
  ],
  firstName: [
    "first_name",
    "firstname",
    "first name",
    "fname",
    "given_name",
    "given name",
  ],
  lastName: [
    "last_name",
    "lastname",
    "last name",
    "lname",
    "surname",
    "family_name",
    "family name",
  ],
  company: ["company", "company_name", "company name", "organization", "org"],
  jobTitle: ["job_title", "jobtitle", "job title", "title", "role", "position"],
  createdAt: [
    "created_at",
    "createdat",
    "created at",
    "created",
    "date_added",
    "date added",
    "signup_date",
    "signup date",
    "joined",
    "joined_at",
  ],
  smsStatus: [
    "sms_status",
    "smsstatus",
    "sms status",
    "sms_consent",
    "sms consent",
    "sms_opt_in",
    "sms opt in",
    "sms_optin",
    "smsoptin",
  ],
  smsConsentedAt: [
    "sms_consented_at",
    "smsconsentedat",
    "sms consented at",
    "sms_consent_date",
    "sms consent date",
    "consent_date",
    "consent date",
    "opt_in_date",
    "opt in date",
    "opted_in_at",
    "sms_opt_in_date",
  ],
} as const;

type ContactField = keyof typeof KNOWN_COLUMNS;

const FIELD_BY_ALIAS = new Map<string, ContactField>(
  (Object.keys(KNOWN_COLUMNS) as ContactField[]).flatMap((field) =>
    KNOWN_COLUMNS[field].map((alias) => [alias, field] as const)
  )
);

type ImportRow = { [K in ContactField]?: string } & {
  properties?: Record<string, string>;
};

type CommonOptions = {
  json?: boolean;
  token?: string;
  region?: string;
};

export type ContactsImportOptions = CommonOptions & {
  file?: string;
  format?: string;
  duplicateStrategy?: string;
  topicIds?: string;
  validate?: boolean;
  awsAccountId?: string;
  yes?: boolean;
  dryRun?: boolean;
};

export type ContactsExportOptions = CommonOptions & {
  format?: string;
  output?: string;
  search?: string;
  emailStatus?: string;
  topicId?: string;
  yes?: boolean;
};

export type ContactsValidateOptions = CommonOptions & {
  emails?: string;
  file?: string;
  awsAccountId?: string;
  yes?: boolean;
  dryRun?: boolean;
};

type Body = Record<string, unknown>;
type CliFailure = { code: string; message: string; suggestion: string };
type Parsed<T> = { ok: true; value: T } | { ok: false; failure: CliFailure };
type Target = { apiBase: string; token: string };
type Hints = Partial<Record<number, string>>;
type ApiResult =
  | {
      ok: true;
      body: Body;
      text: string;
      headers: Headers | null;
    }
  | { ok: false; failure: CliFailure };
type RowError = { row: number; error: string };

const IMPORT_HINTS: Hints = {
  402: "Your plan's contact limit is reached, so nothing was imported. Upgrade the plan in the Wraps dashboard, or free a contact slot with `wraps contacts delete <id> --yes`, then re-run the import.",
  403: "This credential cannot import contacts, or cannot run SES validation through that AWS account. The message above names the missing permission or role. Fix it, then re-run the import.",
  404: "The AWS account for --aws-account-id was not found in this organization, so nothing was imported. Run `wraps email health` to list the account ids, then re-run with --aws-account-id <id>.",
  409: "A row collided with an existing record during the write. Re-run the same file: with --duplicate-strategy skip (the default), rows already written are skipped.",
  429: "SES throttled the run. The message says how many contacts were written first. Wait a minute, then re-run the same file with --duplicate-strategy skip (the default), so written rows are skipped.",
};

const EXPORT_HINTS: Hints = {
  403: "Export needs the contacts:export permission. Use a session or key that has it, then retry.",
};

const VALIDATE_HINTS: Hints = {
  403: "Validation needs the contacts:import permission, and the AWS account must allow SES Email Address Insights. The message above names which; fix it, then retry.",
  404: "The AWS account was not found in this organization. Run `wraps email health` to list the account ids, then retry with --aws-account-id <id>.",
};

function fail(command: string, failure: CliFailure): void {
  process.exitCode = 1;
  if (isJsonMode()) {
    jsonError(command, failure);
    return;
  }
  log.error(`${failure.message}. ${failure.suggestion}`);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isOneOf<T extends string>(
  value: string,
  options: readonly T[]
): value is T {
  return (options as readonly string[]).includes(value);
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Quotes a value for a suggested command line when it has shell-special characters. */
function shellArg(value: string): string {
  return PLAIN_SHELL_ARG.test(value)
    ? value
    : `"${value.replace(/["\\$`]/g, "\\$&")}"`;
}

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

function messageOf(body: Body): string | undefined {
  for (const key of ["error", "message"]) {
    const value = body[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return;
}

function httpFailure(status: number, body: Body, hints: Hints): CliFailure {
  const detail = messageOf(body) ?? `HTTP ${status}`;
  const hint = hints[status];
  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message: `The API rejected the credentials (${detail})`,
      suggestion:
        "Run `wraps auth login`, or pass a valid key with --token or WRAPS_API_KEY.",
    };
  }
  if (status === 402) {
    return {
      code: "PLAN_REQUIRED",
      message: detail,
      suggestion:
        hint ??
        "The plan does not allow this. Upgrade the plan in the Wraps dashboard, then retry.",
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: detail,
      suggestion:
        hint ??
        "Your credentials are not allowed to do this. The message above says why.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: detail,
      suggestion: hint ?? "The resource was not found. Check it and retry.",
    };
  }
  if (status === 409) {
    return {
      code: "CONFLICT",
      message: detail,
      suggestion:
        hint ??
        "The value conflicts with an existing record. Check it and retry.",
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message: detail,
      suggestion: hint ?? "Wait a minute, then retry.",
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "VALIDATION_FAILED",
      message: detail,
      suggestion: "Check the values the message names, then retry.",
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

async function readJsonObject(resp: Response): Promise<Body> {
  const parsed: unknown = await resp.json().catch(() => null);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Body)
    : {};
}

async function callApi(
  target: Target,
  method: "GET" | "POST",
  path: string,
  options: {
    query?: URLSearchParams;
    body?: Body;
    text?: boolean;
    hints?: Hints;
  } = {}
): Promise<ApiResult> {
  const qs = options.query?.toString();
  const url = `${target.apiBase}${path}${qs ? `?${qs}` : ""}`;
  const hasBody = options.body !== undefined;

  let resp: Response;
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

  if (!resp.ok) {
    const body = await readJsonObject(resp);
    return {
      ok: false,
      failure: httpFailure(resp.status, body, options.hints ?? {}),
    };
  }

  const headers = resp.headers ?? null;
  if (options.text) {
    return { ok: true, body: {}, text: await resp.text(), headers };
  }
  return {
    ok: true,
    body: await readJsonObject(resp),
    text: "",
    headers,
  };
}

async function readInput(path: string): Promise<Parsed<string>> {
  try {
    return { ok: true, value: await readFile(path, "utf8") };
  } catch (err) {
    const missing = (err as { code?: string }).code === "ENOENT";
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: missing
          ? `No file at ${path}`
          : `Could not read ${path} (${errorText(err)})`,
        suggestion: "Check the path passed to --file, then retry.",
      },
    };
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    // Only a missing file is safe to overwrite; an unreadable one may exist.
    return !(err instanceof Error && "code" in err && err.code === "ENOENT");
  }
}

// ---------------------------------------------------------------------------
// CSV and JSON parsing
// ---------------------------------------------------------------------------

/**
 * RFC 4180 records: quoted fields with "" escapes, commas and line breaks
 * inside quotes, LF / CRLF / CR endings, a leading BOM. Records whose cells are
 * all blank (blank lines) are dropped.
 */
function parseCsv(text: string): Parsed<string[][]> {
  const src = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") {
        i++;
      }
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (quoted) {
    return {
      ok: false,
      failure: {
        code: "VALIDATION_FAILED",
        message: "The CSV file has a quoted value that is never closed",
        suggestion:
          'Close the quoted value with a double quote (") and re-run the command.',
      },
    };
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return {
    ok: true,
    value: records.filter((r) => r.some((cell) => cell.trim() !== "")),
  };
}

/**
 * One row from (header, value) pairs. A header that names a contact field goes
 * to that field (the first column wins); every other header becomes a property,
 * as the dashboard's import does. Blank values are omitted.
 */
function buildRow(
  entries: [string, string][],
  nested: Record<string, string> = {}
): ImportRow {
  const row: ImportRow = {};
  const properties: Record<string, string> = { ...nested };
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim();
    const value = rawValue.trim();
    if (name === "" || value === "") {
      continue;
    }
    const field = FIELD_BY_ALIAS.get(name.toLowerCase());
    if (field !== undefined && row[field] === undefined) {
      row[field] = value;
    } else {
      properties[name] = value;
    }
  }
  if (Object.keys(properties).length > 0) {
    row.properties = properties;
  }
  return row;
}

function capFailure(count: number): CliFailure {
  return {
    code: "VALIDATION_FAILED",
    message: `The file has ${count} contact rows; one import takes at most ${IMPORT_ROW_CAP}`,
    suggestion: `Split the file into parts of at most ${IMPORT_ROW_CAP} rows, repeating the header row in each part, then run wraps contacts import --file <part> for each part.`,
  };
}

function parseCsvFile(text: string): Parsed<ImportRow[]> {
  const records = parseCsv(text);
  if (!records.ok) {
    return records;
  }
  const [header, ...dataRows] = records.value;
  if (header === undefined) {
    return {
      ok: false,
      failure: {
        code: "VALIDATION_FAILED",
        message: "The file is empty",
        suggestion:
          "Add a header row such as email,first name,last name, then one contact per line.",
      },
    };
  }
  const names = header.map((h) => h.trim());
  const hasKeyColumn = names.some((n) => {
    const field = FIELD_BY_ALIAS.get(n.toLowerCase());
    return field === "email" || field === "phone";
  });
  if (!hasKeyColumn) {
    return {
      ok: false,
      failure: {
        code: "VALIDATION_FAILED",
        message: `The header row has no email or phone column (found: ${names.join(", ")})`,
        suggestion:
          "Name a column email or phone in the first row, for example email,first name,last name, then re-run the import.",
      },
    };
  }
  if (dataRows.length === 0) {
    return {
      ok: false,
      failure: {
        code: "VALIDATION_FAILED",
        message: "The file has a header row but no contact rows",
        suggestion: "Add at least one contact row under the header.",
      },
    };
  }
  if (dataRows.length > IMPORT_ROW_CAP) {
    return { ok: false, failure: capFailure(dataRows.length) };
  }

  const rows: ImportRow[] = [];
  for (const [index, cells] of dataRows.entries()) {
    const extra = cells.slice(names.length).filter((c) => c.trim() !== "");
    if (extra.length > 0) {
      return {
        ok: false,
        failure: {
          code: "VALIDATION_FAILED",
          message: `Row ${index + 1} has ${cells.length} fields but the header has ${names.length}`,
          suggestion:
            'Quote any value that contains a comma, for example "Acme, Inc", then re-run the import.',
        },
      };
    }
    rows.push(buildRow(names.map((name, col) => [name, cells[col] ?? ""])));
  }
  return { ok: true, value: rows };
}

function scalarText(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return;
}

function parseJsonFile(text: string): Parsed<ImportRow[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.startsWith("\uFEFF") ? text.slice(1) : text);
  } catch (err) {
    return {
      ok: false,
      failure: {
        code: "VALIDATION_FAILED",
        message: `The file is not valid JSON (${errorText(err)})`,
        suggestion:
          "Fix the JSON syntax, or pass --format csv if the file is CSV.",
      },
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      failure: {
        code: "VALIDATION_FAILED",
        message: "The JSON file must be an array of contact objects",
        suggestion:
          'Wrap the contacts in [ ... ], one object per contact, for example [{"email":"ada@example.com"}].',
      },
    };
  }
  if (parsed.length === 0) {
    return {
      ok: false,
      failure: {
        code: "VALIDATION_FAILED",
        message: "The JSON array is empty",
        suggestion: "Add at least one contact object to the array.",
      },
    };
  }
  if (parsed.length > IMPORT_ROW_CAP) {
    return { ok: false, failure: capFailure(parsed.length) };
  }

  const rows: ImportRow[] = [];
  for (const [index, item] of parsed.entries()) {
    const rowNo = index + 1;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return {
        ok: false,
        failure: {
          code: "VALIDATION_FAILED",
          message: `Row ${rowNo} is not an object`,
          suggestion:
            'Each element of the array must be an object of contact fields, for example {"email":"ada@example.com"}.',
        },
      };
    }
    const entries: [string, string][] = [];
    const nested: Record<string, string> = {};
    for (const [key, value] of Object.entries(item)) {
      if (key === "properties" && typeof value === "object" && value !== null) {
        for (const [propKey, propValue] of Object.entries(value)) {
          const propText = scalarText(propValue);
          if (propText === undefined) {
            return {
              ok: false,
              failure: badValue(rowNo, `properties.${propKey}`),
            };
          }
          nested[propKey] = propText;
        }
        continue;
      }
      const cellText = scalarText(value);
      if (cellText === undefined) {
        return { ok: false, failure: badValue(rowNo, key) };
      }
      entries.push([key, cellText]);
    }
    rows.push(buildRow(entries, nested));
  }
  return { ok: true, value: rows };
}

function badValue(rowNo: number, key: string): CliFailure {
  return {
    code: "VALIDATION_FAILED",
    message: `Row ${rowNo} field "${key}" must be a string, number or boolean`,
    suggestion:
      'Fix that value in the file, or move nested values under "properties", then re-run.',
  };
}

function resolveFormat(
  flag: string | undefined,
  file: string
): Parsed<(typeof FORMATS)[number]> {
  if (flag !== undefined) {
    if (isOneOf(flag, FORMATS)) {
      return { ok: true, value: flag };
    }
    return {
      ok: false,
      failure: {
        code: "INVALID_FLAG_VALUE",
        message: `--format must be csv or json, got "${flag}"`,
        suggestion: "Pass --format csv or --format json.",
      },
    };
  }
  const ext = extname(file).toLowerCase();
  if (ext === ".json") {
    return { ok: true, value: "json" };
  }
  if (ext === ".csv") {
    return { ok: true, value: "csv" };
  }
  return {
    ok: false,
    failure: {
      code: "INVALID_FLAG_VALUE",
      message: `Cannot tell the format of ${basename(file)} from its extension`,
      suggestion: "Pass --format csv or --format json.",
    },
  };
}

type LocalSummary = {
  withEmail: number;
  phoneOnly: number;
  invalidLocally: number;
};

/** The checks the API makes before it writes, done locally: a well-formed email, or a phone, or both. */
function summarize(rows: ImportRow[]): LocalSummary {
  let withEmail = 0;
  let phoneOnly = 0;
  let invalidLocally = 0;
  for (const row of rows) {
    if (row.email !== undefined && !EMAIL_SHAPE.test(row.email)) {
      invalidLocally++;
    } else if (row.email !== undefined) {
      withEmail++;
    } else if (row.phone !== undefined) {
      phoneOnly++;
    } else {
      invalidLocally++;
    }
  }
  return { withEmail, phoneOnly, invalidLocally };
}

// ---------------------------------------------------------------------------
// import
// ---------------------------------------------------------------------------

export async function contactsImport(
  options: ContactsImportOptions
): Promise<void> {
  const command = CMD.import;
  if (!options.file) {
    fail(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Missing --file",
      suggestion:
        "Usage: wraps contacts import --file <path.csv|path.json>. Add --dry-run to check the file first.",
    });
    return;
  }
  const file = options.file;
  const format = resolveFormat(options.format, file);
  if (!format.ok) {
    fail(command, format.failure);
    return;
  }

  const strategy = options.duplicateStrategy ?? "skip";
  if (!isOneOf(strategy, DUPLICATE_STRATEGIES)) {
    fail(command, {
      code: "INVALID_FLAG_VALUE",
      message: `--duplicate-strategy must be skip or update, got "${strategy}"`,
      suggestion:
        "Pass --duplicate-strategy skip (the default) or --duplicate-strategy update.",
    });
    return;
  }
  if (options.awsAccountId && !options.validate) {
    fail(command, {
      code: "INVALID_FLAG_USAGE",
      message: "--aws-account-id only applies with --validate",
      suggestion:
        "Add --validate to check the addresses with SES through that account, or drop --aws-account-id.",
    });
    return;
  }
  if (options.validate && !options.awsAccountId) {
    fail(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "--validate needs --aws-account-id",
      suggestion:
        "Pass --aws-account-id <id> (wraps email health lists the ids), or drop --validate.",
    });
    return;
  }

  const text = await readInput(file);
  if (!text.ok) {
    fail(command, text.failure);
    return;
  }
  const parsed =
    format.value === "json"
      ? parseJsonFile(text.value)
      : parseCsvFile(text.value);
  if (!parsed.ok) {
    fail(command, parsed.failure);
    return;
  }

  const rows = parsed.value;
  const topicIds = splitList(options.topicIds);
  const summary = summarize(rows);
  const name = basename(file);

  if (options.dryRun) {
    const data: Body = {
      dryRun: true,
      file,
      format: format.value,
      rows: rows.length,
      ...summary,
      duplicateStrategy: strategy,
      topicIds,
      sesValidation: Boolean(options.validate),
      awsAccountId: options.awsAccountId ?? null,
    };
    if (isJsonMode()) {
      jsonSuccess(command, data);
      return;
    }
    log.info(
      `Dry run: ${rows.length} rows in ${name}. ${summary.withEmail} with a valid email, ${summary.phoneOnly} with a phone only, ${summary.invalidLocally} invalid. Nothing was sent.`
    );
    return;
  }

  const accountId = options.awsAccountId ?? "";
  if (options.validate && !options.yes) {
    fail(command, {
      code: "CONFIRMATION_REQUIRED",
      message: `--validate checks up to ${summary.withEmail} addresses with SES Email Address Insights, which AWS bills per address checked`,
      suggestion: `Re-run with --yes to confirm the cost: wraps contacts import --file ${shellArg(file)} --validate --aws-account-id ${shellArg(accountId)} --yes. Or drop --validate to import without SES checks.`,
    });
    return;
  }

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }

  const body: Body = { contacts: rows, duplicateStrategy: strategy };
  if (topicIds.length > 0) {
    body.topicIds = topicIds;
  }
  if (options.validate) {
    body.sesValidation = { awsAccountId: accountId };
  }

  const result = await callApi(target, "POST", "/v1/contacts/import", {
    body,
    hints: IMPORT_HINTS,
  });
  if (!result.ok) {
    fail(command, result.failure);
    return;
  }

  const errors = (
    Array.isArray(result.body.errors) ? result.body.errors : []
  ) as RowError[];
  const duplicates = Array.isArray(result.body.duplicates)
    ? result.body.duplicates
    : [];
  const created = countOf(result.body.created);
  const updated = countOf(result.body.updated);
  const skipped = countOf(result.body.skipped);
  const invalid = countOf(result.body.invalid);

  const data: Body = {
    dryRun: false,
    file,
    format: format.value,
    rows: rows.length,
    created,
    updated,
    skipped,
    invalid,
    errors,
    duplicates,
    duplicateStrategy: strategy,
    topicIds,
    sesValidation: Boolean(options.validate),
  };
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }
  log.success(
    `Imported ${rows.length} rows from ${name}: ${created} created, ${updated} updated, ${skipped} skipped, ${invalid} invalid`
  );
  const first = errors[0];
  if (first !== undefined) {
    log.warn(
      `${invalid} row(s) were not imported. First: row ${first.row}: ${first.error}. Re-run with --json to list every row error.`
    );
  }
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

function headerCount(headers: Headers | null, name: string): number | null {
  const raw = headers?.get(name);
  if (raw === null || raw === undefined) {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function contactsExport(
  options: ContactsExportOptions
): Promise<void> {
  const command = CMD.export;
  const format = options.format ?? "json";
  if (!isOneOf(format, FORMATS)) {
    fail(command, {
      code: "INVALID_FLAG_VALUE",
      message: `--format must be json or csv, got "${format}"`,
      suggestion: "Pass --format json (the default) or --format csv.",
    });
    return;
  }
  if (
    options.emailStatus !== undefined &&
    !isOneOf(options.emailStatus, EMAIL_STATUSES)
  ) {
    fail(command, {
      code: "INVALID_FLAG_VALUE",
      message: `--email-status must be one of ${EMAIL_STATUSES.join(", ")}, got "${options.emailStatus}"`,
      suggestion: `Pass --email-status with one of: ${EMAIL_STATUSES.join(", ")}.`,
    });
    return;
  }
  if (options.search !== undefined && options.search.length > 255) {
    fail(command, {
      code: "INVALID_FLAG_VALUE",
      message: "--search is longer than 255 characters",
      suggestion: "Shorten --search to 255 characters or fewer.",
    });
    return;
  }
  if (format === "csv" && isJsonMode() && !options.output) {
    fail(command, {
      code: "INVALID_FLAG_USAGE",
      message: "--format csv in --json mode needs --output <path>",
      suggestion:
        "Pass --output <path> to write the CSV file, for example: wraps contacts export --format csv --output ./contacts.csv --json",
    });
    return;
  }

  // An existing --output is refused before any request, so a refused overwrite
  // never downloads the contacts. This is a stat, not a write; the write itself
  // uses flag "wx" below, so a file created in the meantime is not clobbered.
  const outPath = options.output ? resolvePath(options.output) : undefined;
  const overwriting = outPath !== undefined && (await pathExists(outPath));
  if (outPath !== undefined && overwriting && !options.yes) {
    fail(command, {
      code: "CONFIRMATION_REQUIRED",
      message: `${outPath} already exists and would be overwritten`,
      suggestion:
        "Re-run with --yes to overwrite it, or choose a new file with --output <path>.",
    });
    return;
  }

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }

  // The filters are sent exactly as given, as query-string values, the same
  // values the contacts list is filtered by (loom rule: no local state).
  const query = new URLSearchParams();
  if (options.search) {
    query.set("search", options.search);
  }
  if (options.emailStatus) {
    query.set("emailStatus", options.emailStatus);
  }
  if (options.topicId) {
    query.set("topicId", options.topicId);
  }
  if (format === "csv") {
    query.set("format", "csv");
  }

  const result = await callApi(target, "GET", "/v1/contacts/export", {
    query,
    text: format === "csv",
    hints: EXPORT_HINTS,
  });
  if (!result.ok) {
    fail(command, result.failure);
    return;
  }

  // Only now, after a 200, is anything written (contract: no fs use on failure paths).
  const isCsv = format === "csv";
  const contacts =
    !isCsv && Array.isArray(result.body.contacts) ? result.body.contacts : [];
  const total = isCsv
    ? headerCount(result.headers, "x-export-total")
    : countOf(result.body.total);
  const truncated = isCsv
    ? result.headers?.get("x-export-truncated") === "true"
    : result.body.truncated === true;
  // CSV rows are not counted locally: the header carries the match count, and a
  // truncated file holds exactly the cap.
  let exported = contacts.length;
  if (isCsv) {
    exported = truncated ? EXPORT_ROW_CAP : (total ?? 0);
  }
  const hint = truncated
    ? `Only the first ${EXPORT_ROW_CAP} of ${total ?? `more than ${EXPORT_ROW_CAP}`} matching contacts were exported. Narrow the export with --search, --email-status or --topic-id, then export again.`
    : null;

  const payload = isCsv
    ? result.text
    : `${JSON.stringify({ contacts, total, truncated }, null, 2)}\n`;

  if (outPath !== undefined) {
    const path = outPath;
    const existed = overwriting;
    try {
      await writeFile(path, payload, {
        encoding: "utf8",
        flag: existed ? "w" : "wx",
      });
    } catch (err) {
      if ((err as { code?: string }).code === "EEXIST") {
        fail(command, {
          code: "CONFIRMATION_REQUIRED",
          message: `${path} was created while the export ran`,
          suggestion:
            "Re-run with --yes to overwrite it, or choose a new file with --output <path>.",
        });
        return;
      }
      fail(command, {
        code: "WRITE_FAILED",
        message: `Could not write ${path} (${errorText(err)})`,
        suggestion:
          "Check that the folder exists and is writable, then retry with --output <path>.",
      });
      return;
    }

    const data: Body = {
      format,
      output: path,
      exported,
      total,
      truncated,
      hint,
      overwritten: existed,
    };
    if (isJsonMode()) {
      jsonSuccess(command, data);
      return;
    }
    log.success(`Exported ${exported} contacts to ${path}`);
    if (hint) {
      log.warn(hint);
    }
    return;
  }

  if (isJsonMode()) {
    jsonSuccess(command, {
      format,
      output: null,
      exported,
      total,
      truncated,
      hint,
      contacts,
    });
    return;
  }
  // Human mode without --output: the data goes to stdout so it can be piped; the hint goes to stderr.
  process.stdout.write(payload.endsWith("\n") ? payload : `${payload}\n`);
  if (hint) {
    process.stderr.write(`${hint}\n`);
  }
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

/** Addresses from a file: a CSV with an email column, or one address per line. */
function addressesFromText(text: string): Parsed<string[]> {
  const records = parseCsv(text);
  if (!records.ok) {
    return records;
  }
  const first = records.value[0] ?? [];
  const emailColumn = first.findIndex(
    (cell) => FIELD_BY_ALIAS.get(cell.trim().toLowerCase()) === "email"
  );
  const hasHeader = emailColumn !== -1;
  const column = hasHeader ? emailColumn : 0;
  const rows = hasHeader ? records.value.slice(1) : records.value;
  return {
    ok: true,
    value: rows.map((r) => (r[column] ?? "").trim()).filter((a) => a !== ""),
  };
}

function uniqueAddresses(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const address of list) {
    const key = address.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(address);
    }
  }
  return out;
}

export async function contactsValidate(
  options: ContactsValidateOptions
): Promise<void> {
  const command = CMD.validate;
  if (options.emails !== undefined && options.file !== undefined) {
    fail(command, {
      code: "INVALID_FLAG_USAGE",
      message: "Pass --emails or --file, not both",
      suggestion:
        "Use --emails a@x.com,b@y.com for a short list, or --file <path> for a longer one.",
    });
    return;
  }
  if (options.emails === undefined && options.file === undefined) {
    fail(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Missing --emails or --file",
      suggestion:
        "Usage: wraps contacts validate --emails a@x.com,b@y.com --aws-account-id <id> --yes",
    });
    return;
  }

  let raw: string[];
  if (options.file !== undefined) {
    const text = await readInput(options.file);
    if (!text.ok) {
      fail(command, text.failure);
      return;
    }
    const addresses = addressesFromText(text.value);
    if (!addresses.ok) {
      fail(command, addresses.failure);
      return;
    }
    raw = addresses.value;
  } else {
    raw = splitList(options.emails);
  }

  const addresses = uniqueAddresses(raw);
  if (addresses.length === 0) {
    fail(command, {
      code: "VALIDATION_FAILED",
      message: "No addresses to validate",
      suggestion:
        "Pass at least one address with --emails a@x.com, or a --file with one address per line.",
    });
    return;
  }
  if (addresses.length > VALIDATE_ADDRESS_CAP) {
    fail(command, {
      code: "VALIDATION_FAILED",
      message: `${addresses.length} addresses is more than one validate call takes (${VALIDATE_ADDRESS_CAP})`,
      suggestion: `Split the list into files of at most ${VALIDATE_ADDRESS_CAP} addresses, then run wraps contacts validate --file <part> --aws-account-id <id> --yes for each part.`,
    });
    return;
  }

  const wellFormed = addresses.filter((a) => EMAIL_SHAPE.test(a)).length;
  if (options.dryRun) {
    const data: Body = {
      dryRun: true,
      requested: addresses.length,
      wellFormed,
      awsAccountId: options.awsAccountId ?? null,
      addresses,
    };
    if (isJsonMode()) {
      jsonSuccess(command, data);
      return;
    }
    log.info(
      `Dry run: ${addresses.length} addresses would be checked with SES. Nothing was sent.`
    );
    return;
  }

  if (!options.awsAccountId) {
    fail(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Missing --aws-account-id",
      suggestion:
        "Pass --aws-account-id <id> (wraps email health lists the ids). Usage: wraps contacts validate --emails <list> --aws-account-id <id> --yes",
    });
    return;
  }
  const accountId = options.awsAccountId;
  const input =
    options.file !== undefined
      ? `--file ${shellArg(options.file)}`
      : `--emails ${shellArg(options.emails ?? "")}`;
  if (!options.yes) {
    fail(command, {
      code: "CONFIRMATION_REQUIRED",
      message: `Validating ${addresses.length} addresses with SES Email Address Insights is billed by AWS per address checked`,
      suggestion: `Re-run with --yes to run the check: wraps contacts validate ${input} --aws-account-id ${shellArg(accountId)} --yes. Or add --dry-run to preview without a request.`,
    });
    return;
  }

  const target = await connect(command, options.token);
  if (!target) {
    return;
  }

  const result = await callApi(target, "POST", "/v1/contacts/validate", {
    body: { awsAccountId: accountId, emails: addresses },
    hints: VALIDATE_HINTS,
  });
  if (!result.ok) {
    fail(command, result.failure);
    return;
  }

  const verdicts = (
    result.body.verdicts !== null && typeof result.body.verdicts === "object"
      ? result.body.verdicts
      : {}
  ) as Record<string, string>;
  const invalid = Array.isArray(result.body.invalid)
    ? (result.body.invalid as string[])
    : [];
  const validatedCount = countOf(result.body.validatedCount);
  const stoppedEarly = result.body.stoppedEarly === true;

  const data: Body = {
    dryRun: false,
    requested: addresses.length,
    awsAccountId: accountId,
    verdicts,
    validatedCount,
    stoppedEarly,
    invalid,
  };
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }
  const lines = Object.entries(verdicts).map(
    ([address, verdict]) => `${address.padEnd(40)}  ${verdict}`
  );
  note(
    lines.join("\n") || "No verdicts",
    `Checked ${validatedCount} addresses`
  );
  if (invalid.length > 0) {
    log.info(
      `${invalid.length} address(es) failed the syntax check and were not sent to SES: ${invalid.join(", ")}`
    );
  }
  if (stoppedEarly) {
    log.warn(
      `SES throttled the run after ${validatedCount} addresses. Re-run with the addresses missing from the verdicts above.`
    );
  }
}
