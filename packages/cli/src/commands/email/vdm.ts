import * as clack from "@clack/prompts";
import { getSesFeatureEntitlement } from "@wraps/core/ses-plans";
import pc from "picocolors";
import { getTelemetryClient } from "../../telemetry/client.js";
import { trackCommand } from "../../telemetry/events.js";
import type { EmailVdmOptions } from "../../types/index.js";
import {
  SES_PLAN_RATES,
  type SESPricingPlan,
} from "../../utils/email/ses-plans.js";
import { resolveNegatableFlag } from "../../utils/shared/arg-parser.js";
import {
  getSESVdmAttributes,
  setSESVdmAttributes,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { WrapsError } from "../../utils/shared/errors.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import { isInteractive } from "../../utils/shared/prompts.js";
import { resolveSetRegion } from "./plan.js";

/**
 * One plan-aware sentence about VDM's entitlement, shared by the read path,
 * the change path, and the confirmation prompt. Returns the static
 * plan-unknown sentence when `currentPlan` couldn't be determined, rather
 * than guessing.
 */
function describeVdmEntitlement(
  currentPlan: SESPricingPlan | undefined,
  vdmEnabled: boolean
): string {
  if (!currentPlan) {
    return "Could not read your SES plan. VDM is included on Essentials, Pro and Enterprise and billed as an add-on on à la carte pricing.";
  }

  const entitlement = getSesFeatureEntitlement(currentPlan, "vdm");
  const planLabel = SES_PLAN_RATES[currentPlan].label;

  if (entitlement.status === "included") {
    return vdmEnabled
      ? `VDM is included in your ${planLabel} plan and is switched on.`
      : `VDM is included in your ${planLabel} plan and is switched off. Turn it on: wraps email vdm --enable --region <region>`;
  }

  if (entitlement.status === "addon") {
    return `VDM is billed as an add-on on your plan (${entitlement.price}).`;
  }

  return `VDM is not available on your plan: ${entitlement.reason}`;
}

function printState(
  region: string,
  state: Awaited<ReturnType<typeof getSESVdmAttributes>>
): void {
  console.log(`\n${pc.bold(region)}`);
  console.log(`  VDM: ${state.vdmEnabled ? pc.green("on") : pc.yellow("off")}`);
  console.log(
    `    Engagement metrics: ${state.engagementMetrics ? "on" : "off"}`
  );
  console.log(
    `    Optimized shared delivery: ${state.optimizedSharedDelivery ? "on" : "off"}`
  );
  console.log(
    `\n  ${pc.dim(describeVdmEntitlement(state.currentPlan, state.vdmEnabled))}`
  );
}

/**
 * Read-only default path: report VDM's on/off state and sub-settings for one
 * Region, plus a plan-aware entitlement line. Never mutates.
 */
async function runReadPath(
  options: EmailVdmOptions,
  accountId: string,
  startTime: number
): Promise<void> {
  const region = await resolveSetRegion(options, accountId);
  const state = await getSESVdmAttributes(region);

  if (isJsonMode()) {
    jsonSuccess("email.vdm", {
      mode: "read",
      region,
      currentPlan: state.currentPlan ?? null,
      vdm: {
        enabled: state.vdmEnabled,
        engagementMetrics: state.engagementMetrics,
        optimizedSharedDelivery: state.optimizedSharedDelivery,
      },
      entitlement: state.currentPlan
        ? getSesFeatureEntitlement(state.currentPlan, "vdm")
        : null,
    });
  } else {
    printState(region, state);
    console.log("");
  }

  trackCommand("email:vdm", {
    success: true,
    mode: "read",
    region,
    duration_ms: Date.now() - startTime,
  });

  if (!isJsonMode()) {
    getTelemetryClient().showFooterOnce();
  }
}

/**
 * Mutating path: validate flags, resolve the target state (decisions 2 and
 * 3 in plan 373 — enabling with no sub-flags turns both sub-settings on;
 * unspecified sub-flags carry forward the account's current value), confirm,
 * apply, and re-read to confirm the result.
 */
async function runSetPath(
  options: EmailVdmOptions,
  accountId: string,
  startTime: number
): Promise<void> {
  if (options.enable && options.disable) {
    throw new WrapsError(
      "Pass either --enable or --disable, not both.",
      "CONFLICTING_VDM_FLAGS",
      "Run wraps email vdm to see the current state.",
      "https://wraps.dev/docs/cli-reference/email"
    );
  }

  const region = await resolveSetRegion(options, accountId);
  const before = await getSESVdmAttributes(region);

  const engagementFlag = resolveNegatableFlag(
    options.engagement,
    "--no-engagement"
  );
  const optimizedDeliveryFlag = resolveNegatableFlag(
    options.optimizedDelivery,
    "--no-optimized-delivery"
  );

  // Enabling with no sub-flags turns both sub-settings on (decision 2).
  // Disabling always turns the sub-settings off along with the account
  // switch. A sub-flag not mentioned carries forward the account's current
  // value, so a write never resets a setting chosen outside Wraps
  // (decision 3).
  const vdmEnabled = Boolean(options.enable);
  const engagementMetrics = options.disable
    ? false
    : (engagementFlag ?? (options.enable ? true : before.engagementMetrics));
  const optimizedSharedDelivery = options.disable
    ? false
    : (optimizedDeliveryFlag ??
      (options.enable ? true : before.optimizedSharedDelivery));

  const target = {
    vdmEnabled,
    engagementMetrics,
    optimizedSharedDelivery,
  };

  const unchanged =
    before.vdmEnabled === target.vdmEnabled &&
    before.engagementMetrics === target.engagementMetrics &&
    before.optimizedSharedDelivery === target.optimizedSharedDelivery;

  if (!isJsonMode()) {
    console.log(`\n${pc.bold(region)}`);
    console.log(
      `  VDM: ${before.vdmEnabled ? "on" : "off"} -> ${target.vdmEnabled ? "on" : "off"}`
    );
    console.log(
      `    Engagement metrics: ${before.engagementMetrics ? "on" : "off"} -> ${target.engagementMetrics ? "on" : "off"}`
    );
    console.log(
      `    Optimized shared delivery: ${before.optimizedSharedDelivery ? "on" : "off"} -> ${target.optimizedSharedDelivery ? "on" : "off"}`
    );
    console.log(
      `\n  ${pc.dim(describeVdmEntitlement(before.currentPlan, before.vdmEnabled))}`
    );
  }

  if (unchanged) {
    if (isJsonMode()) {
      jsonSuccess("email.vdm", {
        mode: "set",
        region,
        before: {
          enabled: before.vdmEnabled,
          engagementMetrics: before.engagementMetrics,
          optimizedSharedDelivery: before.optimizedSharedDelivery,
        },
        after: {
          enabled: before.vdmEnabled,
          engagementMetrics: before.engagementMetrics,
          optimizedSharedDelivery: before.optimizedSharedDelivery,
        },
        unchanged: true,
      });
    } else {
      console.log(`\n  ${pc.dim("Nothing to change.")}`);
    }

    trackCommand("email:vdm", {
      success: true,
      mode: "set",
      region,
      duration_ms: Date.now() - startTime,
    });
    return;
  }

  if (options.disable && before.vdmEnabled && !isJsonMode()) {
    console.log(
      `\n  ${pc.yellow("VDM was already on in this account — it may have been enabled outside Wraps.")}`
    );
  }

  if (!options.yes) {
    if (!isInteractive()) {
      throw new WrapsError(
        "Confirmation required to change your account's VDM settings.",
        "CONFIRMATION_REQUIRED",
        "Pass --yes to skip the confirmation prompt (required in non-interactive environments).",
        "https://wraps.dev/docs/cli-reference"
      );
    }

    const confirmed = await clack.confirm({
      message: `Change VDM settings for account ${accountId} in ${region}?`,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  await setSESVdmAttributes(region, target);

  // Never claim success from the Put response alone — re-read the account.
  const after = await getSESVdmAttributes(region);

  if (isJsonMode()) {
    jsonSuccess("email.vdm", {
      mode: "set",
      region,
      before: {
        enabled: before.vdmEnabled,
        engagementMetrics: before.engagementMetrics,
        optimizedSharedDelivery: before.optimizedSharedDelivery,
      },
      after: {
        enabled: after.vdmEnabled,
        engagementMetrics: after.engagementMetrics,
        optimizedSharedDelivery: after.optimizedSharedDelivery,
      },
      unchanged: false,
    });
  } else {
    clack.log.success(
      `VDM updated. VDM is now ${pc.cyan(after.vdmEnabled ? "on" : "off")} (engagement metrics ${after.engagementMetrics ? "on" : "off"}, optimized shared delivery ${after.optimizedSharedDelivery ? "on" : "off"}).`
    );
    clack.outro(pc.green("Done!"));
  }

  trackCommand("email:vdm", {
    success: true,
    mode: "set",
    region,
    duration_ms: Date.now() - startTime,
  });
}

/**
 * `wraps email vdm` — show, and (with `--enable`/`--disable`) switch,
 * Virtual Deliverability Manager for the account. Read-only by default;
 * a change always requires a confirmation or `--yes`.
 */
export async function emailVdm(options: EmailVdmOptions): Promise<void> {
  const startTime = Date.now();

  if (!isJsonMode()) {
    clack.intro(pc.bold("Wraps Email — Virtual Deliverability Manager"));
  }

  const identity = await validateAWSCredentials();

  if (options.enable || options.disable) {
    await runSetPath(options, identity.accountId, startTime);
    return;
  }

  await runReadPath(options, identity.accountId, startTime);
}
