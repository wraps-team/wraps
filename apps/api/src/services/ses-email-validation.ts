import {
  GetEmailAddressInsightsCommand,
  type SESv2Client,
} from "@aws-sdk/client-sesv2";

/** SES's confidence verdict for a mailbox, or UNKNOWN when a per-address call failed. */
export type EmailValidationVerdict = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type ValidateEmailAddressesResult = {
  verdicts: Record<string, EmailValidationVerdict>;
  /** How many addresses actually got a call before the run stopped (or finished). */
  validatedCount: number;
  /** True when a throttling response cut the run short before every address was checked. */
  stoppedEarly: boolean;
};

/** No caller may run more than this many GetEmailAddressInsights calls at once. */
const MAX_VALIDATION_CONCURRENCY = 5;

/**
 * AWS SDK v3 errors sometimes arrive with `name: "Error"` and the real code
 * only in `.message` — check both, same as every other AWS error classifier
 * in this codebase (apps/web/src/lib/aws/assume-role.ts,
 * packages/cli/src/utils/shared/aws.ts).
 */
function mentions(error: unknown, needle: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === needle || error.message.includes(needle);
}

function isThrottlingError(error: unknown): boolean {
  return (
    mentions(error, "Throttling") ||
    mentions(error, "ThrottlingException") ||
    mentions(error, "TooManyRequestsException")
  );
}

function isAccessDeniedError(error: unknown): boolean {
  return (
    mentions(error, "AccessDenied") ||
    mentions(error, "AccessDeniedException") ||
    mentions(error, "UnauthorizedAccess")
  );
}

/**
 * Thrown when SES denies `ses:GetEmailAddressInsights` — surfaced as a
 * distinct type so a caller can give an actionable message instead of
 * silently marking every remaining address UNKNOWN.
 */
export class SesValidationAccessDeniedError extends Error {}

/**
 * Validate a batch of email addresses against SES's Email Address Insights
 * API (plan 373 Phase C).
 *
 * - At most `MAX_VALIDATION_CONCURRENCY` calls in flight — AWS publishes no
 *   rate for this API.
 * - Stops the whole run cleanly on the first throttling error, reporting how
 *   many addresses were validated before that happened.
 * - Throws `SesValidationAccessDeniedError` on a permission failure, rather
 *   than marking every remaining address UNKNOWN.
 * - Deduplicates the input so a repeated address is billed once.
 * - This function has no knowledge of contacts or imports — it only calls
 *   SES and reports verdicts; the caller decides what to do with them.
 */
export async function validateEmailAddressesWithSes(
  sesClient: SESv2Client,
  emails: string[]
): Promise<ValidateEmailAddressesResult> {
  const uniqueEmails = [...new Set(emails)];
  const verdicts: Record<string, EmailValidationVerdict> = {};
  let validatedCount = 0;
  let stoppedEarly = false;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < uniqueEmails.length) {
      if (stoppedEarly) {
        return;
      }
      const email = uniqueEmails[nextIndex];
      nextIndex++;

      try {
        const response = await sesClient.send(
          new GetEmailAddressInsightsCommand({ EmailAddress: email })
        );
        verdicts[email] =
          response.MailboxValidation?.IsValid?.ConfidenceVerdict ?? "UNKNOWN";
        validatedCount++;
      } catch (error) {
        if (isAccessDeniedError(error)) {
          stoppedEarly = true;
          throw new SesValidationAccessDeniedError(
            "SES denied ses:GetEmailAddressInsights"
          );
        }
        if (isThrottlingError(error)) {
          stoppedEarly = true;
          return;
        }
        // An unrecognized failure for this one address — mark it UNKNOWN
        // rather than aborting the whole run over one bad response.
        verdicts[email] = "UNKNOWN";
        validatedCount++;
      }
    }
  }

  const workerCount = Math.min(MAX_VALIDATION_CONCURRENCY, uniqueEmails.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { verdicts, validatedCount, stoppedEarly };
}
