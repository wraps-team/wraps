import {
  DeleteSuppressedDestinationCommand,
  GetSuppressedDestinationCommand,
  ListSuppressedDestinationsCommand,
  SESv2Client,
  type SuppressedDestinationSummary,
  type SuppressionListReason,
} from "@aws-sdk/client-sesv2";
import { awsAccount, db, eq } from "@wraps/db";
import { logger } from "@/lib/logger";
import { getOrAssumeRole } from "./credential-cache";

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
  nextToken?: string;
  hasMore: boolean;
  deniedAccountIds: string[];
  unreachableAccountIds: string[];
};

/**
 * True when an AWS SDK v3 error is an access-denied response. Copied from
 * `apps/web/src/actions/ses-onboarding.ts:66-74` (module-private there, and
 * that file carries "use server" — a non-async export from it would break
 * `next build`) rather than shared, per this repo's "three similar lines
 * beat a premature abstraction" rule.
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
// drained — distinguishes "already read everything from this account" from
// "never queried yet" (absent key), so a later page does not re-fetch and
// re-return entries a previous page already returned.
const EXHAUSTED = "__exhausted__";

type Cursor = Record<string, string>; // awsAccountId -> SES NextToken | EXHAUSTED

/**
 * The opaque `nextToken` this module hands to callers encodes one SES
 * NextToken per AWS account, because "page each account independently and
 * concatenate" (the multi-account model here, unlike the single-account
 * ListSendingDomainsResult) means a single request spans every account on
 * the org at once. Not exported — callers must treat it as opaque.
 */
function encodeCursor(cursor: Cursor): string | undefined {
  if (Object.keys(cursor).length === 0) {
    return;
  }
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(token: string | undefined): Cursor {
  if (!token) {
    return {};
  }
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    // A malformed/foreign token must not crash the page — start fresh.
    return {};
  }
}

/**
 * Reads one page of the account-level SES suppression list, across every
 * AWS account on the org. Each call fetches up to `limit` entries from EVERY
 * account that is not yet exhausted and concatenates the results — "page
 * each account independently and concatenate".
 *
 * Pagination trap: `ListSuppressedDestinations` returns a `NextToken` on the
 * LAST non-empty page too, not only when more results exist. A `limit + 1`
 * lookahead cannot fix this without dropping an entry: SES's NextToken
 * always points past everything in the response, so slicing the response
 * down to `limit` after requesting `limit + 1` throws away the item at
 * index `limit` — it is never returned on any page. So this requests
 * exactly `limit` items and instead guards on `returnedToken !==
 * accountCursor` (a token that did not advance) to stop. The cost is
 * cosmetic: the last non-empty page still carries a token, so `hasMore` can
 * read true once when nothing remains and "Load more" yields an empty page.
 * That is acceptable; silently dropping an address is not — the invariant
 * this function holds is that paging to exhaustion returns every entry
 * exactly once.
 */
export async function listSuppressedAddresses(params: {
  organizationId: string;
  limit?: number;
  startToken?: string;
  reason?: SuppressionListReason;
  startDate?: Date;
  endDate?: Date;
}): Promise<SuppressionListPage> {
  const {
    organizationId,
    limit = 50,
    startToken,
    reason,
    startDate,
    endDate,
  } = params;

  const accounts = await db.query.awsAccount.findMany({
    where: eq(awsAccount.organizationId, organizationId),
  });

  const cursor = decodeCursor(startToken);
  const nextCursor: Cursor = {};
  const entries: SuppressedAddress[] = [];
  const deniedAccountIds: string[] = [];
  const unreachableAccountIds: string[] = [];

  for (const account of accounts) {
    const accountCursor = cursor[account.id];
    if (accountCursor === EXHAUSTED) {
      // Already fully read on an earlier page — do not re-query. Carry the
      // sentinel forward: dropping the key here makes it indistinguishable
      // from "never queried", which re-reads the account from the start on
      // the next page and duplicates every entry it already returned.
      nextCursor[account.id] = EXHAUSTED;
      continue;
    }

    try {
      const credentials = await getOrAssumeRole({
        roleArn: account.roleArn,
        externalId: account.externalId,
        region: account.region,
      });
      const client = sesClientFor(account, credentials);

      const response = await client.send(
        new ListSuppressedDestinationsCommand({
          PageSize: limit,
          NextToken: accountCursor,
          Reasons: reason ? [reason] : undefined,
          StartDate: startDate,
          EndDate: endDate,
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
      logger.warn(
        { awsAccountId: account.id, err: error },
        "Failed to list SES suppressed destinations for account"
      );
      unreachableAccountIds.push(account.id);
      nextCursor[account.id] = EXHAUSTED;
    }
  }

  const hasMore = Object.values(nextCursor).some((v) => v !== EXHAUSTED);

  return {
    entries,
    nextToken: hasMore ? encodeCursor(nextCursor) : undefined,
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
 * Look up a single suppressed address on a specific AWS account. Returns a
 * typed outcome rather than throwing on the common cases (not found, denied)
 * so callers — in particular the COMPLAINT re-read guard in
 * apps/web/src/actions/suppressions.ts — can distinguish "not suppressed"
 * from "couldn't check" without parsing error strings.
 */
export async function getSuppressedAddress(params: {
  account: AwsAccountRow;
  email: string;
}): Promise<GetSuppressedAddressResult> {
  const { account, email } = params;

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });
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
    logger.warn(
      { awsAccountId: account.id, err: error },
      "Failed to get SES suppressed destination"
    );
    throw error;
  }
}

export type DeleteSuppressedAddressResult =
  | { status: "removed" }
  | { status: "not_found" }
  | { status: "denied" };

/**
 * Delete a single suppressed address on a specific AWS account. Distinguishes
 * "removed" from "was not there" rather than swallowing NotFoundException —
 * the caller needs to tell the operator which happened.
 */
export async function deleteSuppressedAddress(params: {
  account: AwsAccountRow;
  email: string;
}): Promise<DeleteSuppressedAddressResult> {
  const { account, email } = params;

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });
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
    logger.warn(
      { awsAccountId: account.id, err: error },
      "Failed to delete SES suppressed destination"
    );
    throw error;
  }
}
