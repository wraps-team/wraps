/**
 * Read-side translation of AWS SES bounce / complaint / delivery diagnostics
 * into plain-English titles, explanations, and suggested actions.
 *
 * Pure module: no React, no fetch, no logging, no Date. Never throws on any
 * input — returns null or skips the offending recipient. The raw diagnostic
 * code is always preserved so a wrong translation can never hide ground truth.
 *
 * Reference data transcribed from
 * `.claude/sdlc/bounce-diagnostics-ui/2-research/library-docs/findings.md`
 * (AWS SES docs, RFC 3463, IANA MARF). Do not invent codes.
 */

export type DiagnosticSeverity =
  | "permanent"
  | "transient"
  | "success"
  | "info"
  | "unknown";

export type CodeTranslation = {
  title: string;
  explanation: string;
  suggestedAction?: string;
  code?: string;
  provider?: string;
  severity: DiagnosticSeverity;
};

export type RecipientDiagnostic = {
  emailAddress: string;
  translation: CodeTranslation | null;
  rawDiagnosticCode?: string;
};

export type EventDiagnostics = {
  headline: string;
  severity: DiagnosticSeverity;
  fields: Array<{ label: string; value: string; kind?: "datetime" }>;
  recipients?: RecipientDiagnostic[];
};

// RFC 3463 §3.2 class semantics (first digit). Used as the guaranteed fallback
// for both enhanced-code subject/class rollup and bare basic SMTP codes.
const CLASS_COPY: Record<
  string,
  {
    title: string;
    explanation: string;
    action: string;
    severity: DiagnosticSeverity;
  }
> = {
  "2": {
    title: "Delivered",
    explanation: "The receiving system reported a positive delivery action.",
    action: "No action needed — the message was accepted.",
    severity: "success",
  },
  "4": {
    title: "Temporary failure",
    explanation:
      "A temporary condition delayed delivery. The message itself is valid.",
    action: "Retry later — this class of failure is usually transient.",
    severity: "transient",
  },
  "5": {
    title: "Permanent failure",
    explanation:
      "Delivery is not likely to succeed by resending in the current form.",
    action: "Remove the address or fix the message before resending.",
    severity: "permanent",
  },
};

// RFC 3463 §3.3–§3.8 subject.detail catalog. Keyed `${subject}.${detail}` with
// the class (X) treated as a wildcard. Severity is derived from the class digit,
// so actions read from the common permanent (5.x.x) framing; the X.Y.0 rows are
// the subject-level fallback when an exact detail is unknown.
const RFC_SUBJECT_DETAIL: Record<
  string,
  { title: string; explanation: string; action: string }
> = {
  // X.0.x — Other / undefined
  "0.0": {
    title: "Other undefined status",
    explanation: "Only the class of the error is known.",
    action: "Fall back to class semantics (hard vs soft).",
  },
  // X.1.x — Addressing
  "1.0": {
    title: "Other address status",
    explanation: "Something about the address caused this report.",
    action: "Verify the recipient address.",
  },
  "1.1": {
    title: "Bad destination mailbox address",
    explanation: "The mailbox specified in the address does not exist.",
    action: "Remove the address — the mailbox doesn't exist.",
  },
  "1.2": {
    title: "Bad destination system address",
    explanation: "The destination system does not exist or cannot accept mail.",
    action: "Remove or verify the domain — the receiving system is invalid.",
  },
  "1.3": {
    title: "Bad destination mailbox address syntax",
    explanation: "The destination address was syntactically invalid.",
    action: "Fix the malformed address.",
  },
  "1.4": {
    title: "Destination mailbox address ambiguous",
    explanation:
      "The address matches more than one recipient on the destination system.",
    action: "Use a fully-qualified address — this one is ambiguous.",
  },
  "1.5": {
    title: "Destination address valid",
    explanation: "This mailbox address as specified was valid.",
    action: "Informational (success context).",
  },
  "1.6": {
    title: "Destination mailbox has moved",
    explanation: "Was valid, but mail is no longer accepted for that address.",
    action: "Remove — the mailbox moved with no forwarding.",
  },
  "1.7": {
    title: "Bad sender's mailbox address syntax",
    explanation: "The sender's address was syntactically invalid.",
    action: "Fix your envelope / From address.",
  },
  "1.8": {
    title: "Bad sender's system address",
    explanation:
      "The sender's system does not exist or can't accept return mail.",
    action: "Fix your sending domain / Return-Path.",
  },
  // X.2.x — Mailbox status
  "2.0": {
    title: "Other or undefined mailbox status",
    explanation: "Something about the destination mailbox caused this report.",
    action: "Inspect the raw diagnostic.",
  },
  "2.1": {
    title: "Mailbox disabled, not accepting messages",
    explanation: "The mailbox exists but is not accepting messages.",
    action: "Mailbox disabled or suspended — likely remove.",
  },
  "2.2": {
    title: "Mailbox full",
    explanation: "The mailbox is full (quota or physical capacity exceeded).",
    action: "Retry later — the inbox is full.",
  },
  "2.3": {
    title: "Message length exceeds administrative limit",
    explanation: "A per-mailbox message length limit has been exceeded.",
    action: "Reduce message size and resend.",
  },
  "2.4": {
    title: "Mailing list expansion problem",
    explanation: "The address is a mailing list and could not be expanded.",
    action: "List-side problem — investigate the target list.",
  },
  // X.3.x — Mail system status
  "3.0": {
    title: "Other or undefined mail system status",
    explanation:
      "The system normally accepts mail but something caused this report.",
    action: "Retry later; inspect the raw diagnostic.",
  },
  "3.1": {
    title: "Mail system full",
    explanation: "Mail system storage has been exceeded.",
    action: "Retry later — receiving system storage is full.",
  },
  "3.2": {
    title: "System not accepting network messages",
    explanation: "The host is not accepting messages.",
    action: "Retry later — receiving host is offline or refusing.",
  },
  "3.3": {
    title: "System not capable of selected features",
    explanation: "Selected features are not supported by the destination.",
    action: "Remove unsupported features (e.g. specific encodings).",
  },
  "3.4": {
    title: "Message too big for system",
    explanation: "The message is larger than the per-message size limit.",
    action: "Reduce message size and resend.",
  },
  "3.5": {
    title: "System incorrectly configured",
    explanation: "The system is not configured to accept this message.",
    action: "Receiver misconfiguration — retry or contact the receiver.",
  },
  // X.4.x — Network & routing
  "4.0": {
    title: "Other or undefined network or routing status",
    explanation: "A networking problem occurred; the cause is unclear.",
    action: "Transient — the sender will retry.",
  },
  "4.1": {
    title: "No answer from host",
    explanation: "The outbound connection was not answered (remote busy).",
    action: "Transient — retry later.",
  },
  "4.2": {
    title: "Bad connection",
    explanation: "A connection was established but couldn't complete.",
    action: "Transient — retry later.",
  },
  "4.3": {
    title: "Directory server failure",
    explanation: "A directory server was unavailable.",
    action: "Transient (receiver DNS/LDAP) — retry later.",
  },
  "4.4": {
    title: "Unable to route",
    explanation:
      "Couldn't determine the next hop; routing info was unavailable.",
    action: "Verify the domain's MX records.",
  },
  "4.5": {
    title: "Mail system congestion",
    explanation: "The mail system was congested.",
    action: "Transient — back off and retry.",
  },
  "4.6": {
    title: "Routing loop detected",
    explanation: "A routing loop forwarded the message too many times.",
    action: "Fix the forwarding / routing loop at the destination.",
  },
  "4.7": {
    title: "Delivery time expired",
    explanation: "The message was considered too old by the rejecting system.",
    action: "The message aged out — resend a fresh copy.",
  },
  // X.5.x — Protocol
  "5.0": {
    title: "Other or undefined protocol status",
    explanation: "A problem occurred with the delivery protocol.",
    action: "Inspect the raw diagnostic.",
  },
  "5.1": {
    title: "Invalid command",
    explanation: "A protocol command was out of sequence or unsupported.",
    action: "Usually a receiver / relay issue — inspect the diagnostic.",
  },
  "5.2": {
    title: "Syntax error",
    explanation: "A protocol command could not be interpreted.",
    action: "Protocol-level issue — inspect the diagnostic.",
  },
  "5.3": {
    title: "Too many recipients",
    explanation: "More recipients than the protocol could deliver.",
    action: "Reduce recipients per message.",
  },
  "5.4": {
    title: "Invalid command arguments",
    explanation: "A valid command was given with invalid arguments.",
    action: "Protocol-level issue — inspect the diagnostic.",
  },
  "5.5": {
    title: "Wrong protocol version",
    explanation: "A protocol version mismatch that couldn't be resolved.",
    action: "Rare — a receiver / relay issue.",
  },
  // X.6.x — Content / media
  "6.0": {
    title: "Other or undefined media error",
    explanation: "The content made the message undeliverable.",
    action: "Review message content and encoding.",
  },
  "6.1": {
    title: "Media not supported",
    explanation: "The media of the message is not supported.",
    action: "Change the content type or encoding.",
  },
  "6.2": {
    title: "Conversion required and prohibited",
    explanation: "Content must be converted but conversion is not permitted.",
    action: "Adjust the content to avoid conversion.",
  },
  "6.3": {
    title: "Conversion required but not supported",
    explanation: "Content must be converted but conversion isn't possible.",
    action: "Change the encoding or format.",
  },
  "6.4": {
    title: "Conversion with loss performed",
    explanation: "Delivered, but a conversion lost some data.",
    action: "Informational — review if fidelity matters.",
  },
  "6.5": {
    title: "Conversion failed",
    explanation: "A required conversion was unsuccessful.",
    action: "Change the content or encoding and resend.",
  },
  // X.7.x — Security / policy
  "7.0": {
    title: "Other or undefined security status",
    explanation: "A security-related rejection occurred.",
    action: "Check auth (SPF/DKIM/DMARC) and content policy.",
  },
  "7.1": {
    title: "Delivery not authorized, message refused",
    explanation: "The sender is not authorized to send to the destination.",
    action:
      "Most common policy block. Check SPF/DKIM/DMARC, IP reputation, and blocklists.",
  },
  "7.2": {
    title: "Mailing list expansion prohibited",
    explanation: "The sender is not authorized to send to this mailing list.",
    action: "You're not authorized to post to that list.",
  },
  "7.3": {
    title: "Security conversion required but not possible",
    explanation: "A required secure-protocol conversion wasn't possible.",
    action: "Rare — a receiver security policy.",
  },
  "7.4": {
    title: "Security features not supported",
    explanation: "The message used security features that can't be supported.",
    action: "Remove the unsupported security features.",
  },
  "7.5": {
    title: "Cryptographic failure",
    explanation: "Couldn't validate or decrypt the message in transport.",
    action: "Check your signing / encryption config.",
  },
  "7.6": {
    title: "Cryptographic algorithm not supported",
    explanation: "The necessary cryptographic algorithm isn't supported.",
    action: "Use a supported algorithm.",
  },
  "7.7": {
    title: "Message integrity failure",
    explanation: "The message was corrupted.",
    action: "Resend — possible tampering or corruption.",
  },
};

// Provider-specific diagnostic strings (findings.md §3). Matched case-insensitively
// as substrings against the raw diagnostic / SMTP response; they win over the
// generic RFC rendering because they carry provider-specific remediation
// (delisting portals, auth fixes). Match substrings are conservative — distinctive
// prose and bracket tags, never generic enhanced codes that collide with RFC.
type ProviderPattern = {
  provider: string;
  match: string[];
  code: string;
  title: string;
  explanation: string;
  action: string;
  severity: DiagnosticSeverity;
};

// Exported read-only for the catalog uniqueness test; nothing else reads it.
export const PROVIDER_PATTERNS: ProviderPattern[] = [
  {
    provider: "Gmail",
    match: ["does not exist"],
    code: "550 5.1.1",
    title: "Recipient account does not exist",
    explanation: "The Gmail account you tried to reach does not exist.",
    action: "Remove the address — the mailbox is invalid.",
    severity: "permanent",
  },
  {
    provider: "Gmail",
    match: ["is inactive"],
    code: "550 5.2.1",
    title: "Recipient account is inactive",
    explanation: "The Gmail account you tried to reach is inactive.",
    action: "Remove the address — the account is disabled or suspended.",
    severity: "permanent",
  },
  {
    provider: "Gmail",
    match: ["out of storage"],
    code: "552 5.2.2",
    title: "Recipient inbox is full",
    explanation: "The recipient's inbox is out of storage space.",
    action: "Retry later — the mailbox is full.",
    severity: "transient",
  },
  {
    provider: "Gmail",
    match: ["daily user sending limit"],
    code: "550 5.4.5",
    title: "Daily sending limit exceeded",
    explanation: "Your account exceeded its daily sending quota.",
    action: "Slow down and spread volume — your account hit its daily cap.",
    severity: "transient",
  },
  {
    provider: "Gmail",
    match: ["policy that prohibits"],
    code: "550 5.7.1",
    title: "Blocked by recipient domain policy",
    explanation:
      "The recipient domain has a policy that prohibits this message (unsolicited or policy block).",
    action: "Review content and consent — the recipient domain blocked it.",
    severity: "permanent",
  },
  {
    provider: "Gmail",
    match: ["5.7.26", "unauthenticated"],
    code: "550 5.7.26",
    title: "Blocked — sender not authenticated",
    explanation:
      "The message was blocked because the sender is unauthenticated.",
    action: "Fix SPF and DKIM alignment plus DMARC for the sending domain.",
    severity: "permanent",
  },
  {
    provider: "Gmail",
    match: ["5.7.27", "didn't pass spf"],
    code: "550 5.7.27",
    title: "Blocked — SPF failure",
    explanation: "The message failed SPF (envelope-sender SPF hard fail).",
    action: "Fix and align the SPF record for the MAIL FROM domain.",
    severity: "permanent",
  },
  {
    provider: "Gmail",
    match: ["5.7.25", "ptr record"],
    code: "550 5.7.25",
    title: "Blocked — missing PTR record",
    explanation: "The sending IP address doesn't have a PTR record.",
    action: "Configure reverse DNS (PTR) for the sending IP (BYOIP).",
    severity: "permanent",
  },
  {
    provider: "Gmail",
    match: ["low reputation"],
    code: "421 4.7.0",
    title: "Deferred — low IP reputation",
    explanation:
      "The message is suspicious due to the very low reputation of the sending IP.",
    action: "Transient — warm the IP and improve reputation; SES will retry.",
    severity: "transient",
  },
  {
    provider: "Gmail",
    match: ["4.7.28", "unusual rate of email"],
    code: "421 4.7.28",
    title: "Deferred — unusual sending rate",
    explanation:
      "Gmail detected an unusual rate of email originating from your IP address.",
    action: "Transient rate limit — reduce the send rate from that IP.",
    severity: "transient",
  },
  {
    provider: "Yahoo",
    match: ["[tss04]"],
    code: "421 4.7.0 [TSS04]",
    title: "Deferred — volume throttled",
    explanation:
      "The sending IP is rate-limited or flagged for volume or complaint signals (warmup throttle).",
    action: "Slow the ramp; reduce volume and complaints. Transient.",
    severity: "transient",
  },
  {
    provider: "Yahoo",
    match: ["[ph01]"],
    code: "554 5.5.4-3 [PH01]",
    title: "Rejected — Yahoo acceptance policy",
    explanation: "The message violates Yahoo's acceptance policy.",
    action: "Review Yahoo Postmaster policy; fix content and auth.",
    severity: "permanent",
  },
  {
    provider: "Yahoo",
    match: ["[bl21]"],
    code: "553 5.7.1 [BL21]",
    title: "Blocked — Spamhaus listing",
    explanation: "The sending IP is on Spamhaus's blocklist.",
    action: "Request Spamhaus delisting; check IP reputation.",
    severity: "permanent",
  },
  {
    provider: "Yahoo",
    match: ["[bl23]"],
    code: "553 5.7.1 [BL23]",
    title: "Blocked — Spamhaus XBL listing",
    explanation: "The IP is on Spamhaus's exploit blocklist (XBL).",
    action: "Delist from Spamhaus XBL — the IP may be compromised.",
    severity: "permanent",
  },
  {
    provider: "Yahoo",
    match: ["receiving mail too quickly"],
    code: "450 4.0.0",
    title: "Deferred — recipient throttled",
    explanation: "The recipient mailbox is throttled against volume.",
    action: "Transient — retry later.",
    severity: "transient",
  },
  {
    provider: "Yahoo",
    match: ["5.7.9"],
    code: "554 5.7.9",
    title: "Rejected — policy (commonly unauthenticated)",
    explanation: "The message was not accepted for policy reasons.",
    action: "Set up SPF, DKIM, and DMARC; align authentication.",
    severity: "permanent",
  },
  {
    provider: "Microsoft",
    match: ["5.7.606", "banned sending ip"],
    code: "550 5.7.606",
    title: "Blocked — banned sending IP",
    explanation: "Microsoft 365 banned the sending IP (access denied).",
    action:
      "Submit an IP delisting request at the Office 365 Anti-Spam IP Delist Portal (sender.office.com).",
    severity: "permanent",
  },
  {
    provider: "Microsoft",
    match: ["s3150"],
    code: "S3150",
    title: "Blocked — Microsoft block list",
    explanation: "The sending IP is on Microsoft's block list.",
    action: "Use the Microsoft 365 delisting form (olcsupport.office.com).",
    severity: "permanent",
  },
  {
    provider: "Microsoft",
    match: ["5.7.511", "banned sender"],
    code: "550 5.7.511",
    title: "Blocked — banned sender",
    explanation:
      "The address or IP is banned on Microsoft's protection.outlook.com.",
    action: "Fix auth and reputation; use Microsoft delisting / SNDS.",
    severity: "permanent",
  },
  {
    provider: "Apple",
    match: ["[cs01]"],
    code: "550 5.7.1 [CS01]",
    title: "Rejected — Apple local policy",
    explanation:
      "The message was rejected due to Apple's content / reputation policy.",
    action:
      "Improve auth and reputation. Apple has no public delist form — reduce spam signals.",
    severity: "permanent",
  },
  {
    provider: "Apple",
    match: ["[hm08]"],
    code: "554 5.7.1 [HM08]",
    title: "Rejected — Apple local policy",
    explanation:
      "The message was rejected due to Apple's host-based local policy.",
    action: "Improve auth and reputation to reduce spam signals.",
    severity: "permanent",
  },
];

function matchProvider(searchText: string): CodeTranslation | null {
  if (!searchText) {
    return null;
  }
  const lower = searchText.toLowerCase();
  for (const pattern of PROVIDER_PATTERNS) {
    if (pattern.match.some((needle) => lower.includes(needle))) {
      return {
        title: pattern.title,
        explanation: pattern.explanation,
        suggestedAction: pattern.action,
        code: pattern.code,
        provider: pattern.provider,
        severity: pattern.severity,
      };
    }
  }
  return null;
}

function classSeverity(cls: string): DiagnosticSeverity {
  if (cls === "2") {
    return "success";
  }
  if (cls === "4") {
    return "transient";
  }
  return "permanent";
}

const DSN_PREFIX_RE = /^\s*[a-z0-9-]+;\s*/i;
const CONTINUATION_FOLD_RE = /(\d{3})-/g;
const WHITESPACE_RE = /\s+/g;
// Clean `status` DSN field: it is JUST the enhanced code, so match it bare.
const ENHANCED_STATUS_RE = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/;
// Free text (diagnosticCode / smtpResponse): require the enhanced code to be
// adjacent to a 3-digit SMTP reply code, so IP octets ("2.16.34.10") and version
// banners ("Postfix 2.11.3") are not misread as enhanced status codes.
const ENHANCED_FREETEXT_RE = /\b\d{3}[ -]+([245])\.(\d{1,3})\.(\d{1,3})\b/;
const BASIC_CODE_RE = /\b([245])\d{2}\b/;

// Strip DSN type prefix (`smtp;` / `X-Postfix;`), collapse `550-` continuation
// folds to `550 `, and collapse newlines / runs of whitespace.
function normalizeDiagnostic(code: string): string {
  return code
    .replace(DSN_PREFIX_RE, "")
    .replace(CONTINUATION_FOLD_RE, "$1 ")
    .replace(WHITESPACE_RE, " ")
    .trim();
}

function matchEnhancedCode(
  source: string | undefined,
  pattern: RegExp
): CodeTranslation | null {
  if (!source) {
    return null;
  }
  const match = source.match(pattern);
  if (!match) {
    return null;
  }
  const [, cls, subject, detail] = match;
  const code = `${cls}.${subject}.${detail}`;
  const severity = classSeverity(cls);
  const row =
    RFC_SUBJECT_DETAIL[`${subject}.${detail}`] ??
    RFC_SUBJECT_DETAIL[`${subject}.0`];
  if (row) {
    return {
      title: row.title,
      explanation: row.explanation,
      suggestedAction: row.action,
      code,
      severity,
    };
  }
  const fallback = CLASS_COPY[cls];
  return {
    title: fallback.title,
    explanation: fallback.explanation,
    suggestedAction: fallback.action,
    code,
    severity,
  };
}

function matchBasicCode(source: string | undefined): CodeTranslation | null {
  if (!source) {
    return null;
  }
  const match = source.match(BASIC_CODE_RE);
  if (!match) {
    return null;
  }
  const copy = CLASS_COPY[match[1]];
  return {
    title: copy.title,
    explanation: copy.explanation,
    suggestedAction: copy.action,
    code: match[0],
    severity: copy.severity,
  };
}

export function translateDiagnosticCode(input: {
  status?: string;
  diagnosticCode?: string;
}): CodeTranslation | null {
  try {
    const rawStatus =
      typeof input.status === "string" && input.status.trim() !== ""
        ? input.status
        : undefined;
    const rawCode =
      typeof input.diagnosticCode === "string" &&
      input.diagnosticCode.trim() !== ""
        ? input.diagnosticCode
        : undefined;
    const normalized = rawCode ? normalizeDiagnostic(rawCode) : undefined;

    // 2. Provider substring match — highest priority; carries provider-specific
    //    remediation. Scans both the clean status and the normalized diagnostic.
    const searchText = [rawStatus, normalized].filter(Boolean).join(" ");
    const provider = matchProvider(searchText);
    if (provider) {
      return provider;
    }

    // 3. Enhanced status code — prefer the clean `status` field (matched bare),
    //    then the normalized raw diagnostic code (matched only when adjacent to a
    //    reply code, to avoid IP-octet / version-banner false positives).
    const enhanced =
      matchEnhancedCode(rawStatus, ENHANCED_STATUS_RE) ??
      matchEnhancedCode(normalized, ENHANCED_FREETEXT_RE);
    if (enhanced) {
      return enhanced;
    }

    // 4. Basic 3-digit SMTP code — class-only rendering.
    const basic = matchBasicCode(rawStatus) ?? matchBasicCode(normalized);
    if (basic) {
      return basic;
    }

    // 5. No recognizable code.
    return null;
  } catch {
    return null;
  }
}

// Bounce subtype copy (findings.md §1.1). Keyed `${bounceType}/${bounceSubType}`.
// SES always sends bounceType + bounceSubType on a bounce, so this map is the
// guaranteed headline fallback — no code parsing needed.
const BOUNCE_SUBTYPE_MAP: Record<
  string,
  { headline: string; severity: DiagnosticSeverity; action?: string }
> = {
  "Undetermined/Undetermined": {
    headline: "Bounce — reason undetermined",
    severity: "unknown",
    action:
      "Check the raw diagnostic code; treat cautiously — may be transient or permanent.",
  },
  "Permanent/General": {
    headline: "Hard bounce — general failure",
    severity: "permanent",
    action:
      "Remove the address from your list. Repeated hard bounces hurt reputation and can pause sending.",
  },
  "Permanent/NoEmail": {
    headline: "Hard bounce — address does not exist",
    severity: "permanent",
    action: "Remove the address — it's invalid.",
  },
  "Permanent/Suppressed": {
    headline: "Hard bounce — on SES global suppression list",
    severity: "permanent",
    action:
      "The address is on the SES global suppression list from prior hard bounces. Remove it from your list.",
  },
  "Permanent/OnAccountSuppressionList": {
    headline: "Suppressed — on your account suppression list",
    severity: "permanent",
    action:
      "Expected suppression. Remove from the account suppression list if you intend to send again.",
  },
  "Permanent/OnTenantSuppressionList": {
    headline: "Suppressed — on tenant suppression list",
    severity: "permanent",
    action:
      "Expected suppression at the tenant level. Manage via tenant suppression settings.",
  },
  "Permanent/EmailValidationSuppressed": {
    headline: "Suppressed — failed email validation",
    severity: "permanent",
    action:
      "Review your SES email-validation settings; the address failed validation.",
  },
  "Permanent/UnsubscribedRecipient": {
    headline: "Not sent — recipient unsubscribed",
    severity: "info",
    action:
      "Honor the unsubscribe — no action needed. Delivery was not attempted.",
  },
  "Transient/General": {
    headline: "Soft bounce — general (may retry)",
    severity: "transient",
    action: "Safe to retry later; no action needed for auto-responses.",
  },
  "Transient/MailboxFull": {
    headline: "Soft bounce — mailbox full",
    severity: "transient",
    action: "Retry later; the mailbox may free up.",
  },
  "Transient/MessageTooLarge": {
    headline: "Soft bounce — message too large",
    severity: "transient",
    action: "Reduce message size and resend.",
  },
  "Transient/CustomTimeoutExceeded": {
    headline: "Soft bounce — delivery timeout exceeded",
    severity: "transient",
    action:
      "The bounce specifies the underlying failure; retry or investigate the delay.",
  },
  "Transient/ContentRejected": {
    headline: "Soft bounce — content rejected",
    severity: "transient",
    action: "Change the content (spammy phrasing, links, etc.) and resend.",
  },
  "Transient/AttachmentRejected": {
    headline: "Soft bounce — attachment rejected",
    severity: "transient",
    action: "Remove or change the attachment and resend.",
  },
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function bounceTypeHeadline(bounceType: string | undefined): string {
  if (bounceType === "Permanent") {
    return "Hard bounce";
  }
  if (bounceType === "Transient") {
    return "Soft bounce";
  }
  return "Bounce";
}

function bounceTypeSeverity(
  bounceType: string | undefined
): DiagnosticSeverity {
  if (bounceType === "Permanent") {
    return "permanent";
  }
  if (bounceType === "Transient") {
    return "transient";
  }
  return "unknown";
}

// Build RecipientDiagnostic entries from a recipients array, carrying the raw
// diagnostic code verbatim and skipping malformed entries.
function mapRecipients(recipients: unknown[]): RecipientDiagnostic[] {
  const result: RecipientDiagnostic[] = [];
  for (const entry of recipients) {
    const record = asRecord(entry);
    const emailAddress = asString(record?.emailAddress);
    if (!(record && emailAddress)) {
      continue;
    }
    const status = asString(record.status);
    const diagnosticCode = asString(record.diagnosticCode);
    result.push({
      emailAddress,
      translation: translateDiagnosticCode({ status, diagnosticCode }),
      ...(diagnosticCode ? { rawDiagnosticCode: diagnosticCode } : {}),
    });
  }
  return result;
}

export type BounceSubtypeDescription = {
  title: string;
  severity: DiagnosticSeverity;
  suggestedAction?: string;
};

// Headline, severity and action for a SES bounce from its coarse category.
// Falls back to the bounce-type headline and severity for an unmapped pair.
export function describeBounceSubtype(input: {
  bounceType?: string | null;
  bounceSubType?: string | null;
}): BounceSubtypeDescription {
  const bounceType = asString(input.bounceType);
  const bounceSubType = asString(input.bounceSubType);
  const key = `${bounceType}/${bounceSubType}`;
  const mapped = Object.hasOwn(BOUNCE_SUBTYPE_MAP, key)
    ? BOUNCE_SUBTYPE_MAP[key]
    : undefined;
  return {
    title: mapped?.headline ?? bounceTypeHeadline(bounceType),
    severity: mapped?.severity ?? bounceTypeSeverity(bounceType),
    suggestedAction: mapped?.action,
  };
}

function describeBounce(metadata: Record<string, unknown>): EventDiagnostics {
  const bounceType = asString(metadata.bounceType);
  const bounceSubType = asString(metadata.bounceSubType);
  const described = describeBounceSubtype({ bounceType, bounceSubType });
  const severity = described.severity;
  const headline = described.title;

  const fields: EventDiagnostics["fields"] = [];
  if (bounceType) {
    fields.push({ label: "Bounce type", value: bounceType });
  }
  if (bounceSubType) {
    fields.push({ label: "Subtype", value: bounceSubType });
  }

  return {
    headline,
    severity,
    fields,
    recipients: mapRecipients(asArray(metadata.bouncedRecipients)),
  };
}

function describeSuppressed(
  metadata: Record<string, unknown>
): EventDiagnostics {
  const reason = asString(metadata.reason);
  const fields: EventDiagnostics["fields"] = [];
  if (reason) {
    fields.push({ label: "Reason", value: reason });
  }
  return {
    headline: "Recipient suppressed — send skipped",
    severity: "permanent",
    fields,
    recipients: mapRecipients(asArray(metadata.suppressedRecipients)),
  };
}

// Complaint feedback types (findings.md §1.2, IANA MARF).
const COMPLAINT_FEEDBACK_TYPE_MAP: Record<
  string,
  {
    headline: string;
    explanation: string;
    severity: DiagnosticSeverity;
    action: string;
  }
> = {
  abuse: {
    headline: "Spam complaint — marked as spam",
    explanation:
      "The recipient reported this message as unsolicited email or abuse.",
    severity: "permanent",
    action: "Remove immediately and investigate list hygiene and consent.",
  },
  "auth-failure": {
    headline: "Authentication failure report",
    explanation:
      "An email-authentication failure was reported — not a spam complaint.",
    severity: "info",
    action: "Check SPF/DKIM/DMARC alignment for the sending domain.",
  },
  fraud: {
    headline: "Fraud / phishing complaint",
    explanation: "Some kind of fraud or phishing activity was reported.",
    severity: "permanent",
    action:
      "Serious — audit content and sending identity for spoofing or compromise.",
  },
  "not-spam": {
    headline: "Marked not spam",
    explanation:
      "The reporter does not consider the message spam (correcting a prior mis-tag).",
    severity: "success",
    action: "Positive signal — no removal needed.",
  },
  other: {
    headline: "Complaint — other",
    explanation: "Feedback that doesn't fit a registered type.",
    severity: "info",
    action: "Inspect the user agent or raw report for context.",
  },
  virus: {
    headline: "Virus reported",
    explanation: "A virus was found in the originating message.",
    severity: "permanent",
    action: "Audit the content pipeline for malware; do not resend.",
  },
};

const GENERIC_COMPLAINT = {
  headline: "Spam complaint",
  explanation: "The recipient marked this message as unwanted.",
  severity: "permanent" as DiagnosticSeverity,
  action: "Remove the address and review consent and list hygiene.",
};

export type ComplaintFeedbackDescription = {
  title: string;
  explanation: string;
  severity: DiagnosticSeverity;
  suggestedAction: string;
};

// Copy for a complaint feedback type. Null, unknown and prototype-named values
// (for example "constructor") get the generic copy.
export function describeComplaintFeedbackType(
  feedbackType: string | null | undefined
): ComplaintFeedbackDescription {
  const key = asString(feedbackType);
  const mapped =
    key !== undefined && Object.hasOwn(COMPLAINT_FEEDBACK_TYPE_MAP, key)
      ? COMPLAINT_FEEDBACK_TYPE_MAP[key]
      : GENERIC_COMPLAINT;
  return {
    title: mapped.headline,
    explanation: mapped.explanation,
    severity: mapped.severity,
    suggestedAction: mapped.action,
  };
}

function describeComplaint(
  metadata: Record<string, unknown>
): EventDiagnostics {
  const feedbackType = asString(metadata.complaintFeedbackType);
  const described = describeComplaintFeedbackType(feedbackType);
  const fields: EventDiagnostics["fields"] = [];
  if (feedbackType) {
    fields.push({ label: "Feedback type", value: feedbackType });
  }
  const userAgent = asString(metadata.userAgent);
  if (userAgent) {
    fields.push({ label: "Reported by", value: userAgent });
  }
  return {
    headline: described.title,
    severity: described.severity,
    fields,
    recipients: mapRecipients(asArray(metadata.complainedRecipients)),
  };
}

// DeliveryDelay types (findings.md §1.4). All delays are transient — SES keeps
// retrying until expirationTime.
const DELAY_TYPE_MAP: Record<string, { headline: string; action: string }> = {
  InternalFailure: {
    headline: "Delivery delayed — internal SES issue",
    action: "SES-side; usually self-resolves. Monitor; no sender action.",
  },
  General: {
    headline: "Delivery delayed — general SMTP failure",
    action: "Transient — SES will retry until the message expires.",
  },
  MailboxFull: {
    headline: "Delivery delayed — mailbox full",
    action: "Retry pending — may clear when the recipient frees space.",
  },
  SpamDetected: {
    headline: "Delivery delayed — flagged as spam",
    action:
      "Reputation risk — review content and list hygiene; the receiver is throttling you.",
  },
  RecipientServerError: {
    headline: "Delivery delayed — recipient server error",
    action: "Recipient-side transient issue; SES retries. No sender action.",
  },
  IPFailure: {
    headline: "Delivery delayed — sending IP blocked or throttled",
    action:
      "Check IP reputation and blocklists; warm the IP or request delisting.",
  },
  TransientCommunicationFailure: {
    headline: "Delivery delayed — temporary communication failure",
    action:
      "Transient network issue during the SMTP conversation; SES retries.",
  },
  BYOIPHostNameLookupUnavailable: {
    headline: "Delivery delayed — BYOIP hostname lookup failed",
    action: "BYOIP only — verify PTR / reverse DNS for your dedicated IPs.",
  },
  Undetermined: {
    headline: "Delivery delayed — reason undetermined",
    action: "Inspect the recipient diagnostic codes below.",
  },
  SendingDeferral: {
    headline: "Delivery delayed — internally deferred",
    action:
      "SES intentionally deferred the message; it will retry. No sender action.",
  },
};

function describeDelivery(metadata: Record<string, unknown>): EventDiagnostics {
  const smtpResponse = asString(metadata.smtpResponse);
  const remoteMtaIp = asString(metadata.remoteMtaIp);
  const processingTime =
    typeof metadata.processingTimeMillis === "number"
      ? `${metadata.processingTimeMillis} ms`
      : undefined;

  const fields: EventDiagnostics["fields"] = [];
  if (smtpResponse) {
    fields.push({ label: "SMTP response", value: smtpResponse });
  }
  if (remoteMtaIp) {
    fields.push({ label: "Remote MTA", value: remoteMtaIp });
  }
  if (processingTime) {
    fields.push({ label: "Processing time", value: processingTime });
  }

  return {
    headline: "Delivered to the recipient's mail server",
    severity: "success",
    fields,
  };
}

function describeDeliveryDelay(
  metadata: Record<string, unknown>
): EventDiagnostics {
  const delayType = asString(metadata.delayType);
  const mapped = delayType ? DELAY_TYPE_MAP[delayType] : undefined;
  const expirationTime = asString(metadata.expirationTime);

  const fields: EventDiagnostics["fields"] = [];
  if (delayType) {
    fields.push({ label: "Delay type", value: delayType });
  }
  if (expirationTime) {
    fields.push({ label: "Expires", value: expirationTime, kind: "datetime" });
  }

  return {
    headline: mapped?.headline ?? "Delivery delayed",
    severity: "transient",
    fields,
    recipients: mapRecipients(asArray(metadata.delayedRecipients)),
  };
}

function describeReject(metadata: Record<string, unknown>): EventDiagnostics {
  const reason = asString(metadata.reason);
  const fields: EventDiagnostics["fields"] = [];
  if (reason) {
    fields.push({ label: "Reason", value: reason });
  }
  return {
    headline: "Rejected before sending",
    severity: "permanent",
    fields,
  };
}

function describeRenderingFailure(
  metadata: Record<string, unknown>
): EventDiagnostics {
  const errorMessage = asString(metadata.errorMessage);
  const templateName = asString(metadata.templateName);
  const fields: EventDiagnostics["fields"] = [];
  if (templateName) {
    fields.push({ label: "Template", value: templateName });
  }
  if (errorMessage) {
    fields.push({ label: "Error", value: errorMessage });
  }
  return {
    headline: "Template rendering failed",
    severity: "permanent",
    fields,
  };
}

export function describeEventDiagnostics(
  eventType: string,
  metadata: Record<string, unknown> | undefined
): EventDiagnostics | null {
  try {
    if (!metadata) {
      return null;
    }
    switch (eventType) {
      case "bounce":
        return describeBounce(metadata);
      case "suppressed":
        return describeSuppressed(metadata);
      case "complaint":
        return describeComplaint(metadata);
      case "delivery":
        return describeDelivery(metadata);
      case "deliverydelay":
      case "delivery_delay":
        return describeDeliveryDelay(metadata);
      case "reject":
      case "rejected":
        return describeReject(metadata);
      case "rendering_failure":
      case "renderingfailure":
        return describeRenderingFailure(metadata);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
