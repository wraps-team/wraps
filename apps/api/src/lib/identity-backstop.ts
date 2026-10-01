import {
  type awsAccount,
  claimIdentityRefresh,
  upsertSnapshotIdentity,
} from "@wraps/db";
import { getWrapsIdentity } from "@wraps/email";
import { getCredentials } from "../services/credentials";
import { log } from "./logger";

const BACKSTOP_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * An event from a Wraps config set, sent from a domain the snapshot does not
 * list, is proof the snapshot is stale. Look up that one domain and upsert it.
 * At most one GetEmailIdentity per account per cooldown. Never throws.
 */
export async function recordSendingIdentity(params: {
  account: {
    id: string;
    organizationId: string;
    features: (typeof awsAccount.$inferSelect)["features"];
  };
  tags: Record<string, string[]> | undefined;
}): Promise<void> {
  const { account, tags } = params;
  try {
    const configSet = tags?.["ses:configuration-set"]?.[0];
    if (!configSet?.startsWith("wraps-email-")) {
      return;
    }

    const fromDomain = tags?.["ses:from-domain"]?.[0]?.toLowerCase();
    if (!fromDomain) {
      return;
    }

    // Hot path: every event takes this in-memory check and almost none go on.
    const known = account.features?.email?.identities?.some(
      (i) => i.type === "DOMAIN" && i.identity.toLowerCase() === fromDomain
    );
    if (known) {
      return;
    }

    const claimed = await claimIdentityRefresh({
      organizationId: account.organizationId,
      awsAccountId: account.id,
      cooldownMs: BACKSTOP_COOLDOWN_MS,
    });
    if (!claimed) {
      return;
    }

    const credentials = await getCredentials(
      account.id,
      account.organizationId
    );
    const found = await getWrapsIdentity(
      credentials,
      credentials.region,
      fromDomain
    );
    if (found) {
      await upsertSnapshotIdentity({
        organizationId: account.organizationId,
        awsAccountId: account.id,
        identity: found,
      });
    }
  } catch (error) {
    log.warn("Webhook: identity backstop failed", {
      error: error instanceof Error ? error.message : String(error),
      accountId: account.id,
    });
  }
}
