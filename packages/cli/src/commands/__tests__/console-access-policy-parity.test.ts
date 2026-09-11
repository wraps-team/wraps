import { describe, expect, it } from "vitest";
// `apps/website/src/app/byoc/console-access-policy.ts` is a self-contained
// file with zero imports (just a `JSON.stringify(...)` literal), so a
// direct relative import across the monorepo works without adding either
// package as the other's dependency — no `apps/website` -> `packages/cli`
// edge (which would be architecturally backwards) and no reason to make
// `packages/cli` depend on the website. If that file ever grows real
// imports, switch this to reading it as text instead.
import { CONSOLE_ACCESS_POLICY_JSON } from "../../../../../apps/website/src/app/byoc/console-access-policy.js";
import { buildConsolePolicyDocument } from "../platform/update-role.js";

/**
 * Plan 178 published the `wraps-console-access-role` IAM policy on a public
 * page, hand-reproduced from `buildConsolePolicyDocument()`. Plan 183 (scope
 * addition) guards it: this test regenerates the policy for the exact
 * "default email deployment" the website page claims to show (sending
 * enabled, event tracking enabled, no inbound, no archiving, no SMS) and
 * asserts it's byte-identical to what's published. A published IAM policy
 * drifting from the generator is the same failure mode as the docs drift
 * plan 180 fixed, aimed at the audience most likely to check: security
 * reviewers reading a policy off a marketing page.
 */

const DEFAULT_EMAIL_CONFIG = {
  sendingEnabled: true,
  eventTracking: { enabled: true },
  // emailArchiving and inbound deliberately omitted — undefined reads as
  // "not enabled" in buildConsolePolicyDocument's `?.enabled` checks.
};

describe("wraps-console-access-role policy: website matches the generator", () => {
  it("CONSOLE_ACCESS_POLICY_JSON equals buildConsolePolicyDocument() for a default email deployment", () => {
    const generated = buildConsolePolicyDocument(
      DEFAULT_EMAIL_CONFIG,
      undefined
    );
    const generatedJson = JSON.stringify(generated, null, 2);

    expect(CONSOLE_ACCESS_POLICY_JSON).toBe(generatedJson);
  });

  it("has exactly 6 statements for a default email deployment", () => {
    const generated = buildConsolePolicyDocument(
      DEFAULT_EMAIL_CONFIG,
      undefined
    );
    expect(generated.Statement).toHaveLength(6);
  });
});
