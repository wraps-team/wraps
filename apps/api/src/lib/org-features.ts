/**
 * Plan lookups for code that runs outside a request (workers, event
 * processing), where there is no auth context carrying the plan.
 */

import { db, subscription } from "@wraps/db";
import { and, eq, inArray } from "drizzle-orm";
import { isSelfHosted } from "../(ee)/lib/license";
import { type Feature, planAllows } from "./plan-features";

/** The org's active plan, or "free" when it has no live subscription. */
export async function getOrgPlanId(organizationId: string): Promise<string> {
  const rows = await db
    .select({ plan: subscription.plan })
    .from(subscription)
    .where(
      and(
        eq(subscription.referenceId, organizationId),
        inArray(subscription.status, ["active", "trialing"])
      )
    )
    .limit(1);

  return rows[0]?.plan ?? "free";
}

/** Whether an org's plan includes a feature. Licensed self-hosted is always open. */
export async function orgHasFeature(
  organizationId: string,
  feature: Feature
): Promise<boolean> {
  if (isSelfHosted()) {
    return true;
  }
  return planAllows(await getOrgPlanId(organizationId), feature);
}
