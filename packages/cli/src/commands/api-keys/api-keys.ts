/**
 * `wraps api-keys` — list, create and revoke the organization's API keys over
 * the session-only /v1/api-keys routes.
 *
 * Session-only (decision D1): an API key cannot manage API keys, so the API
 * refuses every request authenticated with a `wraps_` key. This command checks
 * the credential first and fails before any request with SESSION_REQUIRED when
 * the target is an API key (--token, WRAPS_API_KEY, or a stored
 * `wraps auth login --token`). A device-flow login (`wraps auth login`) is a
 * session and works. If a key still reaches the API, its 403 "cannot manage
 * API keys" maps to the same code.
 *
 * Organization: the API acts for the session's oldest membership unless the
 * request carries X-Organization-Id. This command sends that header when --org
 * is passed, or when the login knows exactly one organization (the rule in
 * utils/shared/agent-api.ts). A multi-organization login without --org gets the
 * API's default organization.
 *
 * Secrets: `create` returns the full key once. It leaves this module only as
 * the intended output: data.secretKey in --json mode, or one note in human
 * mode. It is never placed in an error, a log line or a telemetry name.
 *
 * `list` is not paginated. The route returns every key, so there is no
 * --cursor or --limit.
 *
 * Pattern: commands/segments/segments.ts. Every error goes through emitError(),
 * which writes the JSON envelope (or a clack message) and sets
 * process.exitCode = 1.
 */

import { log, note } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../utils/shared/api-target.js";
import type { OrgInfo } from "../../utils/shared/config.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../utils/shared/json-output.js";

type ApiKeysCommonOptions = {
  token?: string;
  json?: boolean;
  region?: string;
  /** Organization id to act for. Sent as X-Organization-Id. */
  org?: string;
};

export type ApiKeysListOptions = ApiKeysCommonOptions;

export type ApiKeysCreateOptions = ApiKeysCommonOptions & {
  name?: string;
  /** live (default), test or restricted. */
  type?: string;
  /** full, readonly, or a comma-separated list of permissions. */
  permissions?: string;
  /** Whole number of days from 1 to 3650. */
  expiresInDays?: string;
};

export type ApiKeysRevokeOptions = ApiKeysCommonOptions & {
  id?: string;
  yes?: boolean;
  dryRun?: boolean;
};

type ErrorSpec = {
  code: string;
  message: string;
  suggestion: string;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: ErrorSpec };

type Target = {
  apiBase: string;
  token: string;
  organizationId: string | undefined;
};

type ApiOutcome = { ok: true; body: Record<string, unknown> } | { ok: false };

type ApiKeyView = {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; email: string } | null;
};

/**
 * Permission strings the API accepts (apps/api/src/services/api-keys.ts,
 * API_KEY_PERMISSIONS). Keep in step with that file.
 */
const PERMISSIONS = [
  "contacts:read",
  "contacts:write",
  "topics:read",
  "topics:write",
  "segments:read",
  "segments:write",
  "campaigns:read",
  "campaigns:write",
  "workflows:read",
  "workflows:write",
  "analytics:read",
  "send:email",
] as const;

const KEY_TYPES = ["live", "test", "restricted"] as const;
const DIGITS_ONLY = /^\d+$/;
const NAME_MAX_LENGTH = 200;
const EXPIRY_MIN_DAYS = 1;
const EXPIRY_MAX_DAYS = 3650;

/** The API's session-only refusal (routes/api-keys.ts). */
const SESSION_DENIAL = /cannot manage API keys|needs? a .*session/i;

const SESSION_SUGGESTION =
  "Run: wraps auth login (browser sign-in), then re-run without --token / unset WRAPS_API_KEY";

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

function invalidFlag(flag: string, message: string, suggestion: string) {
  return {
    ok: false as const,
    error: {
      code: "INVALID_FLAG_VALUE",
      message: `--${flag} ${message}`,
      suggestion,
    },
  };
}

function parseExpiresInDays(
  raw: string | undefined
): Parsed<number | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  const value = Number(raw);
  if (
    !(DIGITS_ONLY.test(raw) && Number.isSafeInteger(value)) ||
    value < EXPIRY_MIN_DAYS ||
    value > EXPIRY_MAX_DAYS
  ) {
    return invalidFlag(
      "expires-in-days",
      `must be a whole number of days from ${EXPIRY_MIN_DAYS} to ${EXPIRY_MAX_DAYS}, got "${raw}"`,
      `Pass --expires-in-days with a whole number from ${EXPIRY_MIN_DAYS} to ${EXPIRY_MAX_DAYS}, for example --expires-in-days 90.`
    );
  }
  return { ok: true, value };
}

function parsePermissions(
  raw: string | undefined
): Parsed<string[] | "full" | "readonly" | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (raw === "full" || raw === "readonly") {
    return { ok: true, value: raw };
  }
  const list = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const known = new Set<string>(PERMISSIONS);
  const unknown = list.filter((p) => !known.has(p));
  if (list.length === 0 || unknown.length > 0) {
    return invalidFlag(
      "permissions",
      `has ${unknown.length > 0 ? `unknown value "${unknown.join(", ")}"` : "no permissions"}`,
      `Pass --permissions full, --permissions readonly, or a comma-separated list of: ${PERMISSIONS.join(", ")}.`
    );
  }
  return { ok: true, value: list };
}

function parseName(raw: string | undefined): Parsed<string> {
  const name = raw?.trim() ?? "";
  if (name.length === 0) {
    return {
      ok: false,
      error: missingInput("--name", 'wraps api-keys create --name "<name>"'),
    };
  }
  if (name.length > NAME_MAX_LENGTH) {
    return invalidFlag(
      "name",
      `is longer than ${NAME_MAX_LENGTH} characters`,
      `Pass a --name of ${NAME_MAX_LENGTH} characters or fewer.`
    );
  }
  return { ok: true, value: name };
}

function parseType(raw: string | undefined): Parsed<string | undefined> {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (!(KEY_TYPES as readonly string[]).includes(raw)) {
    return invalidFlag(
      "type",
      `must be one of ${KEY_TYPES.join(", ")}, got "${raw}"`,
      "Pass --type live, --type test or --type restricted, or omit it for a live key."
    );
  }
  return { ok: true, value: raw };
}

function apiErrorSpec(status: number, text: string): ErrorSpec {
  if (status === 401) {
    return {
      code: "NOT_AUTHENTICATED",
      message: text,
      suggestion:
        "Run: wraps auth login (browser sign-in), then retry. Check --org if you passed it.",
    };
  }
  if (status === 403 && SESSION_DENIAL.test(text)) {
    return {
      code: "SESSION_REQUIRED",
      message: text,
      suggestion: SESSION_SUGGESTION,
    };
  }
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: text,
      suggestion:
        "Ask an owner or admin of the organization to run this, or sign in with their account: wraps auth login",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: text,
      suggestion: "Check the key id. List keys with: wraps api-keys list",
    };
  }
  if (status === 409) {
    return {
      code: "CONFLICT",
      message: text,
      suggestion: "Refresh the state with: wraps api-keys list, then retry.",
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
        "Fix the values named in the message and retry. See: wraps api-keys create --help",
    };
  }
  return {
    code: "API_ERROR",
    message: text,
    suggestion: `The Wraps API returned HTTP ${status}. Retry shortly. If it keeps failing, include this message in your report.`,
  };
}

// Error bodies from the route are `{ error }`. Never read a success body here:
// a create response carries the secret.
function errorText(body: Record<string, unknown>, status: number): string {
  if (typeof body.error === "string" && body.error.length > 0) {
    return body.error;
  }
  if (typeof body.message === "string" && body.message.length > 0) {
    return body.message;
  }
  return `HTTP ${status}`;
}

/**
 * Pick the organization to send. --org wins. Otherwise a login that knows
 * exactly one organization sends that one, matching utils/shared/agent-api.ts.
 * With several and no --org, nothing is sent and the API picks its default.
 */
function organizationFor(
  explicit: string | undefined,
  known: OrgInfo[] | undefined
): string | undefined {
  if (explicit) {
    return explicit;
  }
  if (known && known.length === 1) {
    return known[0].id;
  }
  return;
}

/**
 * Resolve the target and refuse an API-key credential before any request.
 * A missing tokenType counts as a session: only an explicit "api-key" is
 * refused, so a target without that label (the contract test mock) proceeds.
 */
async function resolveTarget(
  command: string,
  options: ApiKeysCommonOptions
): Promise<Target | null> {
  const check = checkApiTarget(
    await resolveApiTarget({ token: options.token })
  );
  if (!check.ok) {
    emitError(command, {
      code: "NOT_AUTHENTICATED",
      message: `${check.reason}.`,
      suggestion: check.suggestion,
    });
    return null;
  }

  const { apiBase, token, tokenType, organizations } = check.target;
  if (tokenType === "api-key") {
    emitError(command, {
      code: "SESSION_REQUIRED",
      message:
        "API keys cannot manage API keys. This command needs a device-login session, not a wraps_ key.",
      suggestion: SESSION_SUGGESTION,
    });
    return null;
  }

  return {
    apiBase,
    token,
    organizationId: organizationFor(options.org, organizations),
  };
}

type ApiRequest = {
  command: string;
  target: Target;
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
};

async function callApi(request: ApiRequest): Promise<ApiOutcome> {
  const { command, target, method, path, body } = request;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${target.token}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (target.organizationId) {
    headers["X-Organization-Id"] = target.organizationId;
  }

  let resp: Response;
  try {
    resp = await fetch(`${target.apiBase}${path}`, {
      method,
      headers,
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
        "Retry shortly. If it keeps failing, include this command and its output in your report.",
    });
    return { ok: false };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

function isKeyView(value: unknown): value is ApiKeyView {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as ApiKeyView).id === "string" &&
    typeof (value as ApiKeyView).prefix === "string"
  );
}

function describeKey(key: ApiKeyView): string {
  const used = key.lastUsedAt ?? "never";
  return `${key.name}  ${key.prefix}  id ${key.id}  last used ${used}`;
}

export async function apiKeysList(options: ApiKeysListOptions): Promise<void> {
  const command = "api-keys.list";
  const target = await resolveTarget(command, options);
  if (!target) {
    return;
  }

  const outcome = await callApi({
    command,
    target,
    method: "GET",
    path: "/v1/api-keys",
  });
  if (!outcome.ok) {
    return;
  }

  const keys = outcome.body.apiKeys;
  if (!(Array.isArray(keys) && keys.every(isKeyView))) {
    emitError(command, {
      code: "API_ERROR",
      message: "The Wraps API returned a key list that could not be read.",
      suggestion:
        "Retry shortly. If it keeps failing, include this command and its output in your report.",
    });
    return;
  }

  if (isJsonMode()) {
    jsonSuccess(command, { apiKeys: keys });
    return;
  }
  if (keys.length === 0) {
    log.info(
      'No API keys in this organization. Create one with: wraps api-keys create --name "<name>"'
    );
    return;
  }
  note(keys.map(describeKey).join("\n"), "API keys");
}

export async function apiKeysCreate(
  options: ApiKeysCreateOptions
): Promise<void> {
  const command = "api-keys.create";

  // Local validation first: no request is made for a bad flag.
  const name = parseName(options.name);
  if (!name.ok) {
    emitError(command, name.error);
    return;
  }
  const type = parseType(options.type);
  if (!type.ok) {
    emitError(command, type.error);
    return;
  }
  const permissions = parsePermissions(options.permissions);
  if (!permissions.ok) {
    emitError(command, permissions.error);
    return;
  }
  const expiresInDays = parseExpiresInDays(options.expiresInDays);
  if (!expiresInDays.ok) {
    emitError(command, expiresInDays.error);
    return;
  }

  const target = await resolveTarget(command, options);
  if (!target) {
    return;
  }

  const body: Record<string, unknown> = { name: name.value };
  if (type.value !== undefined) {
    body.type = type.value;
  }
  if (permissions.value !== undefined) {
    body.permissions = permissions.value;
  }
  if (expiresInDays.value !== undefined) {
    body.expiresInDays = expiresInDays.value;
  }

  const outcome = await callApi({
    command,
    target,
    method: "POST",
    path: "/v1/api-keys",
    body,
  });
  if (!outcome.ok) {
    return;
  }

  // Validate without ever putting the body into an error message.
  const { apiKey, secretKey } = outcome.body;
  if (
    !(
      isKeyView(apiKey) &&
      typeof secretKey === "string" &&
      secretKey.length > 0
    )
  ) {
    emitError(command, {
      code: "API_ERROR",
      message:
        "The Wraps API created the key but the response could not be read. Run: wraps api-keys list to see whether it exists.",
      suggestion:
        "Run: wraps api-keys list. Revoke any stray key with: wraps api-keys revoke <key-id> --yes",
    });
    return;
  }

  if (isJsonMode()) {
    jsonSuccess(command, { apiKey, secretKey });
    return;
  }
  log.success(`Created API key "${apiKey.name}" (${apiKey.prefix})`);
  note(
    secretKey,
    "Copy this key now. It is shown once and cannot be retrieved again."
  );
}

export async function apiKeysRevoke(
  options: ApiKeysRevokeOptions
): Promise<void> {
  const command = "api-keys.revoke";
  if (!options.id) {
    emitError(
      command,
      missingInput("API key id", "wraps api-keys revoke <key-id> --yes")
    );
    return;
  }

  // --dry-run makes no request, so it needs no credentials and no --yes.
  if (options.dryRun) {
    const data = { id: options.id, revoked: false, dryRun: true };
    if (isJsonMode()) {
      jsonSuccess(command, data);
      return;
    }
    log.info(
      `Dry run: API key ${options.id} would be revoked. No request was sent.`
    );
    return;
  }

  if (!options.yes) {
    emitError(command, {
      code: "CONFIRMATION_REQUIRED",
      message: `Revoking API key ${options.id} is permanent. Any running agent, script or integration that uses it will fail immediately. Nothing was revoked because --yes was not passed.`,
      suggestion: `Re-run with --yes to confirm: wraps api-keys revoke ${options.id} --yes`,
    });
    return;
  }

  const target = await resolveTarget(command, options);
  if (!target) {
    return;
  }

  // confirm=true is required by the route. The id stays one encoded segment.
  const outcome = await callApi({
    command,
    target,
    method: "DELETE",
    path: `/v1/api-keys/${encodeURIComponent(options.id)}?confirm=true`,
  });
  if (!outcome.ok) {
    return;
  }

  const data = { id: options.id, revoked: true, dryRun: false };
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }
  log.success(`Revoked API key ${options.id}`);
}
