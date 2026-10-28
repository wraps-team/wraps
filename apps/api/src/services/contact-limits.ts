import { contact, db } from "@wraps/db";
import { count, eq } from "drizzle-orm";
import { isSelfHosted } from "../(ee)/lib/license";
import { isPlanId, type PlanId } from "../lib/plan-ids";

/**
 * Contact cap per plan. Mirrors `maxContacts` in apps/web/src/lib/plans.ts
 * (-1 = unlimited). Every plan is unlimited today, so the check below never
 * refuses; it exists so a future cap is enforced by the API the same way the
 * dashboard action enforces it (`checkContactLimit`, apps/web/src/lib/plan-limits).
 * Keep this table in step with the web plans file.
 */
const CONTACT_LIMITS: Record<PlanId, number> = {
  free: -1,
  pro: -1,
  business: -1,
  starter: -1,
  growth: -1,
  scale: -1,
};

export type ContactLimitCheck = {
  allowed: boolean;
  current: number;
  limit: number;
  message?: string;
};

/**
 * Whether `organizationId` may add contacts on `planId`. Self-hosted installs
 * are never capped, matching the web `checkContactLimit`.
 */
export async function checkContactLimitForOrg(
  organizationId: string,
  planId: string | null
): Promise<ContactLimitCheck> {
  const plan: PlanId = isPlanId(planId) ? planId : "free";
  const [row] = await db
    .select({ count: count() })
    .from(contact)
    .where(eq(contact.organizationId, organizationId));

  const current = row?.count ?? 0;
  const limit = isSelfHosted() ? -1 : CONTACT_LIMITS[plan];
  const allowed = limit === -1 || current < limit;

  return {
    allowed,
    current,
    limit,
    message: allowed
      ? undefined
      : `You've reached your plan limit of ${limit.toLocaleString()} contacts. Upgrade to add more.`,
  };
}
