import { describeEventDiagnostics } from "@wraps/core/email-diagnostics";
import { describe, expect, it } from "vitest";
import {
  explainSendProblem,
  normalizeAddressInput,
} from "../address-explanation";

const T = new Date("2026-10-20T10:00:00.000Z");

function problem(
  overrides: Partial<Parameters<typeof explainSendProblem>[0]> = {}
) {
  return {
    bouncedAt: null,
    complainedAt: null,
    suppressedAt: null,
    bounceType: null,
    bounceSubType: null,
    ...overrides,
  };
}

describe("explainSendProblem", () => {
  it("complaint wins over bounce when both timestamps are set", () => {
    const result = explainSendProblem(
      problem({
        complainedAt: T,
        bouncedAt: T,
        bounceType: "Permanent",
        bounceSubType: "General",
      })
    );
    expect(result.kind).toBe("complaint");
    expect(result.headline).toBe("Reported as spam");
  });

  it("complaint detail says the complaint type is not recorded", () => {
    const result = explainSendProblem(problem({ complainedAt: T }));
    expect(result.detail).toBe(
      "The recipient reported this email as spam. The complaint type is not recorded."
    );
  });

  it("Permanent/General bounce uses the describeEventDiagnostics headline", () => {
    const expected = describeEventDiagnostics("bounce", {
      bounceType: "Permanent",
      bounceSubType: "General",
    });
    const result = explainSendProblem(
      problem({
        bouncedAt: T,
        bounceType: "Permanent",
        bounceSubType: "General",
      })
    );
    expect(result.kind).toBe("bounce");
    expect(result.headline).toBe(expected?.headline);
    expect(result.severity).toBe(expected?.severity);
    expect(result.detail).toBe("Permanent / General");
  });

  it("unknown bounce subtype falls back to bounce-type headline, severity from the translation layer", () => {
    const expected = describeEventDiagnostics("bounce", {
      bounceType: "Permanent",
      bounceSubType: "NoSuchSubtype",
    });
    const result = explainSendProblem(
      problem({
        bouncedAt: T,
        bounceType: "Permanent",
        bounceSubType: "NoSuchSubtype",
      })
    );
    expect(result.headline).toBe(expected?.headline);
    expect(result.severity).toBe(expected?.severity);
  });

  it("suppressed-only row says not sent, detail null", () => {
    const result = explainSendProblem(problem({ suppressedAt: T }));
    expect(result).toEqual({
      kind: "suppressed",
      headline: "Not sent: the address was on the suppression list",
      detail: null,
      severity: "info",
    });
  });

  it('bounce with null bounceType returns headline "Bounced" and severity unknown', () => {
    const result = explainSendProblem(problem({ bouncedAt: T }));
    expect(result.kind).toBe("bounce");
    expect(result.headline).toBe("Bounced");
    expect(result.severity).toBe("unknown");
    expect(result.detail).toBeNull();
  });
});

describe("normalizeAddressInput", () => {
  it("trims whitespace and rejects strings without @", () => {
    expect(normalizeAddressInput("  Mixed@Example.com  ")).toEqual({
      ok: true,
      address: "Mixed@Example.com",
    });
    expect(normalizeAddressInput("   ")).toEqual({
      ok: false,
      error: "Enter an email address.",
    });
    expect(normalizeAddressInput("not-an-address")).toEqual({
      ok: false,
      error: "Enter an email address.",
    });
  });
});
