/**
 * Plain-language explanation of why one send to an address had a problem.
 *
 * Pure: no React, no database. The address detail reads the send's stored
 * timestamps and bounce fields, and this maps them to a headline and detail.
 * Diagnostic codes from later work plug in here; the UI renders headline and
 * detail only.
 */

import {
  type DiagnosticSeverity,
  describeEventDiagnostics,
} from "@wraps/core/email-diagnostics";

export type SendProblemInput = {
  bouncedAt: Date | null;
  complainedAt: Date | null;
  suppressedAt: Date | null;
  bounceType: string | null;
  bounceSubType: string | null;
};

export type SendProblemExplanation = {
  kind: "complaint" | "bounce" | "suppressed";
  headline: string;
  detail: string | null;
  severity: DiagnosticSeverity | "info";
};

const COMPLAINT_DETAIL =
  "The recipient reported this email as spam. The complaint type is not recorded.";

function bounceDetail(input: SendProblemInput): string | null {
  const parts = [input.bounceType, input.bounceSubType].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(" / ") : null;
}

function explainBounce(input: SendProblemInput): SendProblemExplanation {
  // Without a bounce type the translation layer can only say "Bounce". The
  // plain "Bounced" copy is more accurate, so it is used directly.
  if (!input.bounceType) {
    return {
      kind: "bounce",
      headline: "Bounced",
      detail: bounceDetail(input),
      severity: "unknown",
    };
  }
  const described = describeEventDiagnostics("bounce", {
    bounceType: input.bounceType,
    bounceSubType: input.bounceSubType,
  });
  return {
    kind: "bounce",
    headline: described?.headline ?? "Bounced",
    detail: bounceDetail(input),
    severity: described?.severity ?? "unknown",
  };
}

/**
 * Priority: complaint, then bounce, then suppressed. A row with none of the
 * three is not a problem and is never passed in: the problem query selects only
 * rows with at least one set. It falls through to the bounce copy.
 */
export function explainSendProblem(
  input: SendProblemInput
): SendProblemExplanation {
  if (input.complainedAt) {
    return {
      kind: "complaint",
      headline: "Reported as spam",
      detail: COMPLAINT_DETAIL,
      severity: "permanent",
    };
  }
  if (input.bouncedAt) {
    return explainBounce(input);
  }
  if (input.suppressedAt) {
    return {
      kind: "suppressed",
      headline: "Not sent: the address was on the suppression list",
      detail: null,
      severity: "info",
    };
  }
  return explainBounce(input);
}

export type NormalizedAddress =
  | { ok: true; address: string }
  | { ok: false; error: string };

/**
 * Trims the address and rejects anything that cannot be an address. Addresses
 * come from our own rows, so this guards malformed input and tampering only.
 */
export function normalizeAddressInput(raw: string): NormalizedAddress {
  const address = raw.trim();
  if (!address.includes("@")) {
    return { ok: false, error: "Enter an email address." };
  }
  return { ok: true, address };
}
