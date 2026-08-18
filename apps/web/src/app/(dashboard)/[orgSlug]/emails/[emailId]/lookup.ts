import type { EmailStatus } from "../types";

/**
 * Why a message lookup could not produce a detail view.
 *
 * "not-found" is a genuine miss (nothing in Postgres, nothing in DynamoDB) and
 * is the only reason that maps to `notFound()`. Everything else is a state the
 * page renders and explains, because a redirect back to the list reads as a
 * broken control.
 */
export type EmailLookupFailure =
  | { reason: "no-aws-account" }
  | { reason: "not-found" }
  | {
      reason: "not-sent";
      subject: string;
      recipient: string;
      status: EmailStatus;
    }
  | { reason: "lookup-failed"; kind: EmailLookupErrorKind };

/**
 * AWS failures are kept distinct so the UI can name what actually broke
 * instead of collapsing an expired role, a revoked policy, and a missing
 * history table into one generic message.
 */
export type EmailLookupErrorKind =
  | "credentials"
  | "permission"
  | "history-unavailable"
  | "unknown";

const CREDENTIAL_MARKERS = [
  "ExpiredToken",
  "InvalidClientTokenId",
  "UnrecognizedClientException",
  "CredentialsProviderError",
  "Could not load credentials",
  "security token",
];

const PERMISSION_MARKERS = [
  "AccessDenied",
  "UnauthorizedOperation",
  "NotAuthorized",
  "not authorized to perform",
];

/**
 * A missing DynamoDB table means the event pipeline was never deployed into
 * this account - a different situation from a read that failed, and the fix is
 * a different command. AWS SDK v3 error names are unreliable (an exception can
 * arrive as `name: "Error"` with the real type only in the message), so the
 * markers are matched against name and message together.
 */
const TABLE_MISSING_MARKERS = [
  "ResourceNotFoundException",
  "Requested resource not found",
];

const HISTORY_MARKERS = [...TABLE_MISSING_MARKERS, "AWS account not found"];

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`;
  }
  return String(error);
}

function hasMarker(text: string, markers: string[]): boolean {
  const haystack = text.toLowerCase();
  return markers.some((marker) => haystack.includes(marker.toLowerCase()));
}

export function classifyLookupError(error: unknown): EmailLookupErrorKind {
  const text = errorText(error);

  if (hasMarker(text, CREDENTIAL_MARKERS)) {
    return "credentials";
  }
  if (hasMarker(text, PERMISSION_MARKERS)) {
    return "permission";
  }
  if (hasMarker(text, HISTORY_MARKERS)) {
    return "history-unavailable";
  }
  return "unknown";
}

/**
 * Why the per-message event timeline is missing (audit finding F11).
 *
 * The detail page used to render a thrown DynamoDB read and a genuinely empty
 * history identically - "No events recorded yet" - so a permissions or region
 * problem read to the user as "this message has no delivery events".
 */
export type EmailTimelineStatus =
  | "ok"
  | "empty"
  | "unavailable"
  | "not_deployed";

export type EmailTimelineState = {
  status: EmailTimelineStatus;
  /** Unmasked AWS account id whose history was read; `null` when unknown. */
  accountId: string | null;
};

/** Only two outcomes: the table is missing, or the read failed for some reason. */
export function classifyTimelineFailure(
  error: unknown
): Extract<EmailTimelineStatus, "not_deployed" | "unavailable"> {
  if (hasMarker(errorText(error), TABLE_MISSING_MARKERS)) {
    return "not_deployed";
  }
  return "unavailable";
}
