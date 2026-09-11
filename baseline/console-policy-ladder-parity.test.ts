import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Two CloudFormation templates create `wraps-console-access-role`:
// `wraps-console-access-role.yaml` on its own, and
// `wraps-email-infrastructure.yaml` alongside the rest of the email stack.
// Only the first was kept current. The second fell three rungs behind, so an
// account deployed from it probed as console-policy version 2 against a
// current 5 and sat permanently in the "your AWS role is behind the current
// Wraps policy" alert — with no repair that cleared it, because updating the
// stack re-applies the same stale policy.
//
// The ladder in apps/api/src/lib/console-policy-version.ts reads a role's
// version off which of these actions succeed. A template that omits one caps
// every account it deploys below that rung.
const repoRoot = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repoRoot), "utf-8");

const LADDER_ACTIONS = [
  "ses:GetAccount",
  "ses:ListEmailIdentities",
  "ses:ListEmailTemplates",
  "ses:ListConfigurationSets",
  "ses:ListSuppressedDestinations",
] as const;

const TEMPLATES = [
  "cloudformation/wraps-console-access-role.yaml",
  "cloudformation/wraps-email-infrastructure.yaml",
] as const;

describe("console-policy ladder parity across both CloudFormation templates", () => {
  for (const path of TEMPLATES) {
    it(`grants every ladder marker action in ${path}`, () => {
      const source = read(path);
      for (const action of LADDER_ACTIONS) {
        expect(
          source,
          `${path} is missing ${action}, so roles it creates probe below the current console-policy version`
        ).toContain(action);
      }
    });
  }

  it("covers every version the probe can report", () => {
    // One rung per version, so the current version is also the number of
    // marker actions. A rung added to the probe without a matching action
    // here would let a template ship without the permission and still pass
    // the assertions above.
    const probe = read("apps/api/src/lib/console-policy-version.ts");
    const declared = probe.match(/CURRENT_CONSOLE_POLICY_VERSION = (\d+)/)?.[1];

    expect(
      Number(declared),
      "a rung was added to console-policy-version.ts without adding its action to LADDER_ACTIONS"
    ).toBe(LADDER_ACTIONS.length);

    // Counting alone would still pass if a rung swapped its marker action for
    // a different one, leaving the templates checked against an action
    // nothing probes. Each IAM action maps to the SDK command the rung sends.
    for (const action of LADDER_ACTIONS) {
      const command = `${action.replace("ses:", "")}Command`;
      expect(
        probe,
        `${action} is in LADDER_ACTIONS but no rung sends ${command}`
      ).toContain(command);
    }
  });
});
