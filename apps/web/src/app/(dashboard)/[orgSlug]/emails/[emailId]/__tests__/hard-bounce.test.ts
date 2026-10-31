import { describe, expect, it } from "vitest";
import { findHardBounce } from "../hard-bounce";

const AT = 1_793_430_046_000;

function bounce(metadata: Record<string, unknown>) {
  return { type: "bounce", timestamp: AT, metadata };
}

describe("findHardBounce", () => {
  it("returns the hard-bounced addresses, lowercased and deduplicated", () => {
    expect(
      findHardBounce([
        { type: "send", timestamp: AT - 1000 },
        bounce({
          bounceType: "Permanent",
          bounceSubType: "General",
          bouncedRecipients: [
            { emailAddress: "A@Example.com" },
            { emailAddress: "a@example.com" },
            { emailAddress: "b@example.com" },
          ],
        }),
      ])
    ).toEqual({ addresses: ["a@example.com", "b@example.com"], bouncedAt: AT });
  });

  it("ignores soft and content bounces", () => {
    for (const [bounceType, bounceSubType] of [
      ["Transient", "MailboxFull"],
      ["Transient", "ContentRejected"],
      ["Undetermined", "Undetermined"],
    ]) {
      expect(
        findHardBounce([
          bounce({
            bounceType,
            bounceSubType,
            bouncedRecipients: [{ emailAddress: "a@example.com" }],
          }),
        ])
      ).toBeNull();
    }
  });

  it("ignores a bounce SES raised because the address was already suppressed", () => {
    for (const bounceSubType of [
      "Suppressed",
      "OnAccountSuppressionList",
      "OnTenantSuppressionList",
      "EmailValidationSuppressed",
    ]) {
      expect(
        findHardBounce([
          bounce({
            bounceType: "Permanent",
            bounceSubType,
            bouncedRecipients: [{ emailAddress: "a@example.com" }],
          }),
        ])
      ).toBeNull();
    }
  });

  it("returns null when the bounce names no recipient", () => {
    expect(
      findHardBounce([
        bounce({ bounceType: "Permanent", bounceSubType: "General" }),
        bounce({
          bounceType: "Permanent",
          bounceSubType: "General",
          bouncedRecipients: [{}, null, "x"],
        }),
      ])
    ).toBeNull();
  });
});
