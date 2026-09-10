import { describe, expect, it } from "vitest";
import { AWS_ACCOUNT_SETUP_METHODS } from "../schema";

// Plan 284: AWS_ACCOUNT_SETUP_METHODS is the single source of truth for how
// an aws_account row was created. A typo at a call site already fails at
// compile time via the `$type<AwsAccountSetupMethod>()` annotation on the
// column — this test exists so drift in the *list itself* (a value added,
// removed, or renamed) fails loudly here instead of silently changing what
// every insert site is allowed to write.
describe("AWS_ACCOUNT_SETUP_METHODS", () => {
  it("contains exactly the four expected setup methods", () => {
    expect(AWS_ACCOUNT_SETUP_METHODS).toEqual([
      "cfn_infrastructure",
      "cfn_console_role",
      "cli_connect",
      "onboarding_wizard",
    ]);
  });

  it("has no duplicate values", () => {
    expect(new Set(AWS_ACCOUNT_SETUP_METHODS).size).toBe(
      AWS_ACCOUNT_SETUP_METHODS.length
    );
  });
});
