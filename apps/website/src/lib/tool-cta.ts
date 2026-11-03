import type { RateStatus } from "@/lib/ses-bounce-rate";
import { trackEvent } from "@/utils/analytics";

/**
 * The signup box on the free tool pages: what it says for a given result, and the
 * analytics it reports.
 *
 * The tools stay free and ungated. This only decides which offer to put next to a
 * result, so someone with a failing record sees the one command that fixes it. Every
 * claim here is already stated in the README or llms.txt; keep it that way, and keep
 * prices out (the pricing page owns those).
 *
 * `signup_click` is captured for any link into the dashboard's signup flow by
 * `lib/signup-click.ts`. The `tool_cta_*` events add which tool and which state the
 * visitor was looking at, which a bare signup click cannot say.
 */

export const TOOL_SIGNUP_URL = "https://app.wraps.dev/auth?mode=signup";
export const TOOL_CTA_VARIANT = "tool_box_v1";

const INIT_COMMAND = "npx @wraps.dev/cli email init";
const CONNECT_COMMAND = "npx @wraps.dev/cli email connect";

/** The three sample domains offered on the checker. Not the visitor's own setup. */
export const DEMO_DOMAINS = [
  "gmail.com",
  "microsoft.com",
  "stripe.com",
] as const;

export type ToolId =
  | "checker"
  | "spf-builder"
  | "dmarc-builder"
  | "bounce-rate"
  | "header-analyzer"
  | "better-auth-guide";

export type ToolCtaState =
  | "demo"
  | "ses-with-issues"
  | "issues"
  | "clean"
  | "builder"
  | "rates-risk"
  | "rates-ok"
  | "headers-fail"
  | "headers-ok"
  | "guide";

export type ToolCta = {
  state: ToolCtaState;
  headline: string;
  body: string;
  /** A command to show and copy, or null when the offer is only the signup. */
  command: string | null;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
};

const signup = (label: string) => ({ label, href: TOOL_SIGNUP_URL });

const toInit = (): Pick<ToolCta, "command" | "secondary"> => ({
  command: INIT_COMMAND,
  secondary: { label: "Read the quickstart", href: "/docs/quickstart" },
});

const toConnect = (): Pick<ToolCta, "command" | "secondary"> => ({
  command: CONNECT_COMMAND,
  secondary: {
    label: "Read the email quickstart",
    href: "/docs/quickstart/email",
  },
});

// ── SES detection ───────────────────────────────────────────────────

const SES_DOMAIN = "amazonses.com";
const AWS_SPF_HOST = "_spf.aws";
const SPF_QUALIFIER = /^[+\-~?]/;
const SPF_TARGET = /^(?:include:|redirect=)(.+)$/;
const TRAILING_DOT = /\.$/;
const WHITESPACE = /\s+/;

/** A host that is `amazonses.com` or a subdomain of it, never a look-alike such as
 * `notamazonses.com` or `amazonses.com.example.org`. */
function isSesHost(host: string): boolean {
  const bare = host.trim().toLowerCase().replace(TRAILING_DOT, "");
  return bare === SES_DOMAIN || bare.endsWith(`.${SES_DOMAIN}`);
}

/** The hosts an SPF record delegates to through `include:` or `redirect=`. */
function spfDelegatedHosts(spf: string): string[] {
  const hosts: string[] = [];
  for (const token of spf.toLowerCase().split(WHITESPACE)) {
    const target = SPF_TARGET.exec(token.replace(SPF_QUALIFIER, ""));
    if (target?.[1]) {
      hosts.push(target[1]);
    }
  }
  return hosts;
}

/**
 * Whether a domain sends through Amazon SES, from signals the checker already has.
 * SES picks DKIM selectors at random, so DKIM records cannot identify it; SPF, the
 * checker's own "AWS SES" DKIM warning and an SES MX host can.
 *
 * Hosts are compared whole, not by substring, so a look-alike domain is not taken for
 * SES.
 */
export function detectSes(input: {
  spfRecord: string | null;
  spfIncludes: string[];
  dkimWarnings: string[];
  mxExchanges: string[];
}): boolean {
  const delegated = spfDelegatedHosts(
    [input.spfRecord ?? "", ...input.spfIncludes].join(" ")
  );
  if (
    delegated.some(
      (host) =>
        isSesHost(host) ||
        host.trim().replace(TRAILING_DOT, "") === AWS_SPF_HOST
    )
  ) {
    return true;
  }
  if (input.dkimWarnings.some((w) => w.toLowerCase().includes("aws ses"))) {
    return true;
  }
  return input.mxExchanges.some(isSesHost);
}

// ── Checker ─────────────────────────────────────────────────────────

export type CheckStatus = "pass" | "warn" | "fail" | "none";

const LEADING_WWW = /^www\./;

function isDemoDomain(domain: string): boolean {
  const bare = domain.trim().toLowerCase().replace(LEADING_WWW, "");
  return (DEMO_DOMAINS as readonly string[]).includes(bare);
}

export function checkerCta(input: {
  domain: string;
  spf: CheckStatus;
  dkim: CheckStatus;
  dmarc: CheckStatus;
  onSes: boolean;
  /** SES's random selectors mean a missing DKIM result says nothing about it. */
  dkimUnverifiable: boolean;
}): ToolCta {
  if (isDemoDomain(input.domain)) {
    return {
      state: "demo",
      headline: "Need to set up email infrastructure?",
      body: "Wraps deploys production-ready email infrastructure to your AWS account in under 2 minutes.",
      primary: signup("Start free"),
      ...toInit(),
    };
  }

  const checks: CheckStatus[] = [input.spf, input.dmarc];
  if (!input.dkimUnverifiable) {
    checks.push(input.dkim);
  }
  const issues = checks.filter((status) => status !== "pass").length;

  if (issues > 0 && input.onSes) {
    return {
      state: "ses-with-issues",
      headline: `This domain sends through SES and has ${issues} email authentication ${issues === 1 ? "issue" : "issues"}`,
      body: "Connect reads your existing SES setup without changing it, then shows your bounces, complaints and these records in a dashboard.",
      primary: signup("Connect your SES account"),
      ...toConnect(),
    };
  }

  if (issues > 0) {
    return {
      state: "issues",
      headline: "Set up SPF, DKIM and DMARC the easy way",
      body: "Wraps deploys Amazon SES in your own AWS account and sets up DKIM, SPF and DMARC for your domain. It takes about two minutes.",
      primary: signup("Start free"),
      ...toInit(),
    };
  }

  return {
    state: "clean",
    headline: "This domain looks healthy. Keep it that way.",
    body: "Wraps tracks bounces and complaints from your own SES account and alerts you before AWS reviews or pauses sending.",
    command: null,
    primary: signup("Start free"),
    secondary: { label: "Read the quickstart", href: "/docs/quickstart" },
  };
}

// ── Record builders ─────────────────────────────────────────────────

export function builderCta(_kind: "spf" | "dmarc"): ToolCta {
  return {
    state: "builder",
    headline: "Skip the copy and paste",
    body: "Wraps sets up SPF, DKIM and DMARC for your sending domain in your own AWS account, and checks that they verify.",
    primary: signup("Start free"),
    ...toInit(),
  };
}

// ── Bounce and complaint rates ──────────────────────────────────────

export function ratesCta(statuses: RateStatus[]): ToolCta {
  const risk = statuses.some((status) => status !== "within-best-practice");
  if (risk) {
    return {
      state: "rates-risk",
      headline: "Catch this before AWS does",
      body: "Wraps reads these rates from your own SES account, draws AWS's review and pause lines on them, and alerts you when you cross one.",
      primary: signup("Start free"),
      ...toConnect(),
    };
  }
  return {
    state: "rates-ok",
    headline: "Watch it without a spreadsheet",
    body: "Wraps reads bounce and complaint rates from your own SES account and alerts you before AWS reviews or pauses sending.",
    primary: signup("Start free"),
    ...toConnect(),
  };
}

// ── Header analyzer ─────────────────────────────────────────────────

const FAILING_RESULTS = new Set(["fail", "softfail", "permerror", "none"]);

export function headersCta(input: {
  results: string[];
  /** Whether Return-Path and From align. Null when either is missing. */
  aligned: boolean | null;
}): ToolCta {
  const failing =
    input.aligned === false ||
    input.results.some((result) => FAILING_RESULTS.has(result.toLowerCase()));

  if (failing) {
    return {
      state: "headers-fail",
      headline: "A failing check usually means a DNS fix",
      body: "Wraps sets up DKIM, SPF and DMARC for your sending domain in your own AWS account, and shows delivery, bounce and complaint events for every message.",
      primary: signup("Start free"),
      ...toInit(),
    };
  }
  return {
    state: "headers-ok",
    headline: "Send through Amazon SES? See every message's outcome",
    body: "Wraps shows delivery, bounce and complaint events for each message sent from your own AWS account.",
    primary: signup("Start free"),
    ...toConnect(),
  };
}

// ── Guides ──────────────────────────────────────────────────────────

/**
 * The end of the Better Auth guide. Sending goes straight from the reader's own SES
 * account and needs no Wraps account (only the optional contact sync takes an API
 * key), so a reader can finish without ever learning a dashboard exists. Docs tone: say what the dashboard adds, do not push.
 */
export function guideCta(): ToolCta {
  return {
    state: "guide",
    headline: "See whether your auth emails arrive",
    body: "Sending goes straight from your own AWS account and needs no Wraps account. Connect the same SES account to the Wraps dashboard to see every send, bounce and complaint, and to be alerted when something fails.",
    primary: signup("Connect your SES account"),
    ...toConnect(),
  };
}

// ── Analytics ───────────────────────────────────────────────────────

export type ToolCtaContext = {
  tool: ToolId;
  state: ToolCtaState;
  pagePath: string;
};

export type ToolCtaControl = "primary" | "secondary" | "copy";

const baseProperties = (context: ToolCtaContext) => ({
  tool: context.tool,
  state: context.state,
  page_path: context.pagePath,
  cta_variant: TOOL_CTA_VARIANT,
});

export function trackToolCtaView(context: ToolCtaContext): void {
  trackEvent("tool_cta_view", baseProperties(context));
}

export function trackToolCtaClick(
  context: ToolCtaContext,
  control: ToolCtaControl
): void {
  trackEvent("tool_cta_click", { ...baseProperties(context), control });
}
