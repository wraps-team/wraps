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
  actor?: string;
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
  all?: boolean;

  // Email agent
  name?: string;
  maxPerHour?: string;
  maxPerDay?: string;
  allowRecipient?: string[];
  allowDomain?: string[];
  clearAllowlist?: boolean;

  // Doctor
  cleanup?: boolean;

  // Inbound status
  revealSecret?: boolean;

  // Domain config
  opens?: boolean;
  clicks?: boolean;
  trackingDomain?: string;
  trackingHttps?: boolean;
  tlsRequired?: boolean;
  reputationMetrics?: boolean;
  suppressBounce?: boolean;
  suppressComplaint?: boolean;
  archive?: boolean;
  sendingEnabled?: boolean;
  vdmEngagement?: boolean;
  vdmInbox?: boolean;
  autoValidation?: boolean;
  validationThreshold?: string;

  // Email vdm
  enable?: boolean;
  disable?: boolean;
  engagement?: boolean;
  optimizedDelivery?: boolean;

  // Email logs
  status?: string;
  limit?: string;
  cursor?: string;
  reason?: string;
  acknowledgeComplaint?: boolean;

  // Email plan
  set?: string;
  volume?: string;
  countries?: string;

  // Email production-access
  request?: boolean;
  website?: string;
  mailType?: string;
  contact?: string;

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

  // Agent-surface CLI (contacts, segments, broadcasts, workflows, metrics, health, approvals)
  audienceType?: string;
  awsAccountId?: string;
  body?: string;
  broadcastId?: string;
  channel?: string;
  company?: string;
  condition?: string;
  contactEmail?: string;
  contactId?: string;
  cron?: string;
  data?: string;
  description?: string;
  slug?: string;
  // Brand kits
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
  default?: boolean;
  public?: string;
  doubleOptIn?: string;
  dimensions?: string;
  email?: string;
  emailStatus?: string;
  endDate?: string;
  externalId?: string;
  firstName?: string;
  from?: string;
  fromChunkIndex?: string;
  fromName?: string;
  granularity?: string;
  htmlContent?: string;
  id?: string;
  jobTitle?: string;
  lastName?: string;
  outDir?: string;
  phone?: string;
  preferredChannel?: string;
  previewText?: string;
  properties?: string;
  replyTo?: string;
  scheduledFor?: string;
  search?: string;
  segmentId?: string;
  senderId?: string;
  smsStatus?: string;
  startDate?: string;
  subject?: string;
  templateId?: string;
  timezone?: string;
  topicId?: string;
  topicIds?: string;
  totalRecipients?: string;
  trackMembership?: boolean;
  variableMappings?: string;
  eventName?: string;
  dateFrom?: string;
  dateTo?: string;
  days?: string;
  withoutSource?: boolean;
  file?: string;
  format?: string;
  output?: string;
  emails?: string;
  validate?: boolean;
  duplicateStrategy?: string;

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
  /**
   * Positionals at index 4 and beyond. Nothing in the dispatch reads these, so
   * their presence means the user's invocation was misunderstood — most often a
   * value passed to a valueless boolean flag, which mri re-emits as a positional.
   */
  extraPositionals: string[];
};

/**
 * String-valued flags. These must take an argument. Listed explicitly so mri
 * treats the next token as the value (preserving strings like `+15555551234`
 * instead of coercing to numbers).
 */
const STRING_FLAGS = [
  "name",
  "max-per-hour",
  "max-per-day",
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
  "type",
  "permissions",
  "expires-in-days",
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
  "reason",
  "cursor",
  "set",
  "volume",
  "countries",
  "website",
  "mail-type",
  "contact",
  "since",
  "filter",
  "source",
  "validation-threshold",
  "audience-type",
  "aws-account-id",
  "body",
  "broadcast-id",
  "channel",
  "company",
  "condition",
  "contact-email",
  "contact-id",
  "cron",
  "data",
  "description",
  "slug",
  "logo-url",
  "primary-color",
  "secondary-color",
  "background-color",
  "text-color",
  "font-family",
  "heading-font-family",
  "button-style",
  "button-radius",
  "company-name",
  "company-address",
  "social-links",
  "source-domain",
  "public",
  "double-opt-in",
  "dimensions",
  "email",
  "email-status",
  "end-date",
  "external-id",
  "first-name",
  "from",
  "from-chunk-index",
  "from-name",
  "granularity",
  "html-content",
  "id",
  "job-title",
  "last-name",
  "out-dir",
  "phone",
  "preferred-channel",
  "preview-text",
  "properties",
  "reply-to",
  "scheduled-for",
  "search",
  "segment-id",
  "sender-id",
  "sms-status",
  "start-date",
  "subject",
  "template-id",
  "timezone",
  "topic-id",
  "topic-ids",
  "total-recipients",
  "variable-mappings",
  "actor",
  "file",
  "format",
  "output",
  "emails",
  "duplicate-strategy",
  "event-name",
  "date-from",
  "date-to",
  "days",
] as const;

/**
 * Boolean flags. These do NOT take an argument. Listed explicitly so mri
 * doesn't consume the next positional as the flag's value — which is the
 * root cause of wraps-team/wraps#100 under `args` v5.
 */
const BOOLEAN_FLAGS = [
  "clear-allowlist",
  "clear-name",
  "clear-subject",
  "clear-preview-text",
  "clear-from",
  "clear-from-name",
  "clear-reply-to",
  "clear-template-id",
  "clear-html-content",
  "clear-body",
  "clear-sender-id",
  "clear-topic-id",
  "clear-segment-id",
  "clear-aws-account-id",
  "clear-scheduled-for",
  "clear-variable-mappings",
  "all",
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
  "acknowledge-complaint",
  "draft",
  "root",
  "cleanup",
  "reveal-secret",
  "opens",
  "clicks",
  "tracking-https",
  "tls-required",
  "reputation-metrics",
  "suppress-bounce",
  "suppress-complaint",
  "archive",
  "sending-enabled",
  "vdm-engagement",
  "vdm-inbox",
  "auto-validation",
  "enable",
  "disable",
  "engagement",
  "optimized-delivery",
  "help",
  "version",
  "follow",
  "errors",
  "live",
  "platform",
  "request",
  "track-membership",
  "without-source",
  "validate",
  "default",
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
 * Convert a kebab-cased option name to camelCase.
 */
const toCamel = (name: string): string =>
  name.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());

/**
 * Repeatable string flags. mri returns a string for one occurrence and an
 * array for several; both surface as string[] so handlers never branch on
 * the shape.
 */
const LIST_FLAGS = ["allow-recipient", "allow-domain"] as const;

/** Every camelCase key parseCliArgs can put on `flags`. */
export const KNOWN_FLAG_KEYS: ReadonlySet<string> = new Set([
  ...[...STRING_FLAGS, ...LIST_FLAGS, ...BOOLEAN_FLAGS].map(toCamel),
  ...NEGATED_BOOLEANS.map((n) => n.camelKey),
]);

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
 * Resolve a tri-state boolean option: `true`, explicitly `false`, or unset.
 *
 * `parseCliArgs` only surfaces booleans that are true (see the BOOLEAN_FLAGS
 * loop below — the legacy "omit when absent" shape), so `--no-thing` reaches a
 * command as `undefined` and its "off" intent survives only in argv. Commands
 * that need to tell "off" from "not mentioned" — every setting a user can
 * toggle back — must read it back through here rather than testing argv inline.
 *
 * `argv` is injectable so callers are testable without mutating `process.argv`.
 */
export function resolveNegatableFlag(
  value: boolean | undefined,
  negatedArg: string,
  argv: string[] = process.argv
): boolean | undefined {
  if (value !== undefined) {
    return value;
  }
  return argv.includes(negatedArg) ? false : undefined;
}

/**
 * A negative number (`-1`, `-5`, `-0.5`). mri reads any `-<token>` as a cluster
 * of short flags, so `--limit -1` lost its value and `-1` became a phantom
 * flag `1`.
 */
const NEGATIVE_NUMBER = /^-\d+(\.\d+)?$/;

/** A long flag name without its value, e.g. `--limit`. */
const LONG_FLAG_NAME = /^--([a-z][a-z0-9-]*)$/;

/** Private-use prefix marking a protected positional; never a real argument. */
const PROTECTED_POSITIONAL = "\uE000";

/**
 * Rewrites argv so mri keeps negative numbers intact, without touching any
 * real flag. Two cases:
 *
 * - `--name -1`, where `--name` is a value flag (not declared boolean, not
 *   `--no-*`): becomes `--name=-1`, which mri already parses correctly.
 *   Applies to declared string flags and undeclared ones alike, the same
 *   tokens mri already treats as values; `-x` or `-h` are not numeric, so
 *   they keep today's behaviour.
 * - a bare `-1` anywhere else: swapped for a placeholder so mri files it as a
 *   positional, and `restore` puts `-1` back in place.
 *
 * Everything after `--` is passed through untouched.
 */
function protectNegativeNumbers(userArgs: string[]): {
  argv: string[];
  restore: (positional: string) => string;
  restoreFlagValues: (parsed: Record<string, unknown>) => void;
} {
  const booleans = new Set<string>([
    ...BOOLEAN_FLAGS,
    ...NEGATED_BOOLEANS.map((n) => n.positive),
  ]);
  const originals: string[] = [];
  const argv: string[] = [];

  for (let i = 0; i < userArgs.length; i++) {
    const token = userArgs[i];
    if (token === "--") {
      argv.push(...userArgs.slice(i));
      break;
    }
    const name = LONG_FLAG_NAME.exec(token)?.[1];
    const next = userArgs[i + 1];
    if (
      name !== undefined &&
      !booleans.has(name) &&
      !name.startsWith("no-") &&
      next !== undefined &&
      NEGATIVE_NUMBER.test(next)
    ) {
      argv.push(`${token}=${next}`);
      i += 1;
    } else if (NEGATIVE_NUMBER.test(token)) {
      originals.push(token);
      argv.push(`${PROTECTED_POSITIONAL}${originals.length - 1}`);
    } else {
      argv.push(token);
    }
  }

  // A short string flag (`-d -1`) takes the placeholder as its value, since
  // mri cannot tell that it is not a flag. Put the number back.
  const restore = (text: string): string =>
    text.startsWith(PROTECTED_POSITIONAL)
      ? (originals[Number(text.slice(PROTECTED_POSITIONAL.length))] ?? text)
      : text;

  return {
    argv,
    restore,
    restoreFlagValues: (parsed) => {
      for (const key of Object.keys(parsed)) {
        const value = parsed[key];
        if (typeof value === "string") {
          parsed[key] = restore(value);
        }
      }
    },
  };
}

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

  const protectedArgs = protectNegativeNumbers(userArgs);
  const parsed = mri<Record<string, unknown>>(protectedArgs.argv, {
    boolean: [...BOOLEAN_FLAGS, ...NEGATED_BOOLEANS.map((n) => n.positive)],
    string: [...STRING_FLAGS, ...LIST_FLAGS],
    alias: ALIAS,
  });
  protectedArgs.restoreFlagValues(parsed);

  const flags: CliFlags = {};

  for (const key of STRING_FLAGS) {
    const value = parsed[key];
    if (typeof value === "string" && value.length > 0) {
      (flags as Record<string, unknown>)[toCamel(key)] = value;
    }
  }

  for (const key of LIST_FLAGS) {
    const raw = parsed[key];
    const values = (Array.isArray(raw) ? raw : [raw]).filter(
      (v): v is string => typeof v === "string" && v.length > 0
    );
    if (values.length > 0) {
      (flags as Record<string, unknown>)[toCamel(key)] = values;
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

  const positionals = (parsed._ as string[]).map(protectedArgs.restore);

  return {
    flags,
    sub: positionals,
    extraPositionals: positionals.slice(4),
  };
}
