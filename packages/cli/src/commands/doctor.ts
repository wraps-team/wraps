/**
 * `wraps doctor` — the aggregate front door.
 *
 * The incident that motivated it: the most natural thing to type was the one
 * thing that did not exist, so a user with one defect ran five commands and
 * was misdirected by three of them. This command runs the AWS setup checks and
 * the email infrastructure checks in one pass and surfaces the remedy each
 * finding actually carries.
 *
 * @module commands/doctor
 */

import * as clack from "@clack/prompts";
import pc from "picocolors";
import { trackCommand } from "../telemetry/events.js";
import { getAWSRegion } from "../utils/shared/aws.js";
import {
  collectRemediations,
  type DoctorFinding,
  remediations,
} from "../utils/shared/doctor-remediation.js";
import { isJsonMode, jsonSuccess } from "../utils/shared/json-output.js";
import { findConnectionsWithService } from "../utils/shared/metadata.js";
import { DeploymentProgress } from "../utils/shared/output.js";
import { collectAwsFindings } from "./aws/doctor.js";
import { collectEmailFindings } from "./email/doctor.js";

export type WrapsDoctorOptions = { region?: string; json?: boolean };

/**
 * Rows, grouped by category in first-seen order. Layout is byte-for-byte the
 * one `wraps email doctor` uses — two spaces for the row, six for its detail.
 */
function displayFindings(findings: DoctorFinding[]): void {
  console.log();

  const byCategory = new Map<string, DoctorFinding[]>();
  for (const finding of findings) {
    const group = byCategory.get(finding.category);
    if (group) {
      group.push(finding);
    } else {
      byCategory.set(finding.category, [finding]);
    }
  }

  for (const finding of [...byCategory.values()].flat()) {
    let icon: string;
    let color: (s: string) => string;

    switch (finding.status) {
      case "pass":
        icon = "✓";
        color = pc.green;
        break;
      case "warn":
        icon = "!";
        color = pc.yellow;
        break;
      case "fail":
        icon = "✗";
        color = pc.red;
        break;
      case "info":
        icon = "i";
        color = pc.blue;
        break;
    }

    console.log(
      `  ${color(`[${icon}]`)} ${pc.dim(finding.category)}: ${finding.name}`
    );
    if (finding.details) {
      console.log(`      ${pc.dim(finding.details)}`);
    }
    if (finding.remediation?.command) {
      console.log(
        `      ${pc.dim("fix:")} ${pc.cyan(finding.remediation.command)}`
      );
    }
  }

  console.log();
}

/**
 * The remedy block. A copy of the one in `wraps email doctor`, deliberately:
 * that one is file-private, and this command's test replaces the whole module
 * with a one-key mock, so an import would be undefined at test time.
 */
function displayRemediations(findings: DoctorFinding[]): void {
  const actionable = collectRemediations(
    findings.filter((f) => f.status === "fail" || f.status === "warn")
  );
  if (actionable.length === 0) {
    return;
  }

  console.log();
  console.log(`  ${pc.bold("Suggested fixes:")}`);
  for (const remediation of actionable) {
    if (remediation.command) {
      console.log(
        `  ${pc.dim("-")} ${pc.cyan(remediation.command)}\n      ${pc.dim(remediation.summary)}`
      );
    } else {
      console.log(`  ${pc.dim("-")} ${pc.dim(remediation.summary)}`);
    }
  }
  console.log();
}

export async function wrapsDoctor(options: WrapsDoctorOptions): Promise<void> {
  const startTime = Date.now();

  if (!isJsonMode()) {
    clack.intro(pc.bold("Wraps Doctor"));
  }

  const progress = new DeploymentProgress();

  // AWS first and unconditionally: detectAWSState() reports missing
  // credentials as findings rather than throwing, so a broken-credentials
  // account still gets a report instead of a stack trace.
  const { findings: awsFindings, state } = await progress.execute(
    "Checking AWS setup",
    async () => collectAwsFindings()
  );

  const findings: DoctorFinding[] = [...awsFindings];

  const emailConnections =
    state.credentialsConfigured && state.accountId
      ? await findConnectionsWithService(state.accountId, "email")
      : [];

  // Region resolution mirrors `wraps email doctor` on purpose: getAWSRegion()
  // falls back to a hardcoded default, so an email stack deployed outside that
  // default would be scanned in the wrong region and reported clean — the
  // exact misdirection this command exists to remove. The one deliberate
  // difference: the aggregate never prompts.
  const regionExplicit = Boolean(
    options.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
  );
  let region = options.region || (await getAWSRegion());
  if (!regionExplicit && emailConnections.length > 0) {
    // Any deployment region beats the fallback, including when there are
    // several: scanning the hardcoded default finds no wraps-* resources and
    // no connection for it, so the event-pipeline check never runs and every
    // real deployment is reported clean.
    region = emailConnections[0].region;
  }

  if (state.credentialsConfigured && state.accountId) {
    if (!regionExplicit && emailConnections.length > 1) {
      // `wraps email doctor` asks. An aggregate front door that may be run
      // under --json must not block on a prompt, so it reports which region it
      // picked and names the rest.
      findings.push({
        status: "info",
        category: "Email",
        name: `Multiple email deployments — checked ${region} only`,
        details: `Also deployed in: ${emailConnections
          .map((c) => c.region)
          .filter((r) => r !== region)
          .join(", ")}. Re-run with --region to check another.`,
      });
    }

    try {
      const email = await progress.execute(
        "Checking email infrastructure",
        async () =>
          collectEmailFindings({
            region,
            accountId: state.accountId as string,
            connections: emailConnections,
          })
      );
      findings.push(...email.findings);
    } catch (error) {
      findings.push({
        status: "warn",
        category: "Email",
        name: "Email checks did not run",
        details: error instanceof Error ? error.message : String(error),
        remediation: remediations.reviewPermissions(),
      });
    }
  }

  progress.stop();

  const failCount = findings.filter((f) => f.status === "fail").length;
  const warnCount = findings.filter((f) => f.status === "warn").length;
  const passCount = findings.filter((f) => f.status === "pass").length;

  // `process.exitCode`, not `process.exit`, so cli.ts's finally block still
  // flushes telemetry.
  if (failCount > 0) {
    process.exitCode = 1;
  }

  // One event on both paths, so it sits above the JSON early return. Ids only
  // — a remediation's command can embed a customer domain.
  trackCommand("doctor", {
    success: true,
    duration_ms: Date.now() - startTime,
    region,
    fail_count: failCount,
    warn_count: warnCount,
    pass_count: passCount,
    // Set: remedies are deduped by id AND command, so two parameterisations
    // of one remedy are two entries under one id.
    remediation_ids: [
      ...new Set(collectRemediations(findings).map((r) => r.id)),
    ]
      .sort()
      .join(","),
  });

  if (isJsonMode()) {
    jsonSuccess("doctor", {
      region,
      accountId: state.accountId,
      findings,
      summary: { pass: passCount, warn: warnCount, fail: failCount },
      remediations: collectRemediations(findings),
    });
    return;
  }

  displayFindings(findings);
  displayRemediations(findings);

  if (failCount > 0) {
    clack.log.error(`${failCount} issue(s) found`);
  } else if (warnCount > 0) {
    clack.log.warn(`${warnCount} warning(s)`);
  } else {
    clack.log.success(`All ${passCount} check(s) passed`);
  }

  clack.outro(pc.dim("Diagnostics complete"));
}
