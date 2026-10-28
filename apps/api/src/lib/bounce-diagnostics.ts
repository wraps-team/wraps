/**
 * Pure helpers that turn an SES bounce or complaint payload into the diagnostic
 * values the webhook stores in message_send_diagnostic. No DB, no logging.
 *
 * The raw SMTP text is kept only after addresses are redacted and its length is
 * capped. The reason key is built with the same catalog the web app reads, so
 * there is one translation of each SES code (see @wraps/core/email-diagnostics).
 */

import { translateDiagnosticCode } from "@wraps/core/email-diagnostics";

export type BounceDiagnostic = {
  enhancedStatus: string | null;
  diagnosticCode: string | null;
  reasonKey: string | null;
};

// Only the first entries of an SES bouncedRecipients array are read.
const RECIPIENT_SCAN_CAP = 50;
// Raw input is cut here before redaction, which bounds the regex work.
const DIAGNOSTIC_INPUT_CAP = 2048;
const DIAGNOSTIC_CODE_CAP = 512;
const ENHANCED_STATUS_MAX = 16;
const REASON_KEY_CAP = 200;

const ENHANCED_STATUS_RE = /^[245]\.\d{1,3}\.\d{1,3}$/;
const FEEDBACK_TYPE_RE = /^[a-z-]{1,32}$/i;
// The character classes exclude the delimiters that surround an address in an
// SMTP reply (angle brackets, quotes, parentheses, square brackets).
const ADDRESS_RE = /[^\s<>"'()[\]]+@[^\s<>"'()[\]]+/g;

type RecipientEntry = {
  emailAddress: string;
  status?: unknown;
  diagnosticCode?: unknown;
};

const EMPTY: BounceDiagnostic = {
  enhancedStatus: null,
  diagnosticCode: null,
  reasonKey: null,
};

function validEntries(bouncedRecipients: unknown): RecipientEntry[] {
  if (!Array.isArray(bouncedRecipients)) {
    return [];
  }
  const entries: RecipientEntry[] = [];
  for (const raw of bouncedRecipients.slice(0, RECIPIENT_SCAN_CAP)) {
    if (raw === null || typeof raw !== "object") {
      continue;
    }
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.emailAddress !== "string") {
      continue;
    }
    entries.push(candidate as RecipientEntry);
  }
  return entries;
}

// Which entry describes the row's recipient. The row's recipient is the
// authority. A single valid entry is unambiguous. With no recipient on the row,
// the first entry is used (the mocked and defensive path).
function chooseEntry(
  entries: RecipientEntry[],
  rowRecipient: string | null | undefined
): RecipientEntry | null {
  if (rowRecipient === undefined || rowRecipient === null) {
    return entries[0] ?? null;
  }
  if (typeof rowRecipient === "string") {
    const target = rowRecipient.trim().toLowerCase();
    const match = entries.find(
      (entry) => entry.emailAddress.trim().toLowerCase() === target
    );
    if (match) {
      return match;
    }
  }
  return entries.length === 1 ? entries[0] : null;
}

function normalizeEnhancedStatus(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (
    trimmed.length > ENHANCED_STATUS_MAX ||
    !ENHANCED_STATUS_RE.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function normalizeDiagnosticCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const redacted = redactAddresses(value.slice(0, DIAGNOSTIC_INPUT_CAP));
  const collapsed = redacted
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DIAGNOSTIC_CODE_CAP);
  return collapsed === "" ? null : collapsed;
}

function reasonKeyFor(
  enhancedStatus: string | null,
  diagnosticCode: string | null
): string | null {
  const translation = translateDiagnosticCode({
    status: enhancedStatus ?? undefined,
    diagnosticCode: diagnosticCode ?? undefined,
  });
  if (!translation) {
    return null;
  }
  return `${translation.provider ?? ""}|${translation.code ?? ""}|${translation.title}`.slice(
    0,
    REASON_KEY_CAP
  );
}

/**
 * Replace every address-shaped token with "[address]". Receivers sometimes echo
 * the recipient in their text. Hosts and IPs are kept because they identify the
 * receiver's infrastructure, not the person.
 */
export function redactAddresses(text: string): string {
  return text.replace(ADDRESS_RE, "[address]");
}

/**
 * Read the diagnostic SES sent for one recipient of a bounce. Never returns
 * null: every field is null when no entry is chosen or a field is absent.
 */
export function extractBounceDiagnostic(
  bouncedRecipients: unknown,
  rowRecipient: string | null | undefined
): BounceDiagnostic {
  const entry = chooseEntry(validEntries(bouncedRecipients), rowRecipient);
  if (!entry) {
    return { ...EMPTY };
  }
  const enhancedStatus = normalizeEnhancedStatus(entry.status);
  const diagnosticCode = normalizeDiagnosticCode(entry.diagnosticCode);
  return {
    enhancedStatus,
    diagnosticCode,
    reasonKey: reasonKeyFor(enhancedStatus, diagnosticCode),
  };
}

/**
 * Lower-case a complaint feedback type when it is a well-formed token. Unknown
 * but well-formed types are kept, and the reader shows the generic copy for
 * them. Anything malformed becomes null.
 */
export function normalizeFeedbackType(value: unknown): string | null {
  if (typeof value !== "string" || !FEEDBACK_TYPE_RE.test(value)) {
    return null;
  }
  return value.toLowerCase();
}
