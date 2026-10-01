/**
 * Workflow Processor Utilities
 *
 * Pure utility functions and types used by workflow step handlers
 * and the main workflow processor orchestrator.
 */

import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { toPlainText } from "@react-email/render";
import { renderTemplateStrict } from "@wraps/template-render";
import { Agent } from "undici";

import { log } from "../../lib/logger";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type WorkflowBranch =
  | "yes"
  | "no"
  | "timeout"
  | "default"
  | "opened"
  | "clicked"
  | "bounced";

// ═══════════════════════════════════════════════════════════════════════════
// VARIABLE SUBSTITUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Substitute variables in text with values from a data object.
 *
 * Delegates to the canonical `@wraps/template-render` so workflow sends
 * render templates exactly the same way as the dashboard preview, the
 * test-send endpoint, and the subscription confirmation mailer. The
 * package handles `{{var}}`, `{{#if}}/{{else}}/{{/if}}`, and dot paths.
 *
 * Nothing is entity-escaped, for HTML bodies included. SES renders the
 * template-backed branch of a workflow send server-side and substitutes
 * verbatim, so escaping here would make the raw-HTML fallback branches
 * render differently from the SES branch for the same template and the
 * same contact. See `@wraps/template-render` for the full rationale.
 *
 * Uses the strict renderer: a compile or runtime failure THROWS instead of
 * returning the raw template, which fails the workflow step and blocks the
 * send. The swallowing renderer shipped literal `{{#if firstName}}` subject
 * lines to 22 recipients (Apr–Jun 2026) — a blocked send is recoverable via
 * retry; a delivered template-soup email is not.
 *
 * @exported for testing
 */
export function substituteVariables(
  text: string,
  data: Record<string, string>
): string {
  try {
    return renderTemplateStrict(text, data);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error("Workflow: template render failed, send blocked", {
      textPreview: text.slice(0, 200),
      dataKeys: Object.keys(data),
      reason,
    });
    throw new Error(
      `Template rendering failed: ${reason}. Send blocked so the recipient does not receive raw {{...}} template syntax — fix the template, then retry.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sanitize email subject line
 * - Removes newlines to prevent header injection
 * - Collapses whitespace
 * - Truncates to reasonable length (998 chars per RFC 2822)
 *
 * Deliberately does NOT entity-escape: a subject is a plain-text header,
 * not HTML. Escaping here delivered subjects like "Smith &amp; Co" to
 * real inboxes (double-escaped when the renderer had already escaped).
 * Escaping for display belongs in the UI layer.
 */
export function sanitizeEmailSubject(subject: string): string {
  return subject
    .replace(/[\r\n]+/g, " ") // Remove newlines (header injection prevention)
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim()
    .slice(0, 998); // RFC 2822 max line length
}

/**
 * Convert HTML to plain text for email fallback
 * Uses react-email's toPlainText for robust HTML-to-text conversion
 */
export function htmlToPlainText(html: string): string {
  return toPlainText(html);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHONE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate phone number is in E.164 format
 * E.164: +[country code][subscriber number] (e.g., +15551234567)
 */
export function isValidE164Phone(phone: string): boolean {
  // E.164 format: + followed by 10-15 digits
  const e164Regex = /^\+[1-9]\d{9,14}$/;
  return e164Regex.test(phone);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONDITION EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

export function evaluateCondition(
  fieldValue: unknown,
  operator: string,
  compareValue: unknown
): boolean {
  const strFieldValue = String(fieldValue ?? "");
  const strCompareValue = String(compareValue ?? "");

  switch (operator) {
    case "equals":
      return strFieldValue === strCompareValue;
    case "not_equals":
      return strFieldValue !== strCompareValue;
    case "contains":
      return strFieldValue.includes(strCompareValue);
    case "not_contains":
      return !strFieldValue.includes(strCompareValue);
    case "starts_with":
      return strFieldValue.startsWith(strCompareValue);
    case "ends_with":
      return strFieldValue.endsWith(strCompareValue);
    case "greater_than":
      return Number(fieldValue) > Number(compareValue);
    case "less_than":
      return Number(fieldValue) < Number(compareValue);
    case "greater_than_or_equals":
      return Number(fieldValue) >= Number(compareValue);
    case "less_than_or_equals":
      return Number(fieldValue) <= Number(compareValue);
    case "is_true":
      return (
        fieldValue === true || strFieldValue === "true" || strFieldValue === "1"
      );
    case "is_false":
      return (
        fieldValue === false ||
        fieldValue === null ||
        fieldValue === undefined ||
        strFieldValue === "false" ||
        strFieldValue === "0" ||
        strFieldValue === ""
      );
    case "is_set":
      return (
        fieldValue !== null && fieldValue !== undefined && fieldValue !== ""
      );
    case "is_not_set":
      return (
        fieldValue === null || fieldValue === undefined || fieldValue === ""
      );
    default:
      log.warn("Unknown condition operator", { operator });
      return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT FIELD CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const FIRST_CLASS_CONTACT_FIELDS = new Set([
  "preferredChannel",
  "firstName",
  "lastName",
  "company",
  "jobTitle",
]);

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK / SSRF VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

// Order matters: the first matching entry's label is returned. `::1` and `::`
// come before `::/96` so they keep the "loopback" label.
const BLOCKED_SUBNETS = [
  { network: "127.0.0.0", prefix: 8, family: "ipv4", label: "loopback" },
  { network: "10.0.0.0", prefix: 8, family: "ipv4", label: "private (10/8)" },
  {
    network: "169.254.0.0",
    prefix: 16,
    family: "ipv4",
    label: "link-local/IMDS",
  },
  { network: "0.0.0.0", prefix: 8, family: "ipv4", label: "unspecified" },
  {
    network: "100.64.0.0",
    prefix: 10,
    family: "ipv4",
    label: "private (100.64/10 CGN)",
  },
  {
    network: "172.16.0.0",
    prefix: 12,
    family: "ipv4",
    label: "private (172.16/12)",
  },
  {
    network: "192.0.0.0",
    prefix: 24,
    family: "ipv4",
    label: "IETF protocol assignments (192.0.0/24)",
  },
  {
    network: "192.168.0.0",
    prefix: 16,
    family: "ipv4",
    label: "private (192.168/16)",
  },
  {
    network: "198.18.0.0",
    prefix: 15,
    family: "ipv4",
    label: "benchmarking (198.18/15)",
  },
  { network: "224.0.0.0", prefix: 4, family: "ipv4", label: "multicast" },
  {
    network: "240.0.0.0",
    prefix: 4,
    family: "ipv4",
    label: "reserved/broadcast (240/4)",
  },
  { network: "::1", prefix: 128, family: "ipv6", label: "loopback" },
  { network: "::", prefix: 128, family: "ipv6", label: "loopback" },
  {
    network: "::",
    prefix: 96,
    family: "ipv6",
    label: "IPv4-compatible (deprecated)",
  },
  { network: "64:ff9b::", prefix: 96, family: "ipv6", label: "NAT64" },
  { network: "fc00::", prefix: 7, family: "ipv6", label: "private (ULA)" },
  { network: "fe80::", prefix: 10, family: "ipv6", label: "link-local" },
  { network: "ff00::", prefix: 8, family: "ipv6", label: "multicast" },
] as const;

// One BlockList per entry so a match can report its label. BlockList matches
// IPv4-mapped IPv6 (::ffff:7f00:1 and ::ffff:127.0.0.1) against IPv4 entries.
const BLOCKED_LISTS = BLOCKED_SUBNETS.map(
  ({ network, prefix, family, label }) => {
    const list = new BlockList();
    list.addSubnet(network, prefix, family);
    return { list, label };
  }
);

/** @exported for testing */
export function isBlockedIp(ip: string): string | null {
  const family = isIP(ip);
  if (family === 0) {
    return "not an IP address";
  }
  const type = family === 4 ? "ipv4" : "ipv6";
  for (const { list, label } of BLOCKED_LISTS) {
    if (list.check(ip, type)) {
      return label;
    }
  }
  return null;
}

/** @exported for testing */
export async function validateWebhookUrl(url: string): Promise<void> {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Webhook URL must use http(s), got ${parsed.protocol}`);
  }

  const dns = await import("node:dns/promises");
  const { address } = await dns.lookup(parsed.hostname);
  const blockedReason = isBlockedIp(address);
  if (blockedReason) {
    throw new Error(
      `Webhook URL resolves to blocked address (${blockedReason}): ${parsed.hostname} -> ${address}`
    );
  }
}

/**
 * Validate that all resolved addresses are allowed (not blocked).
 * Extracted as a pure function so it can be unit-tested directly
 * without a live socket.
 *
 * @exported for testing
 */
export function assertResolvedIpAllowed(addresses: string[]): void {
  for (const addr of addresses) {
    const blocked = isBlockedIp(addr);
    if (blocked) {
      throw new Error(`Connection to blocked address (${blocked}): ${addr}`);
    }
  }
}

/**
 * Build an undici dispatcher that validates the resolved IP of every
 * connection (including redirect hops) against isBlockedIp() at connect
 * time. This defeats DNS-rebinding TOCTOU: the IP that is connected to is
 * the IP that is checked.
 *
 * @exported for testing
 */
export function createSsrfSafeDispatcher(): Agent {
  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        dnsLookup(hostname, options, (err, address, family) => {
          if (err) {
            callback(err, address as never, family);
            return;
          }
          const addresses = Array.isArray(address)
            ? address.map((a) => (typeof a === "string" ? a : a.address))
            : [address];
          try {
            assertResolvedIpAllowed(addresses);
          } catch (blockErr) {
            callback(blockErr as Error, address as never, family);
            return;
          }
          callback(null, address as never, family);
        });
      },
    },
  });
}
