import { describe, expect, it } from "vitest";
import { buildConsolePolicyDocument } from "../platform/update-role.js";

/**
 * Plan 245 gave the console-access role exactly one identity write —
 * ses:CreateEmailIdentity, needed by verifyOwnEmailIdentity
 * (apps/web/src/actions/ses-onboarding.ts) so a sandboxed account can verify
 * its own address and complete a real first send. This test locks that in
 * as an invariant: the grant must be present, and the neighbouring identity
 * writes nothing calls today must stay absent. Whoever next widens this role
 * should extend the negative assertions rather than deleting them.
 */
const DEFAULT_EMAIL_CONFIG = {
  sendingEnabled: true,
  eventTracking: { enabled: true },
};

describe("wraps-console-access-role policy: identity write grant", () => {
  it("includes ses:CreateEmailIdentity", () => {
    const generated = buildConsolePolicyDocument(
      DEFAULT_EMAIL_CONFIG,
      undefined
    );
    const allActions = generated.Statement.flatMap((s) => s.Action);
    expect(allActions).toContain("ses:CreateEmailIdentity");
  });

  it("does not include ses:DeleteEmailIdentity, ses:PutEmailIdentityDkimSigningAttributes, or ses:PutEmailIdentityMailFromAttributes", () => {
    const generated = buildConsolePolicyDocument(
      DEFAULT_EMAIL_CONFIG,
      undefined
    );
    const allActions = generated.Statement.flatMap((s) => s.Action);
    expect(allActions).not.toContain("ses:DeleteEmailIdentity");
    expect(allActions).not.toContain(
      "ses:PutEmailIdentityDkimSigningAttributes"
    );
    expect(allActions).not.toContain("ses:PutEmailIdentityMailFromAttributes");
  });
});
