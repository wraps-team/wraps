import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `@wraps.dev/email` exposes email.suppression.get/add/remove/list(), and the
// suppression-lists guide on wraps.dev documents all four with a code sample.
// Of the four ways Wraps infrastructure can be deployed, only the CLI path
// ever granted the identity permission to call them — the CDK construct, the
// Pulumi provider, and the published CloudFormation template all configure
// SES to auto-suppress bounces and complaints, and then never granted the
// application permission to read or manage the list that fills up. Every one
// of those calls returned AccessDeniedException.
//
// Nothing compared the four policy sources to each other, which is exactly
// why one of them (the CLI) could grow a permission the other three never
// got. This file is that comparison. It does not check that the grant is
// correct in isolation — only that all four sources agree.
const repoRoot = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repoRoot), "utf-8");

const SUPPRESSION_ACTIONS = [
  "ses:ListSuppressedDestinations",
  "ses:GetSuppressedDestination",
  "ses:PutSuppressedDestination",
  "ses:DeleteSuppressedDestination",
] as const;

// The CLI path is included even though this plan did not change it: it is
// the path that had the permissions all along, and the point of this test is
// to keep all four sources together, not to check anyone's edits.
const POLICY_SOURCES = [
  "packages/cli/src/infrastructure/resources/iam.ts",
  "packages/pulumi/src/resources/iam.ts",
  "packages/cdk/src/email.ts",
] as const;

describe("SES suppression IAM parity across all four deployment paths", () => {
  for (const path of POLICY_SOURCES) {
    it(`grants all four suppression actions in ${path}`, () => {
      const source = read(path);
      for (const action of SUPPRESSION_ACTIONS) {
        expect(source, `${path} is missing ${action}`).toContain(action);
      }
    });
  }

  it("grants all four suppression actions in the CloudFormation template, once per sending role", () => {
    // WrapsEmailRoleVercel and WrapsEmailRoleStandard each carry their own
    // copy of the inline policy. A future edit that touches only one role
    // reproduces the bug for half of all CloudFormation deployments, so each
    // action must appear exactly twice — not "at least once". The console
    // role is excluded here and asserted separately below: it is a different
    // policy with a different rule about Put.
    const { sendingRoles } = splitInfrastructureTemplate();
    for (const action of SUPPRESSION_ACTIONS) {
      const occurrences = sendingRoles.split(action).length - 1;
      expect(
        occurrences,
        `cloudformation/wraps-email-infrastructure.yaml should grant ${action} to both sending roles (found ${occurrences} occurrence(s))`
      ).toBe(2);
    }
  });

  // The console role reads and clears the suppression list for the dashboard's
  // suppressions page; it never writes to it. It is also a fifth policy source
  // that drifted behind the other four — an account deployed from the
  // infrastructure template had a console role with no suppression access at
  // all, which probes as a stale console-policy version and puts the account
  // permanently in the "your AWS role is behind the current Wraps policy"
  // alert with no repair that clears it.
  it("grants the console role read and clear, but never Put", () => {
    const { consoleRole } = splitInfrastructureTemplate();
    for (const action of [
      "ses:ListSuppressedDestinations",
      "ses:GetSuppressedDestination",
      "ses:DeleteSuppressedDestination",
    ]) {
      expect(
        consoleRole,
        `WrapsConsoleAccessRole is missing ${action}`
      ).toContain(action);
    }
    expect(consoleRole).not.toContain("ses:PutSuppressedDestination");
  });
});

/**
 * Splits the infrastructure template into the console-access role and
 * everything else, so counts of an action in the two sending roles are not
 * thrown off by the console role carrying the same action for its own reasons.
 */
function splitInfrastructureTemplate() {
  const template = read("cloudformation/wraps-email-infrastructure.yaml");
  const start = template.indexOf("  WrapsConsoleAccessRole:");
  const end = template.indexOf("\nOutputs:");
  if (start === -1 || end <= start) {
    throw new Error(
      "cloudformation/wraps-email-infrastructure.yaml no longer has a WrapsConsoleAccessRole followed by an Outputs section"
    );
  }

  return {
    consoleRole: template.slice(start, end),
    sendingRoles: template.slice(0, start) + template.slice(end),
  };
}
