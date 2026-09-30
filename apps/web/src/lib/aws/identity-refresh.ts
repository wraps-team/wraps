import {
  and,
  awsAccount,
  claimIdentityRefresh,
  db,
  eq,
  writeIdentitySnapshot,
} from "@wraps/db";
import { scanWrapsIdentities } from "@wraps/email";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import { logger } from "@/lib/logger";

const IDENTITY_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Refreshes the identities snapshot for an org's verified accounts, at most
 * once per cooldown per account. Runs inside after(): never throws.
 */
export async function refreshIdentitySnapshots(
  organizationId: string
): Promise<void> {
  let accounts: Array<{
    id: string;
    roleArn: string;
    externalId: string;
    region: string;
  }>;
  try {
    accounts = await db
      .select({
        id: awsAccount.id,
        roleArn: awsAccount.roleArn,
        externalId: awsAccount.externalId,
        region: awsAccount.region,
      })
      .from(awsAccount)
      .where(
        and(
          eq(awsAccount.organizationId, organizationId),
          eq(awsAccount.isVerified, true)
        )
      );
  } catch (error) {
    logger.warn(
      { err: error, organizationId },
      "Identity refresh: list failed"
    );
    return;
  }

  for (const account of accounts) {
    try {
      const claimed = await claimIdentityRefresh({
        organizationId,
        awsAccountId: account.id,
        cooldownMs: IDENTITY_REFRESH_COOLDOWN_MS,
      });
      if (!claimed) {
        continue;
      }

      const credentials = await getOrAssumeRole({
        roleArn: account.roleArn,
        externalId: account.externalId,
      });
      const identities = await scanWrapsIdentities(credentials, account.region);
      await writeIdentitySnapshot({
        organizationId,
        awsAccountId: account.id,
        identities,
      });
    } catch (error) {
      logger.warn(
        { err: error, organizationId, awsAccountId: account.id },
        "Identity refresh failed"
      );
    }
  }
}
