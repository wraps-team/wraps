import * as clack from "@clack/prompts";
import pc from "picocolors";
import { trackCommand } from "../../telemetry/events.js";
import type { EmailProductionAccessOptions } from "../../types/index.js";
import {
  getSESProductionAccessReview,
  requestSESProductionAccess,
  type SESProductionAccessReview,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { errors, WrapsError } from "../../utils/shared/errors.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import { findConnectionsWithService } from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";
import { isInteractive } from "../../utils/shared/prompts.js";

const REQUEST_PRODUCTION_ACCESS_DOCS_URL =
  "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html";

/** Resolve the unique set of Regions tracked for this account's email service. */
async function resolveTrackedRegions(accountId: string): Promise<string[]> {
  const connections = await findConnectionsWithService(accountId, "email");
  return [...new Set(connections.map((conn) => conn.region))];
}

/**
 * Resolve exactly one Region for `--request`. Never guesses at a Region for a
 * mutation that files a request with AWS under the customer's name.
 */
async function resolveRequestRegion(
  options: EmailProductionAccessOptions,
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
  // pick one for the user — this call files a request with AWS.
  throw new WrapsError(
    regions.length > 1
      ? "Multiple Regions configured — pass --region <r>."
      : "Could not determine which Region to request in — pass --region <r>.",
    "REGION_REQUIRED",
    regions.length > 0
      ? `Configured Regions: ${regions.join(", ")}`
      : "Pass --region <r> with the Region you want to request in.",
    "https://wraps.dev/docs/cli-reference"
  );
}

function consoleUrl(region: string): string {
  return `https://${region}.console.aws.amazon.com/ses/home?region=${region}#/account`;
}

function reviewStatusLabel(review: SESProductionAccessReview): string {
  if (!review.review) {
    return "none";
  }
  const { status, caseId } = review.review;
  return caseId ? `${status} (case ${caseId})` : status;
}

function nextActionFor(
  review: SESProductionAccessReview,
  region: string
): string {
  if (review.productionAccessEnabled) {
    return "Production access is enabled. Nothing to do.";
  }

  const status = review.review?.status;

  if (!status) {
    return `Run \`wraps email production-access --request …\` or use the console: ${consoleUrl(region)}`;
  }

  switch (status) {
    case "PENDING":
      return "AWS is reviewing; typically ~24h. Nothing to do.";
    case "DENIED": {
      // SES reports DENIED both for a final denial and while AWS waits on a
      // reply to its request for more information, and keeps reporting it
      // after the customer replies. The Support case is the only place that
      // tells the two apart, and reading it needs a paid Support plan.
      const caseId = review.review?.caseId;
      const where = caseId
        ? `case ${caseId} in the AWS Support Center`
        : "your cases in the AWS Support Center";
      return `AWS shows DENIED for a final denial and also while it waits on your reply to a request for more information. Check ${where}: if you've replied, wait for AWS. If the case is closed, strengthen the application (recipient provenance, unsubscribe handling, bounce/complaint monitoring) and resubmit with --request.`;
    }
    case "FAILED":
      return "AWS could not process the request; resubmit with --request.";
    default:
      return `Run \`wraps email production-access --request …\` or use the console: ${consoleUrl(region)}`;
  }
}

function printReadReport(review: SESProductionAccessReview, region: string) {
  console.log(`\n${pc.bold(region)}`);
  console.log(
    `  Production access: ${review.productionAccessEnabled ? pc.green("enabled") : pc.yellow("sandbox")}`
  );
  console.log(`  Review: ${reviewStatusLabel(review)}`);
  if (review.enforcementStatus) {
    console.log(`  Enforcement: ${review.enforcementStatus}`);
  }
  if (review.sendQuota) {
    console.log(
      `  Daily quota: ${review.sendQuota.sentLast24Hours}/${review.sendQuota.max24HourSend} (max rate ${review.sendQuota.maxSendRate}/s)`
    );
  }
  console.log(`\n  ${nextActionFor(review, region)}`);
}

/**
 * Read-only default path: report the account's SES production-access /
 * review state. Never mutates.
 */
async function runReadPath(
  options: EmailProductionAccessOptions,
  accountId: string,
  progress: DeploymentProgress,
  startTime: number
): Promise<void> {
  const region = await resolveRequestRegion(options, accountId);

  const review = await progress.execute(
    "Checking SES production-access status",
    () => getSESProductionAccessReview(region)
  );

  progress.stop();

  const nextAction = nextActionFor(review, region);

  if (isJsonMode()) {
    jsonSuccess("email.production-access", {
      mode: "read",
      region,
      productionAccessEnabled: review.productionAccessEnabled,
      review: review.review,
      enforcementStatus: review.enforcementStatus,
      sendQuota: review.sendQuota,
      nextAction,
      consoleUrl: consoleUrl(region),
    });
  } else {
    printReadReport(review, region);
    console.log("");
  }

  trackCommand("email:production-access", {
    success: true,
    mode: "read",
    region,
    review_status: review.review?.status ?? null,
    duration_ms: Date.now() - startTime,
  });
}

/** Validate `--website` (or the interactive answer): a full http(s) URL, AWS's 1-1000 char limit. */
function validateWebsiteUrl(value: string): void {
  if (!/^https?:\/\//.test(value) || value.length > 1000) {
    throw new WrapsError(
      `Invalid --website: ${value}`,
      "INVALID_WEBSITE_URL",
      "Pass a full URL starting with http:// or https://, up to 1000 characters.",
      REQUEST_PRODUCTION_ACCESS_DOCS_URL
    );
  }
}

/** Resolve and validate the website URL, prompting interactively when absent. */
async function resolveWebsiteUrl(
  options: EmailProductionAccessOptions
): Promise<string> {
  if (options.website) {
    validateWebsiteUrl(options.website);
    return options.website;
  }

  if (!isInteractive()) {
    throw errors.missingInput(
      "--website",
      "wraps email production-access --request --website https://example.com --mail-type transactional"
    );
  }

  const answer = await clack.text({
    message: "Your website URL (AWS requires this):",
    placeholder: "https://example.com",
    validate: (value) => {
      if (!value) {
        return "Website URL is required";
      }
      if (!/^https?:\/\//.test(value) || value.length > 1000) {
        return "Enter a full URL starting with http:// or https://";
      }
      return;
    },
  });

  if (clack.isCancel(answer)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  const website = answer as string;
  validateWebsiteUrl(website);
  return website;
}

/** Resolve and validate `--mail-type`, prompting interactively when absent. */
async function resolveMailType(
  options: EmailProductionAccessOptions
): Promise<"MARKETING" | "TRANSACTIONAL"> {
  if (options.mailType) {
    const lower = options.mailType.toLowerCase();
    if (lower === "transactional") {
      return "TRANSACTIONAL";
    }
    if (lower === "marketing") {
      return "MARKETING";
    }
    throw new WrapsError(
      `Invalid --mail-type: ${options.mailType}`,
      "INVALID_MAIL_TYPE",
      "Valid values: transactional, marketing",
      REQUEST_PRODUCTION_ACCESS_DOCS_URL
    );
  }

  if (!isInteractive()) {
    throw errors.missingInput(
      "--mail-type",
      "wraps email production-access --request --website https://example.com --mail-type transactional"
    );
  }

  const selected = await clack.select({
    message: "What type of email does this account send?",
    options: [
      {
        value: "transactional",
        label: "Transactional",
        hint: "receipts, password resets, alerts",
      },
      {
        value: "marketing",
        label: "Marketing",
        hint: "newsletters, promotions",
      },
    ],
  });

  if (clack.isCancel(selected)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return selected === "marketing" ? "MARKETING" : "TRANSACTIONAL";
}

/** Parse and validate `--contact` (comma-separated, max 4, basic email shape). Not prompted for. */
function resolveContactEmails(options: EmailProductionAccessOptions): string[] {
  if (!options.contact) {
    return [];
  }

  const emails = options.contact
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);

  if (emails.length > 4) {
    throw new WrapsError(
      `Too many contact emails: ${emails.length} (max 4)`,
      "INVALID_CONTACT_EMAIL",
      "Pass at most 4 comma-separated email addresses via --contact.",
      REQUEST_PRODUCTION_ACCESS_DOCS_URL
    );
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const email of emails) {
    if (!emailPattern.test(email)) {
      throw new WrapsError(
        `Invalid contact email: ${email}`,
        "INVALID_CONTACT_EMAIL",
        "Pass valid email addresses, comma-separated, via --contact.",
        REQUEST_PRODUCTION_ACCESS_DOCS_URL
      );
    }
  }

  return emails;
}

/**
 * Mutating `--request` path: guard against already-enabled/pending state,
 * collect the required inputs, disclose what the API call does and doesn't
 * carry, confirm, submit, and re-read to confirm the result. Never mutates
 * without an explicit `--request` plus either an interactive confirmation or
 * `--yes`.
 */
async function runRequestPath(
  options: EmailProductionAccessOptions,
  accountId: string,
  startTime: number
): Promise<void> {
  const region = await resolveRequestRegion(options, accountId);
  const before = await getSESProductionAccessReview(region);

  if (before.productionAccessEnabled === true) {
    throw new WrapsError(
      `Production access is already enabled for this account in ${region}.`,
      "PRODUCTION_ACCESS_ALREADY_ENABLED",
      "Nothing to do — run `wraps email production-access` to confirm.",
      REQUEST_PRODUCTION_ACCESS_DOCS_URL
    );
  }

  if (before.review?.status === "PENDING") {
    const caseId = before.review.caseId;
    throw new WrapsError(
      `A production access request is already under review for this account in ${region}${caseId ? ` (case ${caseId})` : ""}.`,
      "PRODUCTION_ACCESS_PENDING",
      "Wait for AWS to finish the current review before submitting another.",
      REQUEST_PRODUCTION_ACCESS_DOCS_URL
    );
  }

  const websiteUrl = await resolveWebsiteUrl(options);
  const mailType = await resolveMailType(options);
  const additionalContactEmails = resolveContactEmails(options);

  const openCaseId =
    before.review?.status === "DENIED" ? before.review.caseId : null;

  if (openCaseId && !isJsonMode()) {
    clack.log.warn(
      `AWS already has case ${openCaseId} on file for this account. AWS reports DENIED while it waits on your reply to a request for more information, so the case may still be open. If you've replied on it, wait for AWS instead of submitting a new request.`
    );
  }

  if (!isJsonMode()) {
    clack.note(
      `AWS reviews this request by hand, typically within 24 hours. The API sends less than the console form does: the console also asks you to confirm that every recipient opted in and that you handle bounces and complaints. There is no API field for that acknowledgment, so make sure both are true before you submit. If you would rather file the fuller application yourself: ${consoleUrl(region)}.`,
      "Before you submit"
    );

    clack.note(
      [
        `Account: ${accountId}`,
        `Region: ${region}`,
        `Mail type: ${mailType}`,
        `Website URL: ${websiteUrl}`,
        `Contact emails: ${additionalContactEmails.length > 0 ? additionalContactEmails.join(", ") : "none"}`,
      ].join("\n"),
      "What will be sent"
    );
  }

  if (!options.yes) {
    if (!isInteractive()) {
      throw new WrapsError(
        "Confirmation required to submit a production-access request.",
        "CONFIRMATION_REQUIRED",
        "Pass --yes to skip the confirmation prompt (required in non-interactive environments).",
        REQUEST_PRODUCTION_ACCESS_DOCS_URL
      );
    }

    const confirmed = await clack.confirm({
      message: openCaseId
        ? `Case ${openCaseId} may still be open. Submit a new SES production-access request for account ${accountId} in ${region} anyway?`
        : `Submit the SES production-access request for account ${accountId} in ${region}?`,
      initialValue: !openCaseId,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  const progress = new DeploymentProgress();
  await progress.execute("Submitting production-access request", () =>
    requestSESProductionAccess(region, {
      mailType,
      websiteUrl,
      additionalContactEmails,
    })
  );

  // Never claim success from the Put alone — re-read the account.
  const after = await getSESProductionAccessReview(region);

  if (isJsonMode()) {
    jsonSuccess("email.production-access", {
      mode: "request",
      region,
      submitted: { mailType, websiteUrl, additionalContactEmails },
      before: {
        productionAccessEnabled: before.productionAccessEnabled,
        reviewStatus: before.review?.status ?? null,
      },
      after: {
        productionAccessEnabled: after.productionAccessEnabled,
        reviewStatus: after.review?.status ?? null,
        caseId: after.review?.caseId ?? null,
      },
    });
  } else {
    const afterStatus = after.review?.status ?? "PENDING (not yet reported)";
    const afterCaseId = after.review?.caseId;
    clack.log.success(
      `Request submitted. AWS review status: ${afterStatus}${afterCaseId ? ` (case ${afterCaseId})` : ""}. Run wraps email production-access to check back.`
    );
    clack.outro(pc.green("Done!"));
  }

  trackCommand("email:production-access", {
    success: true,
    mode: "request",
    region,
    mail_type: mailType,
    contact_count: additionalContactEmails.length,
    duration_ms: Date.now() - startTime,
  });
}

/**
 * `wraps email production-access` — show the account's SES production-access
 * / review state and, with `--request`, file the request. Read-only by
 * default; `--request` is the only mutating path and always requires a
 * confirmation or `--yes`.
 */
export async function emailProductionAccess(
  options: EmailProductionAccessOptions
): Promise<void> {
  const startTime = Date.now();

  if (!isJsonMode()) {
    clack.intro(pc.bold("Wraps Email — SES Production Access"));
  }

  const progress = new DeploymentProgress();
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  if (options.request) {
    progress.stop();
    await runRequestPath(options, identity.accountId, startTime);
    return;
  }

  await runReadPath(options, identity.accountId, progress, startTime);
}
