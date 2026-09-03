/**
 * The remediation registry is the contract every doctor surface reads from:
 * a finding's remedy is a value produced with the finding, not a hand-written
 * sentence guessing at it. These tests pin the spellings later chunks depend
 * on, plus the one behaviour this module owns end to end — collecting the
 * distinct remedies out of a report.
 */

import { describe, expect, it } from "vitest";
import type { DoctorFinding } from "../doctor-remediation.js";
import {
  collectRemediations,
  formatRemediation,
  remediations,
} from "../doctor-remediation.js";

describe("remediations", () => {
  it("repairs a Pulumi-owned resource by syncing the stack, automatically", () => {
    const remediation = remediations.syncStack();

    expect(remediation.command).toBe("wraps email sync");
    expect(remediation.level).toBe("auto");
  });

  it("targets the region the doctor scanned, so the pasted command does not fall back to us-east-1", () => {
    // Every repair command re-resolves its own region and ends at a hardcoded
    // "us-east-1". A doctor that deliberately scanned eu-west-1 and then
    // printed a bare command sent the user to a region with no connection
    // metadata, where the command exits 1 without touching the real stack.
    expect(remediations.syncStack("eu-west-1").command).toBe(
      "wraps email sync --region eu-west-1"
    );
    expect(remediations.cleanupOrphans("eu-west-1").command).toBe(
      "wraps email doctor --cleanup --region eu-west-1"
    );
    expect(remediations.reAddDomain("acme.com", "eu-west-1").command).toBe(
      "wraps email domains add --domain acme.com --region eu-west-1"
    );
    expect(remediations.migratePerDomainConfigSets("eu-west-1").command).toBe(
      "wraps email upgrade --action per-domain-config-sets --region eu-west-1"
    );

    // The region is a command-line argument, never part of the telemetry key.
    expect(remediations.syncStack("eu-west-1").id).toBe(
      remediations.syncStack().id
    );
  });

  it("names the domain in the command to re-run, but keeps it out of the telemetry-safe id", () => {
    const remediation = remediations.reAddDomain("acme.com");

    expect(remediation.command).toBe(
      "wraps email domains add --domain acme.com"
    );
    expect(remediation.id).not.toContain("acme.com");
  });

  it("offers no command for a metadata divergence, because every redeploy path rebuilds from the suspect metadata", () => {
    const remediation = remediations.metadataDivergence();

    expect(remediation.level).toBe("manual");
    expect(remediation.command).toBeUndefined();
  });

  it("points an unprovable Pulumi probe at wraps aws doctor, never at --cleanup", () => {
    const remediation = remediations.stackStateUnknown();

    expect(remediation.id).toBe("email.doctor.stack-state-unknown");
    expect(remediation.level).toBe("manual");
    // The command is what a user runs, and it is never the destructive sweep.
    expect(remediation.command).toBe("wraps aws doctor");
    expect(remediation.command).not.toContain("--cleanup");
  });

  it("names the owning CloudFormation stack, informationally, with no command", () => {
    const remediation = remediations.cloudFormationManaged(
      "wraps-email-infrastructure"
    );

    expect(remediation.id).toBe("email.doctor.cloudformation-managed");
    expect(remediation.level).toBe("informational");
    expect(remediation.command).toBeUndefined();
    expect(remediation.summary).toContain("wraps-email-infrastructure");
  });

  it("repairs a stale console role policy with platform update-role, targeting the scanned region", () => {
    expect(remediations.platformUpdateRole().command).toBe(
      "wraps platform update-role"
    );
    expect(remediations.platformUpdateRole("eu-west-1").command).toBe(
      "wraps platform update-role --region eu-west-1"
    );
    expect(remediations.platformUpdateRole().level).toBe("auto");
  });
});

describe("formatRemediation", () => {
  it("renders a command-less remediation as the summary alone, with no dangling separator", () => {
    const remediation = remediations.metadataDivergence();

    expect(formatRemediation(remediation)).toBe(remediation.summary);
  });

  it("prefixes the runnable command onto the summary", () => {
    const remediation = remediations.configureAwsCredentials();

    expect(formatRemediation(remediation)).toBe(
      `wraps aws setup — ${remediation.summary}`
    );
  });
});

describe("collectRemediations", () => {
  /**
   * A report repeats the same remedy across many rows — one missing stack
   * shows up as a failure on every hop it owns. The user should be told to run
   * `wraps email sync` once, not eight times.
   */
  const findings: DoctorFinding[] = [
    {
      status: "fail",
      category: "Event Pipeline",
      name: "SES config set",
      remediation: remediations.syncStack(),
    },
    {
      status: "fail",
      category: "Event Pipeline",
      name: "EventBridge rule",
      remediation: remediations.syncStack(),
    },
    { status: "pass", category: "Event Pipeline", name: "SQS queue" },
    {
      status: "fail",
      category: "Event Pipeline",
      name: "Lambda function",
      remediation: remediations.syncStack(),
    },
    {
      status: "warn",
      category: "Event Pipeline",
      name: "Rule targets",
      remediation: remediations.duplicateRuleTargets(),
    },
    {
      status: "fail",
      category: "Event Pipeline",
      name: "DynamoDB table",
      remediation: remediations.syncStack(),
    },
    { status: "info", category: "Event Pipeline", name: "Webhook leg" },
    {
      status: "warn",
      category: "Event Pipeline",
      name: "Dead letter queue",
      remediation: remediations.dlqBacklog(),
    },
    {
      status: "fail",
      category: "Event Pipeline",
      name: "Config set events",
      remediation: remediations.syncStack(),
    },
    {
      status: "warn",
      category: "Event Pipeline",
      name: "Extra rule target",
      remediation: remediations.duplicateRuleTargets(),
    },
    // Two additional domains, each with its own configuration set missing.
    // Same factory, same id, DIFFERENT commands — the case a fixture built
    // only from zero-argument factories cannot see.
    {
      status: "fail",
      category: "Event Pipeline",
      name: "SES config set (shop.acme.com)",
      remediation: remediations.reAddDomain("shop.acme.com"),
    },
    {
      status: "fail",
      category: "Event Pipeline",
      name: "SES config set (mail.acme.com)",
      remediation: remediations.reAddDomain("mail.acme.com"),
    },
  ];

  it("collapses a report down to each distinct remedy once, in first-seen order", () => {
    // Asserted on the command, not the id: ids are deliberately constant so
    // they stay telemetry-safe, so an id-only assertion cannot tell dedupe
    // from collapse.
    expect(
      collectRemediations(findings).map((r) => r.command ?? r.summary)
    ).toEqual([
      "wraps email sync",
      remediations.duplicateRuleTargets().summary,
      remediations.dlqBacklog().summary,
      "wraps email domains add --domain shop.acme.com",
      "wraps email domains add --domain mail.acme.com",
    ]);
  });

  it("keeps both domains when one id covers two different repair commands", () => {
    // A user with two additional domains was told to repair one of them and
    // never told about the other: the per-row `fix:` lines named both, the
    // Suggested-fixes block named the first only.
    const collected = collectRemediations([
      {
        status: "fail",
        category: "Event Pipeline",
        name: "SES config set (a.com)",
        remediation: remediations.reAddDomain("a.com"),
      },
      {
        status: "fail",
        category: "Event Pipeline",
        name: "SES config set (b.com)",
        remediation: remediations.reAddDomain("b.com"),
      },
    ]);

    expect(collected.map((r) => r.command)).toEqual([
      "wraps email domains add --domain a.com",
      "wraps email domains add --domain b.com",
    ]);
  });
});
