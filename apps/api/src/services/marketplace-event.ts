/**
 * Shared AWS Marketplace event correlation.
 *
 * Sized to be importable by the lightweight DLQ consumer: it touches
 * `@wraps/db` only, not the SES/React-Email stack the main worker pulls in for
 * the welcome email. Both `marketplace-events` and `marketplace-dlq-consumer`
 * correlate events through the same rules so the two cannot drift.
 */

import {
  and,
  awsMarketplaceSubscription,
  db,
  desc,
  eq,
  ilike,
} from "@wraps/db";

export type MarketplaceEvent = {
  id?: string;
  "detail-type"?: string;
  source?: string;
  time?: string;
  detail?: {
    agreement?: { id?: string; status?: string };
    product?: { code?: string; id?: string };
    license?: { arn?: string };
    acceptor?: { accountId?: string };
    offer?: { id?: string };
  };
};

/**
 * Detail types the worker acts on. Everything else is acknowledged and
 * dropped — the rule is deliberately broader than this map so a new event
 * type shows up in logs instead of vanishing.
 *
 * `Purchase Agreement Created` doubles as the activation signal because it is
 * unverified whether a Free-pricing product emits `License Updated` at all
 * (entitlements are a contract-pricing concept). Whichever arrives first wins;
 * the second is a no-op.
 */
export const ACTIVATING = new Set([
  "License Updated - Manufacturer",
  "Purchase Agreement Created - Proposer",
  "Purchase Agreement Created - Manufacturer",
]);

export const DEACTIVATING = new Set([
  "License Deprovisioned - Manufacturer",
  "Purchase Agreement Ended - Proposer",
  "Purchase Agreement Ended - Manufacturer",
]);

export const ADVISORY = new Set([
  "Purchase Agreement Advisory Issued - Manufacturer",
]);

/**
 * AWS's own documentation prints licence ARNs inconsistently — the License
 * event example omits the leading `arn:` that ResolveCustomer returns. Compare
 * on the licence id (`l-…`) so a formatting difference cannot silently prevent
 * every correlation.
 */
export function licenseKey(arn: string | undefined): string | null {
  if (!arn) {
    return null;
  }
  const match = arn.match(/l-[0-9a-f]+/i);
  return match ? match[0].toLowerCase() : arn.toLowerCase();
}

/**
 * Correlation, most specific first. Licence ARN is the only truly unique key
 * under Concurrent Agreements; account + product is a last resort that can
 * legitimately match several rows, so it takes the newest deliberately rather
 * than whichever Postgres happens to return.
 */
export async function findSubscription(keys: {
  arn?: string;
  agreementId?: string;
  accountId?: string;
  productCode?: string;
}) {
  if (keys.arn) {
    // Exact hit on the unique index covers the normal case.
    const [exact] = await db
      .select()
      .from(awsMarketplaceSubscription)
      .where(eq(awsMarketplaceSubscription.licenseArn, keys.arn))
      .limit(1);
    if (exact) {
      return exact;
    }

    // Formatting mismatch fallback — match on the `l-…` id alone. Bounded by
    // LIMIT rather than loading the table into memory.
    const key = licenseKey(keys.arn);
    if (key?.startsWith("l-")) {
      const [suffix] = await db
        .select()
        .from(awsMarketplaceSubscription)
        .where(ilike(awsMarketplaceSubscription.licenseArn, `%${key}%`))
        .limit(1);
      if (suffix) {
        return suffix;
      }
    }
  }

  if (keys.agreementId) {
    const [byAgreement] = await db
      .select()
      .from(awsMarketplaceSubscription)
      .where(eq(awsMarketplaceSubscription.agreementId, keys.agreementId))
      .limit(1);
    if (byAgreement) {
      return byAgreement;
    }
  }

  if (keys.accountId && keys.productCode) {
    const [byAccount] = await db
      .select()
      .from(awsMarketplaceSubscription)
      .where(
        and(
          eq(awsMarketplaceSubscription.customerAwsAccountId, keys.accountId),
          eq(awsMarketplaceSubscription.productCode, keys.productCode)
        )
      )
      .orderBy(desc(awsMarketplaceSubscription.resolvedAt))
      .limit(1);
    if (byAccount) {
      return byAccount;
    }
  }

  return null;
}
