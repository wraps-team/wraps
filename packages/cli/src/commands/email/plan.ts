import * as clack from "@clack/prompts";
import pc from "picocolors";
import { getTelemetryClient } from "../../telemetry/client.js";
import { trackCommand } from "../../telemetry/events.js";
import type { EmailPlanOptions } from "../../types/index.js";
import {
  formatUSD,
  isSESPricingPlan,
  monthlyCostForPlan,
  planComparison,
  SES_PLAN_RATES,
  SES_PRICING_PLANS,
  type SESPlanComparison,
  type SESPricingPlan,
} from "../../utils/email/ses-plans.js";
import {
  getAWSRegion,
  getSESAccountStatus,
  setSESPricingPlan,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { WrapsError } from "../../utils/shared/errors.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import { findConnectionsWithService } from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";
import { isInteractive } from "../../utils/shared/prompts.js";

/**
 * Reference monthly volume used when no real send signal is available. AWS
 * defaults accounts "with no metered SES activity since June 1, 2025" onto
 * Essentials — so a customer running this command with zero recent sends is
 * the COMMON case, not an edge case. Showing an all-$0.00 table at that
 * volume would bury the finding, so we illustrate at a plausible volume
 * instead and say so explicitly.
 */
const REFERENCE_VOLUME_PER_MONTH = 50_000;

/**
 * Below this monthly USD delta between the current plan and the cheapest
 * plan, the headline number is too small to make the rate gap legible on its
 * own — a $0.00 vs $0.00 row reads as "nothing to fix" even though the RATE
 * gap (e.g. Essentials' $0.16/1K vs à la carte's $0.10/1K) is real and will
 * compound as volume grows. Below this threshold we add an explicit
 * illustrative projection instead of letting silence imply parity.
 */
const NEGLIGIBLE_MONTHLY_DELTA_USD = 1;

type VolumeSource = "override" | "measured" | "estimated";

/**
 * Illustration shown when the current plan isn't cheapest but the real
 * monthly delta is too small to read as urgent. Every figure here is
 * computed via `monthlyCostForPlan` at `REFERENCE_VOLUME_PER_MONTH` — never
 * hardcoded — so it stays correct if AWS's rates change.
 */
type LowVolumeProjection = {
  currentPlan: SESPricingPlan;
  cheapestPlan: SESPricingPlan;
  currentPer1K: number;
  cheapestPer1K: number;
  referenceEmailsPerMonth: number;
  currentMonthlyCostAtReference: number;
  cheapestMonthlyCostAtReference: number;
  annualDeltaAtReference: number;
};

type RegionPlanReport = {
  region: string;
  currentPlan?: SESPricingPlan;
  nextPlan?: SESPricingPlan;
  emailsPerMonth: number;
  volumeSource: VolumeSource;
  comparison: SESPlanComparison;
  lowVolumeProjection: LowVolumeProjection | null;
};

/** Round to whole cents so money comparisons/output don't trip on float noise. */
function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * When the current plan isn't the cheapest but the real monthly delta at the
 * account's actual volume is too small to read as urgent (e.g. a 30/mo
 * sender losing sub-cent amounts to Essentials' markup), project the same
 * rate gap at the illustrative reference volume so the customer can see
 * where it's headed. Returns `null` when there's nothing to project: current
 * plan unknown, already on the cheapest plan, or the delta is already large
 * enough to speak for itself.
 */
function computeLowVolumeProjection(
  currentPlan: SESPricingPlan | undefined,
  comparison: SESPlanComparison
): LowVolumeProjection | null {
  if (!currentPlan || currentPlan === comparison.cheapestPlan) {
    return null;
  }

  const currentRow = comparison.rows.find((r) => r.plan === currentPlan);
  const cheapestRow = comparison.rows.find(
    (r) => r.plan === comparison.cheapestPlan
  );
  const monthlyDelta = Math.abs(
    (currentRow?.monthlyCost ?? 0) - (cheapestRow?.monthlyCost ?? 0)
  );

  if (monthlyDelta >= NEGLIGIBLE_MONTHLY_DELTA_USD) {
    return null;
  }

  const cheapest = comparison.cheapestPlan;
  const currentMonthlyCostAtReference = monthlyCostForPlan(
    currentPlan,
    REFERENCE_VOLUME_PER_MONTH
  );
  const cheapestMonthlyCostAtReference = monthlyCostForPlan(
    cheapest,
    REFERENCE_VOLUME_PER_MONTH
  );

  return {
    currentPlan,
    cheapestPlan: cheapest,
    currentPer1K: SES_PLAN_RATES[currentPlan].tiers[0].per1K,
    cheapestPer1K: SES_PLAN_RATES[cheapest].tiers[0].per1K,
    referenceEmailsPerMonth: REFERENCE_VOLUME_PER_MONTH,
    currentMonthlyCostAtReference,
    cheapestMonthlyCostAtReference,
    annualDeltaAtReference: roundCents(
      (currentMonthlyCostAtReference - cheapestMonthlyCostAtReference) * 12
    ),
  };
}

/**
 * Resolve the monthly send volume to price plans against: `--volume`
 * overrides everything; otherwise prefer the real `SentLast24Hours` signal
 * (extrapolated to a month); otherwise fall back to the illustrative
 * reference volume.
 */
function resolveVolume(
  options: EmailPlanOptions,
  sentLast24Hours: number | undefined
): { emailsPerMonth: number; source: VolumeSource } {
  if (options.volume !== undefined) {
    const parsed = Number.parseInt(options.volume, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return { emailsPerMonth: parsed, source: "override" };
    }
  }

  if (sentLast24Hours && sentLast24Hours > 0) {
    return { emailsPerMonth: sentLast24Hours * 30, source: "measured" };
  }

  return { emailsPerMonth: REFERENCE_VOLUME_PER_MONTH, source: "estimated" };
}

/** Resolve the unique set of Regions tracked for this account's email service. */
async function resolveTrackedRegions(accountId: string): Promise<string[]> {
  const connections = await findConnectionsWithService(accountId, "email");
  return [...new Set(connections.map((conn) => conn.region))];
}

async function buildRegionReport(
  region: string,
  options: EmailPlanOptions
): Promise<RegionPlanReport> {
  const status = await getSESAccountStatus(region);
  const { emailsPerMonth, source } = resolveVolume(
    options,
    status.sendQuota?.sentLast24Hours
  );

  const comparison = planComparison(emailsPerMonth, status.currentPlan);

  return {
    region,
    currentPlan: status.currentPlan,
    nextPlan: status.nextPlan,
    emailsPerMonth,
    volumeSource: source,
    comparison,
    lowVolumeProjection: computeLowVolumeProjection(
      status.currentPlan,
      comparison
    ),
  };
}

/** Format a plan row's delta vs. the current plan for the human table. */
function formatDelta(deltaVsCurrent: number | undefined): string {
  if (!deltaVsCurrent) {
    return "";
  }
  const suffix = `${formatUSD(Math.abs(deltaVsCurrent))}/mo vs current`;
  return deltaVsCurrent > 0 ? pc.red(` +${suffix}`) : pc.green(` -${suffix}`);
}

function volumeSourceLabel(source: VolumeSource): string {
  switch (source) {
    case "override":
      return "from --volume";
    case "measured":
      return "measured: last 24h × 30";
    case "estimated":
      return "illustrative reference volume — pass --volume <n> for your real number";
    default:
      return "";
  }
}

function printRegionReport(report: RegionPlanReport): void {
  console.log(`\n${pc.bold(report.region)}`);

  if (report.currentPlan) {
    console.log(
      `  Current plan: ${pc.cyan(report.comparison.rows.find((r) => r.plan === report.currentPlan)?.label ?? report.currentPlan)}`
    );
  } else {
    console.log(
      `  Current plan: ${pc.yellow("unknown")} (SES didn't report a recognized pricing plan for this account)`
    );
  }

  if (report.nextPlan && report.nextPlan !== report.currentPlan) {
    const nextLabel =
      report.comparison.rows.find((r) => r.plan === report.nextPlan)?.label ??
      report.nextPlan;
    console.log(
      `  Pending change: ${pc.yellow(nextLabel)} (next billing cycle)`
    );
  }

  console.log(
    `  Estimated volume: ${report.emailsPerMonth.toLocaleString("en-US")}/mo (${volumeSourceLabel(report.volumeSource)})`
  );

  console.log("");
  for (const row of report.comparison.rows) {
    const marker = row.isCheapest ? pc.green("cheapest") : "";
    const current = row.isCurrent ? pc.dim(" (current)") : "";
    const delta = formatDelta(row.deltaVsCurrent);
    const rate = `(${formatUSD(SES_PLAN_RATES[row.plan].tiers[0].per1K)}/1K)`;
    console.log(
      `  ${row.label.padEnd(12)} ${formatUSD(row.monthlyCost).padStart(12)}/mo  ${rate.padEnd(12)}${current} ${marker}${delta}`
    );
  }

  if (report.lowVolumeProjection) {
    const p = report.lowVolumeProjection;
    const currentLabel = SES_PLAN_RATES[p.currentPlan].label;
    console.log(
      `\n  ${pc.dim(
        `At ${report.emailsPerMonth.toLocaleString("en-US")}/mo the difference is under a dollar — but ${currentLabel} costs ${formatUSD(p.currentPer1K)}/1K against ${formatUSD(p.cheapestPer1K)}/1K. At ${p.referenceEmailsPerMonth.toLocaleString("en-US")}/mo that is ${formatUSD(p.currentMonthlyCostAtReference)} vs ${formatUSD(p.cheapestMonthlyCostAtReference)} (~${formatUSD(p.annualDeltaAtReference)}/yr, illustrative).`
      )}`
    );
  }

  if (
    report.currentPlan &&
    report.comparison.cheapestPlan !== report.currentPlan &&
    report.comparison.annualSavings
  ) {
    const cheapestLabel =
      report.comparison.rows.find(
        (r) => r.plan === report.comparison.cheapestPlan
      )?.label ?? report.comparison.cheapestPlan;
    console.log(
      `\n  ${pc.green("Recommendation:")} switch to ${pc.bold(cheapestLabel)} to save ~${formatUSD(report.comparison.annualSavings)}/yr`
    );
  }

  if (report.currentPlan === "ESSENTIALS") {
    console.log(
      `  ${pc.dim("If you didn't pick this plan, it may be the new-account default. A first cancellation back to à la carte from a defaulted Essentials plan takes effect immediately (not next billing cycle).")}`
    );
  }
}

function regionReportToJson(report: RegionPlanReport) {
  return {
    region: report.region,
    currentPlan: report.currentPlan ?? null,
    nextPlan: report.nextPlan ?? null,
    emailsPerMonth: report.emailsPerMonth,
    volumeSource: report.volumeSource,
    recommendedPlan: report.comparison.cheapestPlan,
    annualSavings: report.comparison.annualSavings ?? null,
    comparison: report.comparison.rows.map((row) => ({
      ...row,
      per1K: SES_PLAN_RATES[row.plan].tiers[0].per1K,
    })),
    lowVolumeProjection: report.lowVolumeProjection,
  };
}

/**
 * Read-only default path: report the current SES pricing plan (and cheaper
 * alternatives) for every tracked Region. Never mutates.
 */
async function runReadPath(
  options: EmailPlanOptions,
  accountId: string,
  progress: DeploymentProgress,
  startTime: number
): Promise<void> {
  const regions = options.region
    ? [options.region]
    : await resolveTrackedRegions(accountId);
  const resolvedRegions = regions.length > 0 ? regions : [await getAWSRegion()];

  const reports = await progress.execute("Checking SES pricing plan", () =>
    Promise.all(
      resolvedRegions.map((region) => buildRegionReport(region, options))
    )
  );

  progress.stop();

  if (isJsonMode()) {
    jsonSuccess("email.plan", {
      mode: "read",
      regions: reports.map(regionReportToJson),
    });
  } else {
    for (const report of reports) {
      printRegionReport(report);
    }
    console.log("");
  }

  trackCommand("email:plan", {
    success: true,
    mode: "read",
    region_count: reports.length,
    duration_ms: Date.now() - startTime,
  });

  // showFooterOnce() prints unconditionally — never call it in JSON mode, or
  // the promotional footer interleaves with the parseable envelope.
  if (!isJsonMode()) {
    getTelemetryClient().showFooterOnce();
  }
}

/**
 * Resolve exactly one Region for `--set`. Never guesses at a Region for a
 * mutation that changes billing — see the table in plan 129 step 5.
 *
 * Exported so `wraps email vdm` (plan 373) can reuse the same Region
 * resolution for its own account-wide mutation. It only reads
 * `options.region`, so the parameter is narrowed to that rather than the
 * full `EmailPlanOptions`.
 */
export async function resolveSetRegion(
  options: { region?: string },
  accountId: string
): Promise<string> {
  if (options.region) {
    return options.region;
  }

  const regions = await resolveTrackedRegions(accountId);

  if (regions.length === 1) {
    return regions[0];
  }

  if (regions.length > 1 && isInteractive()) {
    const selected = await clack.select({
      message: "Multiple Regions configured. Which Region?",
      options: regions.map((region) => ({ value: region, label: region })),
    });

    if (clack.isCancel(selected)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    return selected as string;
  }

  // Zero tracked Regions, or multiple Regions with no way to prompt. Never
  // pick one for the user — this call changes billing.
  throw new WrapsError(
    regions.length > 1
      ? "Multiple Regions configured — pass --region <r>."
      : "Could not determine which Region to change — pass --region <r>.",
    "REGION_REQUIRED_FOR_SET",
    regions.length > 0
      ? `Configured Regions: ${regions.join(", ")}`
      : "Pass --region <r> with the Region you want to change.",
    "https://wraps.dev/docs/cli-reference"
  );
}

/**
 * Mutating `--set` path: validate, price the change, confirm, apply, and
 * re-read to confirm the result. Never mutates without an explicit `--set`
 * plus either an interactive confirmation or `--yes`.
 */
async function runSetPath(
  options: EmailPlanOptions,
  accountId: string,
  startTime: number
): Promise<void> {
  if (!options.set) {
    // Unreachable via emailPlan's dispatch (it only calls runSetPath when
    // options.set is truthy), but keeps this function honest if called
    // directly.
    throw new WrapsError(
      "No pricing plan specified.",
      "INVALID_SES_PRICING_PLAN",
      `Pass --set with one of: ${SES_PRICING_PLANS.join(", ")}`,
      "https://wraps.dev/docs/cli-reference"
    );
  }

  const requestedPlanRaw = options.set;

  if (!isSESPricingPlan(requestedPlanRaw)) {
    throw new WrapsError(
      `Invalid pricing plan: ${requestedPlanRaw}`,
      "INVALID_SES_PRICING_PLAN",
      `Valid values: ${SES_PRICING_PLANS.join(", ")}`,
      "https://wraps.dev/docs/cli-reference"
    );
  }

  const requestedPlan = requestedPlanRaw;

  const region = await resolveSetRegion(options, accountId);
  const before = await getSESAccountStatus(region);
  const { emailsPerMonth } = resolveVolume(
    options,
    before.sendQuota?.sentLast24Hours
  );
  const comparison = planComparison(emailsPerMonth, before.currentPlan);
  const beforeRow = before.currentPlan
    ? comparison.rows.find((r) => r.plan === before.currentPlan)
    : undefined;
  const afterRow = comparison.rows.find((r) => r.plan === requestedPlan);

  if (!isJsonMode()) {
    console.log(`\n${pc.bold(region)}`);
    console.log(
      `  Current plan: ${beforeRow ? beforeRow.label : pc.yellow("unknown")} (${beforeRow ? formatUSD(beforeRow.monthlyCost) : "—"}/mo at ${emailsPerMonth.toLocaleString("en-US")}/mo estimated volume)`
    );
    console.log(
      `  New plan:     ${afterRow?.label ?? requestedPlan} (${afterRow ? formatUSD(afterRow.monthlyCost) : "—"}/mo)`
    );
  }

  if (!options.yes) {
    if (!isInteractive()) {
      throw new WrapsError(
        "Confirmation required to change your SES pricing plan.",
        "CONFIRMATION_REQUIRED",
        "Pass --yes to skip the confirmation prompt (required in non-interactive environments).",
        "https://wraps.dev/docs/cli-reference"
      );
    }

    const confirmed = await clack.confirm({
      message: `Change the SES pricing plan for account ${accountId} in ${region} to ${afterRow?.label ?? requestedPlan}?`,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  const progress = new DeploymentProgress();
  await progress.execute("Updating SES pricing plan", () =>
    setSESPricingPlan(region, requestedPlan)
  );

  // Never claim success from the Put response alone — re-read the account.
  const after = await getSESAccountStatus(region);

  if (isJsonMode()) {
    jsonSuccess("email.plan", {
      mode: "set",
      region,
      requestedPlan,
      before: {
        currentPlan: before.currentPlan ?? null,
        nextPlan: before.nextPlan ?? null,
      },
      after: {
        currentPlan: after.currentPlan ?? null,
        nextPlan: after.nextPlan ?? null,
      },
    });
  } else {
    clack.log.success(
      `SES pricing plan updated. Current plan is now ${pc.cyan(after.currentPlan ?? "unknown")}${
        after.nextPlan && after.nextPlan !== after.currentPlan
          ? `, pending change to ${pc.yellow(after.nextPlan)} next billing cycle`
          : ""
      }.`
    );
    clack.outro(pc.green("Done!"));
  }

  trackCommand("email:plan", {
    success: true,
    mode: "set",
    region,
    requested_plan: requestedPlan,
    duration_ms: Date.now() - startTime,
  });
}

/**
 * `wraps email plan` — detect the account's SES pricing plan, price every
 * option against real (or estimated) volume, and (with `--set`) offer the
 * fix. Read-only by default; `--set` is the only mutating path and always
 * requires a confirmation or `--yes`.
 */
export async function emailPlan(options: EmailPlanOptions): Promise<void> {
  const startTime = Date.now();

  if (!isJsonMode()) {
    clack.intro(pc.bold("Wraps Email — SES Pricing Plan"));
  }

  const progress = new DeploymentProgress();
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  if (options.set) {
    progress.stop();
    await runSetPath(options, identity.accountId, startTime);
    return;
  }

  await runReadPath(options, identity.accountId, progress, startTime);
}
