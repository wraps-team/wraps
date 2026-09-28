import * as clack from "@clack/prompts";
import { getSesFeatureEntitlement } from "@wraps/core/ses-plans";
import { getSESAccountStatus } from "../shared/aws.js";
import { errors } from "../shared/errors.js";
import type { SESPricingPlan } from "./ses-plans.js";

// verified 2026-09-27 against aws.amazon.com/ses/pricing — AWS does not
// publish the Essentials add-on rate for managed dedicated IPs, only the à
// la carte figure.
const ALACARTE =
  "$15/month per account plus $0.08 per 1,000 emails sent through the pool " +
  "(first 10M/month; $0.04 for 10–50M, $0.02 for 50–100M)";

/**
 * Describe what managed dedicated IPs cost on `plan`, in `region`. Pure —
 * takes the already-resolved plan rather than fetching it, so it's testable
 * without AWS credentials.
 */
export function describeManagedDedicatedIpCost(
  plan: SESPricingPlan | undefined,
  region: string
): string {
  if (plan === undefined) {
    return `Couldn't read your SES pricing plan in ${region}. At à la carte pricing this costs ${ALACARTE}.`;
  }

  const entitlement = getSesFeatureEntitlement(plan, "managedDedicatedIps");

  if (entitlement.status === "included") {
    const label = plan === "PRO" ? "Pro" : "Enterprise";
    return `Included in your SES ${label} plan in ${region}.`;
  }

  if (entitlement.status === "unavailable") {
    throw errors.managedDedicatedIpsUnavailable(entitlement.reason);
  }

  // status === "addon"
  if (plan === "ESSENTIALS") {
    return `An add-on on the SES Essentials plan in ${region}. AWS does not publish the Essentials add-on rate; à la carte is ${ALACARTE}.`;
  }
  return `À la carte pricing in ${region}: ${ALACARTE}.`;
}

/**
 * Confirm turning managed dedicated IPs on or off, showing the customer's
 * plan-aware cost line first. Returns false (no prompt shown) when `yes` is
 * set, or when the user declines/cancels.
 */
export async function confirmManagedDedicatedIps(options: {
  region: string;
  enable: boolean;
  yes?: boolean;
}): Promise<boolean> {
  const { region, enable, yes } = options;
  const status = await getSESAccountStatus(region);

  if (enable) {
    clack.log.info(describeManagedDedicatedIpCost(status.currentPlan, region));
    clack.log.info(
      "SES warms managed IPs up automatically. Turning this off later deletes the pool and releases its IPs."
    );
  } else {
    clack.log.info(
      "This deletes the wraps-email-managed pool and releases its IPs. The configuration set goes back to shared SES IPs. Charges stop if it is your last managed pool."
    );
  }

  if (yes) {
    return true;
  }

  const confirmed = await clack.confirm({
    message: enable
      ? "Enable managed dedicated IPs?"
      : "Disable managed dedicated IPs?",
    initialValue: false,
  });

  if (clack.isCancel(confirmed)) {
    return false;
  }

  return confirmed;
}
