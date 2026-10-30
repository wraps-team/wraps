/**
 * `wraps brand-kits` — brand kits over the /v1/brand-kits API.
 *
 * Pattern: commands/topics/topics.ts. Every error goes through emitError(),
 * which writes the JSON envelope (or a clack message in human mode) and sets
 * process.exitCode = 1. Missing ids, flags and bad values are reported before
 * any request is made.
 *
 * Pagination: none. `brand-kits list` is unpaginated: the route returns every
 * kit in the organization in one response, so the CLI takes no --limit or
 * --cursor. The JSON output carries `total`, the number of kits returned.
 *
 * Nullable fields (logo, heading font, company name and address, source
 * domain): pass the literal `null` to clear one on update.
 *
 * Writes need the templates write permission on the server. Reads need only
 * membership.
 *
 * Delete is destructive: it needs --yes, and --dry-run previews with no
 * request. The route also requires confirm=true in the query string, which the
 * CLI sends only after --yes.
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

type BrandKitCommonOptions = {
  token?: string;
  json?: boolean;
  region?: string;
};

/** Brand fields shared by create and update. Strings as typed on the CLI. */
type BrandFieldOptions = {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  headingFontFamily?: string;
  buttonStyle?: string;
  buttonRadius?: string;
  companyName?: string;
  companyAddress?: string;
  socialLinks?: string;
  sourceDomain?: string;
};

type BrandKitListOptions = BrandKitCommonOptions;

type BrandKitGetOptions = BrandKitCommonOptions & {
  id?: string;
};

type BrandKitCreateOptions = BrandKitCommonOptions &
  BrandFieldOptions & {
    default?: boolean;
  };

type BrandKitUpdateOptions = BrandKitCommonOptions &
  BrandFieldOptions & {
    id?: string;
  };

type BrandKitDeleteOptions = BrandKitCommonOptions & {
  id?: string;
  yes?: boolean;
  dryRun?: boolean;
};

type BrandKitSetDefaultOptions = BrandKitCommonOptions & {
  id?: string;
};

type ErrorSpec = {
  code: string;
  message: string;
  suggestion: string;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: ErrorSpec };

type Target = { apiBase: string; token: string };

type ApiOutcome = { ok: true; body: Record<string, unknown> } | { ok: false };

type SocialLink = { platform: string; url: string };

type BrandKitRow = {
  id: string;
  organizationId: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  headingFontFamily: string | null;
  buttonStyle: string;
  buttonRadius: string;
  companyName: string | null;
  companyAddress: string | null;
  socialLinks: SocialLink[];
  sourceDomain: string | null;
  autoExtracted: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Flags whose value may be cleared by passing the literal `null`. */
const NULLABLE_FIELDS = [
  "logoUrl",
  "headingFontFamily",
  "companyName",
  "companyAddress",
  "sourceDomain",
] as const;

/** Flags sent as plain strings. */
const PLAIN_FIELDS = [
  "name",
  "primaryColor",
  "secondaryColor",
  "backgroundColor",
  "textColor",
  "fontFamily",
  "buttonStyle",
  "buttonRadius",
] as const;

const CLEAR_VALUE = "null";

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

function invalidValue(message: string, suggestion: string): ErrorSpec {
  return { code: "INVALID_FLAG_VALUE", message, suggestion };
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
  if (status === 403) {
    return {
      code: "FORBIDDEN",
      message: text,
      suggestion:
        "Your role cannot change brand kits (writes need the templates write permission). Ask an organization admin to grant it, then retry.",
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: text,
      suggestion:
        "Check the brand kit id. List brand kits with: wraps brand-kits list",
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
        "Fix the values named in the message and retry. Run a command with --help to see the accepted flags.",
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

// Fixed output shape. Explicit field list keeps the JSON keys stable even if
// the route later adds fields.
function brandKitJson(kit: BrandKitRow): Record<string, unknown> {
  return {
    id: kit.id,
    organizationId: kit.organizationId,
    name: kit.name,
    logoUrl: kit.logoUrl,
    primaryColor: kit.primaryColor,
    secondaryColor: kit.secondaryColor,
    backgroundColor: kit.backgroundColor,
    textColor: kit.textColor,
    fontFamily: kit.fontFamily,
    headingFontFamily: kit.headingFontFamily,
    buttonStyle: kit.buttonStyle,
    buttonRadius: kit.buttonRadius,
    companyName: kit.companyName,
    companyAddress: kit.companyAddress,
    socialLinks: kit.socialLinks,
    sourceDomain: kit.sourceDomain,
    autoExtracted: kit.autoExtracted,
    isDefault: kit.isDefault,
    createdAt: kit.createdAt,
    updatedAt: kit.updatedAt,
  };
}

function kv(label: string, value: string): string {
  return `${pc.dim(label.padEnd(18))} ${value}`;
}

function printBrandKit(kit: BrandKitRow): void {
  note(
    [
      kv("ID:", kit.id),
      kv("Name:", kit.name),
      kv("Default:", kit.isDefault ? "yes" : "no"),
      kv("Primary color:", kit.primaryColor),
      kv("Secondary color:", kit.secondaryColor),
      kv("Background color:", kit.backgroundColor),
      kv("Text color:", kit.textColor),
      kv("Font family:", kit.fontFamily),
      kv("Heading font:", kit.headingFontFamily ?? pc.dim("—")),
      kv("Button style:", kit.buttonStyle),
      kv("Button radius:", kit.buttonRadius),
      kv("Logo URL:", kit.logoUrl ?? pc.dim("—")),
      kv("Company name:", kit.companyName ?? pc.dim("—")),
      kv("Company address:", kit.companyAddress ?? pc.dim("—")),
      kv("Source domain:", kit.sourceDomain ?? pc.dim("—")),
      kv("Social links:", String(kit.socialLinks.length)),
    ].join("\n"),
    `Brand kit — ${kit.name}`
  );
}

function parseSocialLinks(raw: string): Parsed<SocialLink[]> {
  const usage = `--social-links '[{"platform":"x","url":"https://x.com/acme"}]'`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: invalidValue(
        `--social-links is not valid JSON, got "${raw}"`,
        `Pass --social-links as a JSON array, for example: ${usage}. Pass [] to remove all links.`
      ),
    };
  }
  const valid =
    Array.isArray(parsed) &&
    parsed.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).platform === "string" &&
        typeof (item as Record<string, unknown>).url === "string"
    );
  if (!valid) {
    return {
      ok: false,
      error: invalidValue(
        "--social-links must be a JSON array of {platform, url} objects",
        `Pass --social-links as a JSON array, for example: ${usage}.`
      ),
    };
  }
  return { ok: true, value: parsed as SocialLink[] };
}

/**
 * Turn the brand flags into a request body. Only flags the user passed are
 * included, so an update changes exactly those fields.
 */
function brandBody(
  options: BrandFieldOptions
): Parsed<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  for (const field of PLAIN_FIELDS) {
    const value = options[field];
    if (value !== undefined) {
      body[field] = value;
    }
  }
  for (const field of NULLABLE_FIELDS) {
    const value = options[field];
    if (value !== undefined) {
      body[field] = value === CLEAR_VALUE ? null : value;
    }
  }
  if (options.socialLinks !== undefined) {
    const links = parseSocialLinks(options.socialLinks);
    if (!links.ok) {
      return links;
    }
    body.socialLinks = links.value;
  }
  return { ok: true, value: body };
}

const BRAND_FLAG_USAGE =
  "[--name <name>] [--logo-url <url|null>] [--primary-color <color>] [--secondary-color <color>] [--background-color <color>] [--text-color <color>] [--font-family <font>] [--heading-font-family <font|null>] [--button-style <style>] [--button-radius <radius>] [--company-name <name|null>] [--company-address <text|null>] [--social-links <json array>] [--source-domain <domain|null>]";

export async function brandKitsList(
  options: BrandKitListOptions
): Promise<void> {
  const command = "brand-kits.list";

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const outcome = await callApi({
    command,
    target,
    method: "GET",
    path: "/v1/brand-kits",
  });
  if (!outcome.ok) {
    return;
  }

  const kits = (outcome.body.brandKits ?? []) as BrandKitRow[];
  const data = {
    brandKits: kits.map(brandKitJson),
    total: kits.length,
  };

  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }

  if (kits.length === 0) {
    log.info("No brand kits found. Create one with: wraps brand-kits create");
    return;
  }

  const rows = kits.map(
    (kit) =>
      `${kit.id}  ${kit.name}${kit.isDefault ? `  ${pc.cyan("(default)")}` : ""}`
  );
  note(rows.join("\n"), `Brand kits — ${kits.length} total`);
}

export async function brandKitsGet(options: BrandKitGetOptions): Promise<void> {
  const command = "brand-kits.get";
  if (!options.id) {
    emitError(
      command,
      missingInput("brand kit id", "wraps brand-kits get <brand-kit-id>")
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
    path: `/v1/brand-kits/${encodeURIComponent(options.id)}`,
  });
  if (!outcome.ok) {
    return;
  }

  const kit = outcome.body as unknown as BrandKitRow;
  if (isJsonMode()) {
    jsonSuccess(command, brandKitJson(kit));
    return;
  }
  printBrandKit(kit);
}

export async function brandKitsCreate(
  options: BrandKitCreateOptions
): Promise<void> {
  const command = "brand-kits.create";

  const built = brandBody(options);
  if (!built.ok) {
    emitError(command, built.error);
    return;
  }
  const body = built.value;
  if (options.default === true) {
    body.isDefault = true;
  }

  const target = await resolveTarget(command, options.token);
  if (!target) {
    return;
  }
  const outcome = await callApi({
    command,
    target,
    method: "POST",
    path: "/v1/brand-kits",
    body,
  });
  if (!outcome.ok) {
    return;
  }

  const kit = outcome.body as unknown as BrandKitRow;
  if (isJsonMode()) {
    jsonSuccess(command, brandKitJson(kit));
    return;
  }
  log.success(`Created brand kit ${kit.name} (${kit.id})`);
  printBrandKit(kit);
}

export async function brandKitsUpdate(
  options: BrandKitUpdateOptions
): Promise<void> {
  const command = "brand-kits.update";
  const usage = `wraps brand-kits update <brand-kit-id> ${BRAND_FLAG_USAGE}`;
  if (!options.id) {
    emitError(command, missingInput("brand kit id", usage));
    return;
  }

  const built = brandBody(options);
  if (!built.ok) {
    emitError(command, built.error);
    return;
  }
  if (Object.keys(built.value).length === 0) {
    emitError(command, {
      code: "MISSING_REQUIRED_FLAG",
      message: "Nothing to update",
      suggestion: `Pass at least one brand flag. Usage: ${usage}`,
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
    path: `/v1/brand-kits/${encodeURIComponent(options.id)}`,
    body: built.value,
  });
  if (!outcome.ok) {
    return;
  }

  const kit = outcome.body as unknown as BrandKitRow;
  if (isJsonMode()) {
    jsonSuccess(command, brandKitJson(kit));
    return;
  }
  log.success(`Updated brand kit ${kit.name} (${kit.id})`);
  printBrandKit(kit);
}

export async function brandKitsDelete(
  options: BrandKitDeleteOptions
): Promise<void> {
  const command = "brand-kits.delete";
  if (!options.id) {
    emitError(
      command,
      missingInput(
        "brand kit id",
        "wraps brand-kits delete <brand-kit-id> --yes"
      )
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
      `Dry run: brand kit ${options.id} would be deleted. If it is the default, another kit is promoted. Templates that used it lose the link. No request was sent.`
    );
    return;
  }

  if (!options.yes) {
    emitError(command, {
      code: "CONFIRMATION_REQUIRED",
      message:
        "Deleting a brand kit promotes another kit if it was the default, and templates that used it lose the link. Nothing was deleted because --yes was not passed.",
      suggestion: `Re-run with --yes to confirm: wraps brand-kits delete ${options.id} --yes`,
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
    path: `/v1/brand-kits/${encodeURIComponent(options.id)}?confirm=true`,
  });
  if (!outcome.ok) {
    return;
  }

  const data = { id: options.id, deleted: true, dryRun: false };
  if (isJsonMode()) {
    jsonSuccess(command, data);
    return;
  }
  log.success(`Deleted brand kit ${options.id}`);
}

export async function brandKitsSetDefault(
  options: BrandKitSetDefaultOptions
): Promise<void> {
  const command = "brand-kits.set-default";
  if (!options.id) {
    emitError(
      command,
      missingInput(
        "brand kit id",
        "wraps brand-kits set-default <brand-kit-id>"
      )
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
    method: "POST",
    path: `/v1/brand-kits/${encodeURIComponent(options.id)}/default`,
  });
  if (!outcome.ok) {
    return;
  }

  const kit = outcome.body as unknown as BrandKitRow;
  if (isJsonMode()) {
    jsonSuccess(command, brandKitJson(kit));
    return;
  }
  log.success(`${kit.name} (${kit.id}) is now the default brand kit`);
  printBrandKit(kit);
}
