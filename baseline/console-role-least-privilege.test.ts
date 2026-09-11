import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `wraps-console-access-role` is assumed by the Wraps platform account across
// an account boundary, into infrastructure the customer owns. Until
// 2026-09-11 all three of its sources granted it `events:PutEvents` on the
// customer's event bus and `sqs:ReceiveMessage` / `sqs:DeleteMessage` on their
// event queue — the ability to inject events and drain the pipeline — for no
// feature at all. Nothing that assumes this role touches either service: every
// SQSClient and EventBridgeClient in apps/api is constructed from
// `awsDefaults` (Wraps' own credentials), and apps/web constructs neither.
//
// The grants came back once already by being copied between sources on a
// parity argument, without anyone checking for a caller. This file is the
// check.
const repoRoot = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repoRoot), "utf-8");

/** Services the console role has no caller for. */
const UNUSED_SERVICE_PREFIXES = ["sqs:", "events:"] as const;

/**
 * The infrastructure template's other two roles — WrapsEmailRoleVercel and
 * WrapsEmailRoleStandard — are the customer's own sending identity and do
 * legitimately carry EventBridge and SQS grants, so only the console role's
 * slice can be asserted on.
 */
function consoleRoleFromInfrastructureTemplate() {
  const template = read("cloudformation/wraps-email-infrastructure.yaml");
  const start = template.indexOf("  WrapsConsoleAccessRole:");
  const end = template.indexOf("\nOutputs:");

  if (start === -1 || end <= start) {
    throw new Error(
      "cloudformation/wraps-email-infrastructure.yaml no longer has a WrapsConsoleAccessRole followed by an Outputs section"
    );
  }

  return template.slice(start, end);
}

describe("wraps-console-access-role grants nothing it has no caller for", () => {
  const sources = [
    {
      name: "cloudformation/wraps-email-infrastructure.yaml (console role)",
      read: consoleRoleFromInfrastructureTemplate,
    },
    {
      name: "cloudformation/wraps-console-access-role.yaml",
      read: () => read("cloudformation/wraps-console-access-role.yaml"),
    },
    {
      // buildConsolePolicyDocument lives here and builds nothing else, so the
      // whole file can be read as text — no import across the workspace, and
      // no build step, which is what lets this run from the repo root.
      name: "packages/cli/src/commands/platform/update-role.ts",
      read: () => read("packages/cli/src/commands/platform/update-role.ts"),
    },
  ];

  for (const source of sources) {
    for (const prefix of UNUSED_SERVICE_PREFIXES) {
      it(`grants no ${prefix} action in ${source.name}`, () => {
        // Matches the quoted action strings an IAM policy lists, so the prose
        // in a comment explaining why the grant is absent does not trip it.
        const granted = source
          .read()
          .match(new RegExp(`"${prefix}[A-Za-z]+"`, "g"));

        expect(
          granted,
          `${source.name} grants ${granted?.join(", ")} to the console role — add a caller first, or drop the grant`
        ).toBeNull();
      });
    }
  }

  it("grants s3:ListBucket, not the s3:HeadBucket action that does not exist", () => {
    // HeadBucket is an S3 API call authorized by s3:ListBucket. IAM has no
    // s3:HeadBucket action, so that grant authorized nothing and the
    // dashboard's inbound-bucket detection silently failed on every role that
    // did not also get ListBucket from the separate inbound grant.
    for (const source of sources) {
      const text = source.read();
      expect(text, `${source.name} is missing s3:ListBucket`).toContain(
        "s3:ListBucket"
      );
      expect(
        text.match(/"s3:HeadBucket"/),
        `${source.name} still grants the non-existent s3:HeadBucket action`
      ).toBeNull();
    }
  });
});
