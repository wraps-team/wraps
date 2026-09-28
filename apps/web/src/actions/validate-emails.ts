"use server";

import {
  getSesFeatureEntitlement,
  isSesPricingPlan,
  type SesFeatureEntitlement,
  type SesPricingPlan,
} from "@wraps/core/ses-plans";
import { awsAccount, db } from "@wraps/db";
import { eq } from "drizzle-orm";
import { orgAction } from "./shared/org-action";

/**
 * An AWS account this org can validate addresses against with SES's Email
 * Address Insights API. Only PRO/ENTERPRISE accounts are eligible — the
 * allowance (2,500 or 5,000 validations/month) and per-call price are set
 * per AWS account per Region, not per organization.
 */
export type SesValidationAccount = {
  id: string;
  name: string;
  region: string;
  plan: Extract<SesPricingPlan, "PRO" | "ENTERPRISE">;
  entitlement: SesFeatureEntitlement;
};

/**
 * List this org's AWS accounts whose last-measured SES pricing plan is PRO
 * or ENTERPRISE — the only plans that include the Email Address Insights
 * allowance. Read-only; used to decide whether to show the "Validate with
 * SES" import option at all, and which account to validate against when
 * there is more than one. The actual validation call happens inside
 * `importContacts` (apps/web/src/actions/import-contacts.ts), using
 * `apps/web/src/lib/ses-email-validation.ts`.
 */
export const getSesValidationAccounts = orgAction(
  {
    name: "getSesValidationAccounts",
    resource: "contacts",
    permission: ["import"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to load AWS accounts for SES validation",
  },
  async (_ctx, organizationId: string) => {
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, organizationId),
      columns: { id: true, name: true, region: true, healthDetail: true },
    });

    const eligible: SesValidationAccount[] = [];
    for (const acct of accounts) {
      const raw = acct.healthDetail?.sesPricingPlan?.current;
      if (!(raw && isSesPricingPlan(raw))) {
        continue;
      }
      if (raw !== "PRO" && raw !== "ENTERPRISE") {
        continue;
      }
      eligible.push({
        id: acct.id,
        name: acct.name,
        region: acct.region,
        plan: raw,
        entitlement: getSesFeatureEntitlement(raw, "validationApi"),
      });
    }

    return { success: true as const, accounts: eligible };
  }
);
