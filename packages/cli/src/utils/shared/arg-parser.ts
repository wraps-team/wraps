import mri from "mri";

/**
 * Shape of parsed CLI flags, matching the legacy `args` v5 output so existing
 * command handlers don't need to change.
 */
export type CliFlags = {
  // Global
  provider?: string;
  region?: string;
  domain?: string;
  account?: string;
  preset?: string;
  yes?: boolean;
  force?: boolean;
  port?: string;
  noOpen?: boolean;
  preview?: boolean;

  // SMS
  to?: string;
  message?: string;
  phoneNumber?: string;
  code?: string;
  list?: boolean;
  delete?: boolean;
  resend?: boolean;

  // Email upgrade / test / verify
  action?: string;
  scenario?: string;
  wait?: boolean;
  interval?: string;

  // Email check
  quick?: boolean;
  json?: boolean;
  token?: string;
  verbose?: boolean;
  dkimSelector?: string;
  skipBlacklists?: boolean;
  skipTls?: boolean;
  timeout?: string;

  // Permissions
  service?: string;

  // Templates / workflows
  template?: string;
  workflow?: string;
  dryRun?: boolean;
  draft?: boolean;
  noExample?: boolean;
  noClaude?: boolean;
  org?: string;

  // Inbound
  subdomain?: string;
  root?: boolean;

  // Doctor
  cleanup?: boolean;

  // Inbound status
  revealSecret?: boolean;

  // Domain config
  opens?: boolean;
  clicks?: boolean;
  trackingDomain?: string;
  tlsRequired?: boolean;
  reputationMetrics?: boolean;
  suppressBounce?: boolean;
  suppressComplaint?: boolean;
  archive?: boolean;
  sendingEnabled?: boolean;
  vdmEngagement?: boolean;
  vdmInbox?: boolean;

  // Email logs
  status?: string;
  limit?: string;
  cursor?: string;

  // Email plan
  set?: string;
  volume?: string;
  countries?: string;

  // License
  tier?: string;
  expires?: string;

  // Self-hosted
  databaseUrl?: string;
  neonApiKey?: string;
  neonOrgId?: string;
  licenseKey?: string;
  appUrl?: string;

  // Self-hosted logs
  follow?: boolean;
  errors?: boolean;
  live?: boolean;
  platform?: boolean;
  since?: string;
  filter?: string;
  source?: string;

  // Help / version (informational; cli.ts short-circuits before parsing)
  help?: boolean;
  version?: boolean;
};

export type ParsedCli = {
  flags: CliFlags;
  /**
   * Positional arguments. `sub[0]` is the primary command, `sub[1]` is the
   * subcommand, etc. — matches the legacy `args.sub` shape.
   */
  sub: string[];
};

/**
 * String-valued flags. These must take an argument. Listed explicitly so mri
 * treats the next token as the value (preserving strings like `+15555551234`
 * instead of coercing to numbers).
 */
const STRING_FLAGS = [
  "provider",
  "region",
  "domain",
  "tracking-domain",
  "account",
  "preset",
  "port",
  "to",
  "message",
  "phone-number",
  "code",
  "action",
  "scenario",
  "interval",
  "token",
  "dkim-selector",
  "timeout",
  "service",
  "template",
  "workflow",
  "org",
  "subdomain",
  "tier",
  "expires",
  "database-url",
  "neon-api-key",
  "neon-org-id",
  "license-key",
  "app-url",
  "status",
  "limit",
  "cursor",
  "set",
  "volume",
  "countries",
  "since",
  "filter",
  "source",
] as const;

/**
 * Boolean flags. These do NOT take an argument. Listed explicitly so mri
 * doesn't consume the next positional as the flag's value — which is the
 * root cause of wraps-team/wraps#100 under `args` v5.
 */
const BOOLEAN_FLAGS = [
  "yes",
  "force",
  "preview",
  "list",
  "delete",
  "resend",
  "wait",
  "quick",
  "json",
  "verbose",
  "skip-blacklists",
  "skip-tls",
  "dry-run",
  "draft",
  "root",
  "cleanup",
  "reveal-secret",
  "opens",
  "clicks",
  "tls-required",
  "reputation-metrics",
  "suppress-bounce",
  "suppress-complaint",
  "archive",
  "sending-enabled",
  "vdm-engagement",
  "vdm-inbox",
  "help",
  "version",
  "follow",
  "errors",
  "live",
  "platform",
] as const;

/**
 * Negated boolean flags. mri translates `--no-open` into `{ open: false }`,
 * so we watch the positive form and translate back to the legacy `noOpen`
 * shape that existing handlers expect.
 *
 * The positive form is also registered in mri's boolean list so the parser
 * doesn't consume the next positional as a value when the user passes the
 * negated form alone.
 */
const NEGATED_BOOLEANS: Array<{ positive: string; camelKey: keyof CliFlags }> =
  [
    { positive: "open", camelKey: "noOpen" },
    { positive: "example", camelKey: "noExample" },
    { positive: "claude", camelKey: "noClaude" },
  ];

/**
 * Short-form aliases. mri populates both sides when either is set.
 */
const ALIAS: Record<string, string> = {
  p: "provider",
  r: "region",
  d: "domain",
  y: "yes",
  f: "force",
  w: "wait",
  q: "quick",
  j: "json",
  h: "help",
  v: "version",
};

/**
 * Convert a kebab-cased option name to camelCase.
 */
const toCamel = (name: string): string =>
  name.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());

/**
 * Parse `process.argv` (including the leading `node` + script entries) into a
 * legacy-compatible `{ flags, sub }` shape.
 *
 * Key properties:
 * - Boolean flags declared in BOOLEAN_FLAGS do NOT consume the next positional.
 *   This fixes wraps-team/wraps#100 where `--force <slug>` silently dropped
 *   the slug under the legacy `args` v5 parser.
 * - String flags declared in STRING_FLAGS preserve their exact string value,
 *   including leading `+` on phone numbers.
 * - Negated booleans (`--no-open`, `--no-example`, `--no-claude`) are exposed
 *   as `noOpen`, `noExample`, `noClaude` for handler compatibility.
 */
export function parseCliArgs(argv: string[]): ParsedCli {
  // Skip the leading `node` + script entries, matching process.argv.slice(2).
  const userArgs = argv.slice(2);

  const parsed = mri<Record<string, unknown>>(userArgs, {
    boolean: [...BOOLEAN_FLAGS, ...NEGATED_BOOLEANS.map((n) => n.positive)],
    string: [...STRING_FLAGS],
    alias: ALIAS,
  });

  const flags: CliFlags = {};

  for (const key of STRING_FLAGS) {
    const value = parsed[key];
    if (typeof value === "string" && value.length > 0) {
      (flags as Record<string, unknown>)[toCamel(key)] = value;
    }
  }

  for (const key of BOOLEAN_FLAGS) {
    // Only surface booleans when set to true — matches the legacy "omit when
    // absent" shape and avoids polluting the flags bag with `false` entries.
    if (parsed[key] === true) {
      (flags as Record<string, unknown>)[toCamel(key)] = true;
    }
  }

  // Negated booleans: `--no-open` arrives as `open: false` from mri.
  for (const { positive, camelKey } of NEGATED_BOOLEANS) {
    if (parsed[positive] === false) {
      (flags as Record<string, unknown>)[camelKey] = true;
    }
  }

  return {
    flags,
    sub: parsed._ as string[],
  };
}
