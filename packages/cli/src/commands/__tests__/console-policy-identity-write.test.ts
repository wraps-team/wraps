import { describe, expect, it } from "vitest";
import { buildConsolePolicyDocument } from "../platform/update-role.js";

/**
 * Plan 245 gave the console-access role its first identity write —
 * ses:CreateEmailIdentity, needed by verifyOwnEmailIdentity
 * (apps/web/src/actions/ses-onboarding.ts) so a sandboxed account can verify
 * its own address and complete a real first send. This test locks that in
 * as an invariant: the grant must be present, and the neighbouring identity
 * writes nothing calls today must stay absent. Whoever next widens this role
 * should extend the negative assertions rather than deleting them.
 *
 * Plan 376 added the per-domain configuration-set writes the dashboard's
 * "Add domain" needs: ses:CreateConfigurationSet and
 * ses:CreateConfigurationSetEventDestination (scoped to wraps-email-* sets)
 * and ses:PutEmailIdentityConfigurationSetAttributes.
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
    expect(allActions).not.toContain("ses:DeleteConfigurationSet");
    expect(allActions).not.toContain("ses:TagResource");
  });

  it("includes the per-domain configuration set writes (plan 376)", () => {
    const generated = buildConsolePolicyDocument(
      DEFAULT_EMAIL_CONFIG,
      undefined
    );
    const allActions = generated.Statement.flatMap((s) => s.Action);
    expect(allActions).toContain("ses:CreateConfigurationSet");
    expect(allActions).toContain("ses:CreateConfigurationSetEventDestination");
    expect(allActions).toContain(
      "ses:PutEmailIdentityConfigurationSetAttributes"
    );
  });

  it("scopes configuration set creation to the wraps-email-* namespace", () => {
    const generated = buildConsolePolicyDocument(
      DEFAULT_EMAIL_CONFIG,
      undefined
    );
    const statement = generated.Statement.find((s) =>
      s.Action.includes("ses:CreateConfigurationSet")
    );
    expect(statement?.Resource).toBe(
      "arn:aws:ses:*:*:configuration-set/wraps-email-*"
    );
  });
});
