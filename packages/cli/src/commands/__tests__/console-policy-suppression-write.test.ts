import { describe, expect, it } from "vitest";
import { buildConsolePolicyDocument } from "../platform/update-role.js";

/**
 * The dashboard's "Add address" action writes to the account-level SES
 * suppression list, so the console role needs ses:PutSuppressedDestination.
 * This test locks that grant in. The neighbouring account-level writes
 * (ses:PutAccountSuppressionAttributes, ses:PutConfigurationSetSuppressionOptions)
 * are not needed by any dashboard action and must stay absent. Whoever next
 * widens this role should extend the negative assertions rather than deleting them.
 */
const DEFAULT_EMAIL_CONFIG = {
  sendingEnabled: true,
  eventTracking: { enabled: true },
};

describe("wraps-console-access-role policy: suppression list write grant", () => {
  it("includes ses:PutSuppressedDestination", () => {
    const generated = buildConsolePolicyDocument(
      DEFAULT_EMAIL_CONFIG,
      undefined
    );
    const allActions = generated.Statement.flatMap((s) => s.Action);
    expect(allActions).toContain("ses:PutSuppressedDestination");
  });

  it("does not include ses:PutAccountSuppressionAttributes or ses:PutConfigurationSetSuppressionOptions", () => {
    const generated = buildConsolePolicyDocument(
      DEFAULT_EMAIL_CONFIG,
      undefined
    );
    const allActions = generated.Statement.flatMap((s) => s.Action);
    expect(allActions).not.toContain("ses:PutAccountSuppressionAttributes");
    expect(allActions).not.toContain(
      "ses:PutConfigurationSetSuppressionOptions"
    );
  });
});
