/**
 * SES account-level suppression list for the API.
 *
 * Copied from apps/web/src/lib/aws/ses-suppression.ts. The web module cannot
 * be imported from apps/api (it is Next-only and reads the web logger and
 * the Vercel OIDC credential cache), so this is a second copy. Differences
 * from the web copy, and why:
 *
 * - Credentials come from `getCredentials` in ./credentials.ts. That helper
 *   looks the account up by (id, organizationId) and caches per account+org,
 *   so it replaces the web `getOrAssumeRole`.
 * - The logger is `log` from ../lib/logger.
 * - `listSuppressedAddresses` takes the account rows instead of an
 *   organizationId. The route decides the scope: every account in the org,
 *   or one account it has already verified belongs to the org.
 * - The cursor is decoded strictly. `decodeSuppressionCursor` returns null for
 *   anything that is not a base64url JSON object of strings, so the route can
 *   answer 400. The web copy silently starts over instead.
 * - `putSuppressedAddress` (add) is copied from the web copy's put, with the
 *   same credentials change.
 *
 * The access-denied / not-found classifiers, `toSuppressedAddress`, and the
 * cursor encoding are copied unchanged.
 */

import {
  DeleteSuppressedDestinationCommand,
  GetSuppressedDestinationCommand,
  ListSuppressedDestinationsCommand,
  PutSuppressedDestinationCommand,
  SESv2Client,
  type SuppressedDestinationSummary,
  type SuppressionListReason,
} from "@aws-sdk/client-sesv2";
import type { awsAccount } from "@wraps/db";
import { log } from "../lib/logger";
import { getCredentials } from "./credentials";

type AwsAccountRow = typeof awsAccount.$inferSelect;

export type SuppressedAddress = {
  email: string;
  reason: "BOUNCE" | "COMPLAINT";
  lastUpdated: string; // ISO
  awsAccountId: string;
  region: string;
};

export type SuppressionListPage = {
  entries: SuppressedAddress[];
  nextCursor?: string;
  hasMore: boolean;
  deniedAccountIds: string[];
  unreachableAccountIds: string[];
};

/**
 * True when an AWS SDK v3 error is an access-denied response. Copied from
 * apps/web/src/lib/aws/ses-suppression.ts (isAccessDeniedError).
 */
function isAccessDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AccessDeniedException" ||
    error.message.includes("AccessDeniedException")
  );
}

/** True when an AWS SDK v3 error is a "not found" response. */
function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "NotFoundException" ||
    error.message.includes("NotFoundException")
  );
}

function sesClientFor(
  account: AwsAccountRow,
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  }
): SESv2Client {
  return new SESv2Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

function toSuppressedAddress(
  entry: SuppressedDestinationSummary,
  account: AwsAccountRow
): SuppressedAddress {
  return {
    email: entry.EmailAddress ?? "",
    reason: entry.Reason ?? "BOUNCE",
    lastUpdated:
      entry.LastUpdateTime?.toISOString() ?? new Date(0).toISOString(),
    awsAccountId: account.id,
    region: account.region,
  };
}

// Sentinel stored in the cursor map for an account whose list is fully
// drained. It separates "already read everything from this account" from
// "never queried yet" (absent key), so a later page does not re-read it.
const EXHAUSTED = "__exhausted__";

export type SuppressionCursor = Record<string, string>; // awsAccountId -> SES NextToken | EXHAUSTED

/**
 * The opaque cursor this module hands to callers encodes one SES NextToken
 * per AWS account, since a single request spans every account in the org.
 */
function encodeSuppressionCursor(
  cursor: SuppressionCursor
): string | undefined {
  if (Object.keys(cursor).length === 0) {
    return;
  }
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Decode a client-supplied cursor. Returns null when the token is not a
 * base64url JSON object whose values are all strings. The caller turns null
 * into a 400: silently starting over would re-list entries already returned.
 */
export function decodeSuppressionCursor(
  token: string
): SuppressionCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  for (const value of Object.values(parsed)) {
    if (typeof value !== "string") {
      return null;
    }
  }
  return parsed as SuppressionCursor;
}

/**
 * Reads one page of the account-level SES suppression list across the given
 * AWS accounts. Each call fetches up to `limit` entries from every account
 * that is not yet exhausted and concatenates the results.
 *
 * Pagination trap (same as the web copy): `ListSuppressedDestinations`
 * returns a NextToken on the last non-empty page too. Requesting `limit + 1`
 * and slicing would drop an entry, so this requests exactly `limit` and
 * stops when the token does not advance. The cost is that `hasMore` can read
 * true once when nothing remains, and the next page is empty.
 */
export async function listSuppressedAddresses(params: {
  accounts: AwsAccountRow[];
  limit: number;
  cursor: SuppressionCursor;
  reason?: SuppressionListReason;
}): Promise<SuppressionListPage> {
  const { accounts, limit, cursor, reason } = params;

  const nextCursor: SuppressionCursor = {};
  const entries: SuppressedAddress[] = [];
  const deniedAccountIds: string[] = [];
  const unreachableAccountIds: string[] = [];

  for (const account of accounts) {
    const accountCursor = cursor[account.id];
    if (accountCursor === EXHAUSTED) {
      // Carry the sentinel forward rather than dropping the key, so a later
      // page does not re-read the account from the start.
      nextCursor[account.id] = EXHAUSTED;
      continue;
    }

    try {
      const credentials = await getCredentials(
        account.id,
        account.organizationId
      );
      const client = sesClientFor(account, credentials);

      const response = await client.send(
        new ListSuppressedDestinationsCommand({
          PageSize: limit,
          NextToken: accountCursor,
          Reasons: reason ? [reason] : undefined,
        })
      );

      const summaries = response.SuppressedDestinationSummaries ?? [];
      entries.push(
        ...summaries.map((entry) => toSuppressedAddress(entry, account))
      );

      const returnedToken = response.NextToken;
      if (returnedToken && returnedToken !== accountCursor) {
        nextCursor[account.id] = returnedToken;
      } else {
        nextCursor[account.id] = EXHAUSTED;
      }
    } catch (error) {
      if (isAccessDeniedError(error)) {
        deniedAccountIds.push(account.id);
        nextCursor[account.id] = EXHAUSTED;
        continue;
      }
      log.warn("Failed to list SES suppressed destinations for account", {
        awsAccountId: account.id,
        err: error,
      });
      unreachableAccountIds.push(account.id);
      nextCursor[account.id] = EXHAUSTED;
    }
  }

  const hasMore = Object.values(nextCursor).some((v) => v !== EXHAUSTED);

  return {
    entries,
    nextCursor: hasMore ? encodeSuppressionCursor(nextCursor) : undefined,
    hasMore,
    deniedAccountIds,
    unreachableAccountIds,
  };
}

export type GetSuppressedAddressResult =
  | { status: "found"; address: SuppressedAddress }
  | { status: "not_found" }
  | { status: "denied" };

/**
 * Look up one suppressed address on one AWS account. Returns a typed outcome
 * for not-found and denied, so the caller can apply the COMPLAINT guard
 * without parsing error strings.
 */
export async function getSuppressedAddress(params: {
  account: AwsAccountRow;
  email: string;
}): Promise<GetSuppressedAddressResult> {
  const { account, email } = params;

  const credentials = await getCredentials(account.id, account.organizationId);
  const client = sesClientFor(account, credentials);

  try {
    const response = await client.send(
      new GetSuppressedDestinationCommand({ EmailAddress: email })
    );
    const destination = response.SuppressedDestination;
    if (!destination) {
      return { status: "not_found" };
    }
    return {
      status: "found",
      address: {
        email: destination.EmailAddress ?? email,
        reason: destination.Reason ?? "BOUNCE",
        lastUpdated:
          destination.LastUpdateTime?.toISOString() ??
          new Date(0).toISOString(),
        awsAccountId: account.id,
        region: account.region,
      },
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { status: "not_found" };
    }
    if (isAccessDeniedError(error)) {
      return { status: "denied" };
    }
    log.warn("Failed to get SES suppressed destination", {
      awsAccountId: account.id,
      err: error,
    });
    throw error;
  }
}

export type PutSuppressedAddressResult =
  | { status: "added" }
  | { status: "denied" };

/**
 * Add an address to the account-level suppression list. Callers decide
 * beforehand whether a write is needed (see the add route); this only
 * performs the write and reports whether the role was allowed to make it.
 * Copied from apps/web/src/lib/aws/ses-suppression.ts (putSuppressedAddress),
 * with credentials from getCredentials.
 */
export async function putSuppressedAddress(params: {
  account: AwsAccountRow;
  email: string;
  reason: "BOUNCE" | "COMPLAINT";
}): Promise<PutSuppressedAddressResult> {
  const { account, email, reason } = params;

  const credentials = await getCredentials(account.id, account.organizationId);
  const client = sesClientFor(account, credentials);

  try {
    await client.send(
      new PutSuppressedDestinationCommand({
        EmailAddress: email,
        Reason: reason,
      })
    );
    return { status: "added" };
  } catch (error) {
    if (isAccessDeniedError(error)) {
      return { status: "denied" };
    }
    log.warn("Failed to put SES suppressed destination", {
      awsAccountId: account.id,
      err: error,
    });
    throw error;
  }
}

export type DeleteSuppressedAddressResult =
  | { status: "removed" }
  | { status: "not_found" }
  | { status: "denied" };

/**
 * Delete one suppressed address on one AWS account. Reports "removed" and
 * "not_found" separately, so the caller can tell the user which happened.
 */
export async function deleteSuppressedAddress(params: {
  account: AwsAccountRow;
  email: string;
}): Promise<DeleteSuppressedAddressResult> {
  const { account, email } = params;

  const credentials = await getCredentials(account.id, account.organizationId);
  const client = sesClientFor(account, credentials);

  try {
    await client.send(
      new DeleteSuppressedDestinationCommand({ EmailAddress: email })
    );
    return { status: "removed" };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { status: "not_found" };
    }
    if (isAccessDeniedError(error)) {
      return { status: "denied" };
    }
    log.warn("Failed to delete SES suppressed destination", {
      awsAccountId: account.id,
      err: error,
    });
    throw error;
  }
}
