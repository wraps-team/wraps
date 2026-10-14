import { eq, isNull } from "drizzle-orm";
import { db } from "../index";
import { organizationExtension } from "../schema/app";
import type { DbClient } from "./subscriptions";

/**
 * Atomically claim the one-time "first email sent" activation milestone for an
 * org. Returns true for exactly one caller per org — the winner emits
 * `activation_first_email_sent`; every later or concurrent caller gets false.
 * Shared by apps/web and apps/api so web broadcasts, workflow sends and SDK
 * deliveries all count toward the same single milestone.
 */
export async function claimFirstEmailMilestone(
  organizationId: string,
  dbClient: DbClient = db
): Promise<boolean> {
  // Cheap PK read first: this runs on every Delivery webhook, so once the org
  // is tracked every later call short-circuits with no write and no row lock.
  const [existing] = await dbClient
    .select({ trackedAt: organizationExtension.activationFirstEmailTrackedAt })
    .from(organizationExtension)
    .where(eq(organizationExtension.organizationId, organizationId))
    .limit(1);
  if (existing?.trackedAt) {
    return false;
  }

  // First-time path: the `IS NULL` setWhere makes concurrent first-fires safe —
  // two callers can both read null above, but exactly one wins the upsert.
  const now = new Date();
  const claimed = await dbClient
    .insert(organizationExtension)
    .values({ organizationId, activationFirstEmailTrackedAt: now })
    .onConflictDoUpdate({
      target: organizationExtension.organizationId,
      set: { activationFirstEmailTrackedAt: now, updatedAt: now },
      setWhere: isNull(organizationExtension.activationFirstEmailTrackedAt),
    })
    .returning({ organizationId: organizationExtension.organizationId });
  return claimed.length > 0;
}
