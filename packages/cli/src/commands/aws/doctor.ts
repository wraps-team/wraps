/**
 * AWS Doctor - Diagnose AWS setup issues
 *
 * @module commands/aws/doctor
 */

import * as clack from "@clack/prompts";
import pc from "picocolors";
import { trackCommand } from "../../telemetry/events.js";
import { isSESSandbox } from "../../utils/shared/aws.js";
import {
  type AWSSetupState,
  detectAWSState,
  formatSSOProfile,
  getConfiguredProfiles,
  getSSOLoginCommand,
  hasConfigFile,
  hasCredentialsFile,
} from "../../utils/shared/aws-detection.js";
import {
  collectRemediations,
  type DoctorFinding,
  formatRemediation,
  remediations,
} from "../../utils/shared/doctor-remediation.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";

const CATEGORY = "AWS Setup";

/**
 * Run all diagnostic checks
 */
async function runDiagnostics(state: AWSSetupState): Promise<DoctorFinding[]> {
  const results: DoctorFinding[] = [];

  // Check AWS CLI
  if (state.cliInstalled) {
    results.push({
      status: "pass",
      category: CATEGORY,
      name: `AWS CLI v${state.cliVersion} installed`,
    });
  } else {
    results.push({
      status: "fail",
      category: CATEGORY,
      name: "AWS CLI not installed",
      details:
        "Install: brew install awscli (macOS) or https://aws.amazon.com/cli/",
      remediation: remediations.installAwsCli(),
    });
  }

  // Check credentials file
  if (hasCredentialsFile()) {
    results.push({
      status: "pass",
      category: CATEGORY,
      name: "Credentials file exists (~/.aws/credentials)",
    });
  } else if (
    state.credentialSource === "environment" ||
    state.credentialSource === "sso"
  ) {
    results.push({
      status: "info",
      category: CATEGORY,
      name: `Using ${state.credentialSource} credentials (no file needed)`,
    });
  } else {
    results.push({
      status: "warn",
      category: CATEGORY,
      name: "No credentials file (~/.aws/credentials)",
      details: "Run: aws configure",
      remediation: remediations.configureAwsCredentials(),
    });
  }

  // Check config file
  if (hasConfigFile()) {
    results.push({
      status: "pass",
      category: CATEGORY,
      name: "Config file exists (~/.aws/config)",
    });
  } else {
    results.push({
      status: "info",
      category: CATEGORY,
      name: "No config file (~/.aws/config)",
      details: "Optional: stores default region and output format",
    });
  }

  // === SSO-specific diagnostics ===
  if (state.sso.configured) {
    results.push({
      status: "pass",
      category: CATEGORY,
      name: `SSO configured (${state.sso.profiles.length} profile${state.sso.profiles.length > 1 ? "s" : ""})`,
      details: state.sso.profiles.map((p) => p.name).join(", "),
    });

    // A suggestion, not a finding, until now — but the CLI genuinely cannot
    // tell which profile was meant, so nothing it does will use the right one.
    // Hanging this off the pass row above would filter it out of the remedy
    // set, which only collects fail/warn findings.
    if (state.sso.profiles.length > 1 && !state.sso.activeProfile) {
      results.push({
        status: "warn",
        category: CATEGORY,
        name: `${state.sso.profiles.length} SSO profiles configured, none active`,
        details: state.sso.profiles.map((p) => p.name).join(", "),
        remediation: remediations.setAwsProfile(
          state.sso.profiles.map((p) => p.name)
        ),
      });
    }

    // Show SSO sessions if any
    if (state.sso.sessions.length > 0) {
      results.push({
        status: "info",
        category: CATEGORY,
        name: `SSO sessions: ${state.sso.sessions.map((s) => s.name).join(", ")}`,
      });
    }

    // Check if we're using an SSO profile
    if (state.sso.activeProfile) {
      results.push({
        status: "pass",
        category: CATEGORY,
        name: `Active SSO profile: ${formatSSOProfile(state.sso.activeProfile)}`,
      });
    } else if (state.credentialSource === "sso") {
      // Using SSO but not a named profile
      results.push({
        status: "info",
        category: CATEGORY,
        name: "Using SSO credentials",
      });
    }

    // Check SSO token status
    if (state.sso.tokenStatus) {
      if (state.sso.tokenStatus.valid) {
        const minutes = state.sso.tokenStatus.minutesRemaining || 0;
        if (minutes > 60) {
          const hours = Math.floor(minutes / 60);
          results.push({
            status: "pass",
            category: CATEGORY,
            name: `SSO session valid (${hours}h ${minutes % 60}m remaining)`,
          });
        } else if (minutes > 15) {
          results.push({
            status: "pass",
            category: CATEGORY,
            name: `SSO session valid (${minutes}m remaining)`,
          });
        } else if (minutes > 0) {
          results.push({
            status: "warn",
            category: CATEGORY,
            name: `SSO session expiring soon (${minutes}m remaining)`,
            details: getSSOLoginCommand(state.sso.activeProfile?.name),
            remediation: remediations.ssoLogin(
              getSSOLoginCommand(state.sso.activeProfile?.name)
            ),
          });
        }
      } else if (state.sso.tokenStatus.expired) {
        results.push({
          status: "fail",
          category: CATEGORY,
          name: "SSO session expired",
          details: `Run: ${getSSOLoginCommand(state.sso.activeProfile?.name)}`,
          remediation: remediations.ssoLogin(
            getSSOLoginCommand(state.sso.activeProfile?.name)
          ),
        });
      }
    }
  }

  // Check credentials are working
  if (state.credentialsConfigured) {
    results.push({
      status: "pass",
      category: CATEGORY,
      name: `Can connect to AWS (account: ${state.accountId})`,
    });

    // Check credential source (if not already shown for SSO)
    if (!state.sso.configured) {
      if (state.credentialSource === "environment") {
        results.push({
          status: "pass",
          category: CATEGORY,
          name: "Using environment variable credentials",
        });
      } else if (state.credentialSource === "profile") {
        const profileName = state.profileName || "default";
        results.push({
          status: "pass",
          category: CATEGORY,
          name: `Using profile: ${profileName}`,
        });
      }
    }
  } else {
    // Not authenticated
    if (state.sso.configured && state.sso.tokenStatus?.expired) {
      results.push({
        status: "fail",
        category: CATEGORY,
        name: "Cannot connect to AWS (SSO session expired)",
        details: `Run: ${getSSOLoginCommand(state.sso.activeProfile?.name)}`,
        remediation: remediations.ssoLogin(
          getSSOLoginCommand(state.sso.activeProfile?.name)
        ),
      });
    } else if (state.sso.configured) {
      results.push({
        status: "fail",
        category: CATEGORY,
        name: "Cannot connect to AWS (SSO login required)",
        details: `Run: ${getSSOLoginCommand(state.sso.activeProfile?.name || state.sso.profiles[0]?.name)}`,
        remediation: remediations.ssoLogin(
          getSSOLoginCommand(
            state.sso.activeProfile?.name || state.sso.profiles[0]?.name
          )
        ),
      });
    } else {
      results.push({
        status: "fail",
        category: CATEGORY,
        name: "Cannot connect to AWS",
        details: "No working credentials were found",
        remediation: remediations.configureAwsCredentials(),
      });
    }
    return results; // Can't do more checks without credentials
  }

  // Check region
  if (state.region) {
    results.push({
      status: "pass",
      category: CATEGORY,
      name: `Region set: ${state.region}`,
    });
  } else {
    results.push({
      status: "warn",
      category: CATEGORY,
      name: "Region not set",
      details: "Will default to us-east-1. Set AWS_REGION for faster commands.",
      remediation: remediations.setAwsRegion(),
    });
  }

  // Check profiles (non-SSO)
  if (!state.sso.configured) {
    const profiles = getConfiguredProfiles();
    if (profiles.length > 1) {
      results.push({
        status: "info",
        category: CATEGORY,
        name: `${profiles.length} profiles configured`,
        details: profiles.join(", "),
      });
    }
  }

  // Check SES sandbox status if we have credentials. Doctor is explicitly the
  // diagnostic command, so we DO run the check with a default region when
  // none is set — but we annotate the result with the region used so the
  // user can see whether that matches their intended deployment.
  if (state.credentialsConfigured) {
    const regionUsed = state.region || "us-east-1";
    const regionNote = state.region
      ? `Region: ${regionUsed}`
      : `No AWS_REGION set — defaulted to ${regionUsed}. Set AWS_REGION if your deployment lives elsewhere.`;
    try {
      const sandbox = await isSESSandbox(regionUsed);
      if (sandbox) {
        results.push({
          status: "warn",
          category: CATEGORY,
          name: "SES is in sandbox mode",
          details: `You can only send to verified emails. Request production access in AWS console.\n${regionNote}`,
          remediation: remediations.requestSesProductionAccess(),
        });
      } else {
        results.push({
          status: "pass",
          category: CATEGORY,
          name: "SES has production access",
          details: regionNote,
        });
      }
      // baseline:allow-next-line no-swallowed-errors — SES check is non-blocking diagnostic
    } catch {
      results.push({
        status: "info",
        category: CATEGORY,
        name: "Could not check SES status",
        details: `SES may not be enabled in this region.\n${regionNote}`,
      });
    }
  }

  // Check for common misconfigurations
  if (process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_SECRET_ACCESS_KEY) {
    results.push({
      status: "fail",
      category: CATEGORY,
      name: "AWS_ACCESS_KEY_ID set but AWS_SECRET_ACCESS_KEY missing",
      details: "Both environment variables are required",
      remediation: remediations.awsEnvVarsIncomplete(),
    });
  }

  if (process.env.AWS_SECRET_ACCESS_KEY && !process.env.AWS_ACCESS_KEY_ID) {
    results.push({
      status: "fail",
      category: CATEGORY,
      name: "AWS_SECRET_ACCESS_KEY set but AWS_ACCESS_KEY_ID missing",
      details: "Both environment variables are required",
      remediation: remediations.awsEnvVarsIncomplete(),
    });
  }

  return results;
}

/**
 * Display diagnostic results
 */
function displayResults(results: DoctorFinding[]): void {
  console.log();

  for (const result of results) {
    let icon: string;
    let color: (s: string) => string;

    switch (result.status) {
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

    console.log(`  ${color(`[${icon}]`)} ${result.name}`);
    if (result.details) {
      console.log(`      ${pc.dim(result.details)}`);
    }
    if (result.remediation?.command) {
      console.log(
        `      ${pc.dim("fix:")} ${pc.cyan(result.remediation.command)}`
      );
    }
  }

  console.log();
}

/**
 * Suggestions are now derived from the remediations the findings carry, not by
 * grepping this file's own copy. Renaming a finding can no longer silently
 * delete its suggestion.
 */
function suggestionsFor(results: DoctorFinding[]): string[] {
  return collectRemediations(
    results.filter((r) => r.status === "fail" || r.status === "warn")
  ).map(formatRemediation);
}

/**
 * The AWS findings with no rendering — for `wraps doctor`. Returns the state
 * too, because the aggregate needs `credentialsConfigured` before deciding
 * whether the email leg can run at all.
 */
export async function collectAwsFindings(): Promise<{
  findings: DoctorFinding[];
  state: AWSSetupState;
}> {
  const state = await detectAWSState();
  return { findings: await runDiagnostics(state), state };
}

/**
 * AWS Doctor command entry point
 */
export async function doctor(): Promise<void> {
  const startTime = Date.now();

  if (!isJsonMode()) {
    clack.intro(pc.bold("AWS Setup Diagnostics"));
  }

  const spinner = isJsonMode() ? null : clack.spinner();
  spinner?.start("Running diagnostics...");

  const { findings: results } = await collectAwsFindings();

  spinner?.stop("Diagnostics complete");

  // Summary counts
  const failCount = results.filter((r) => r.status === "fail").length;
  const warnCount = results.filter((r) => r.status === "warn").length;
  const passCount = results.filter((r) => r.status === "pass").length;

  if (isJsonMode()) {
    jsonSuccess("aws.doctor", {
      checks: results.map((r) => ({
        name: r.name,
        status: r.status,
        ...(r.details ? { details: r.details } : {}),
        ...(r.remediation ? { remediation: r.remediation } : {}),
      })),
      summary: { pass: passCount, warn: warnCount, fail: failCount },
      suggestions: suggestionsFor(results),
    });
    return;
  }

  displayResults(results);

  if (failCount > 0) {
    clack.log.error(`${failCount} issue${failCount > 1 ? "s" : ""} found`);
  } else if (warnCount > 0) {
    clack.log.warn(
      `${passCount} checks passed, ${warnCount} warning${warnCount > 1 ? "s" : ""}`
    );
  } else {
    clack.log.success("All checks passed!");
  }

  // Suggestions
  const suggestions = suggestionsFor(results);
  if (suggestions.length > 0) {
    console.log();
    clack.log.info(pc.bold("Suggestions:"));
    for (const suggestion of suggestions) {
      console.log(`  ${pc.dim("-")} ${suggestion}`);
    }
  }

  trackCommand("aws:doctor", {
    success: true,
    duration_ms: Date.now() - startTime,
    pass_count: passCount,
    fail_count: failCount,
    warn_count: warnCount,
  });

  console.log();
  clack.outro(
    pc.dim(failCount > 0 ? "See suggested fixes above" : "Ready to deploy")
  );
}
