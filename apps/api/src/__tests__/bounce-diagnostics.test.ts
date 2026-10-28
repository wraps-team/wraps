import { translateDiagnosticCode } from "@wraps/core/email-diagnostics";
import { describe, expect, it } from "vitest";
import {
  extractBounceDiagnostic,
  normalizeFeedbackType,
  redactAddresses,
} from "../lib/bounce-diagnostics";

describe("extractBounceDiagnostic", () => {
  it("matches the row recipient case-insensitively", () => {
    const result = extractBounceDiagnostic(
      [{ emailAddress: " Bob@Example.COM ", status: "5.1.1" }],
      "bob@example.com"
    );
    expect(result.enhancedStatus).toBe("5.1.1");
  });

  it("picks the single entry when no recipient matches", () => {
    const result = extractBounceDiagnostic(
      [{ emailAddress: "other@example.com", status: "5.1.1" }],
      "me@example.com"
    );
    expect(result.enhancedStatus).toBe("5.1.1");
  });

  it("returns all-null when two entries match nothing", () => {
    const result = extractBounceDiagnostic(
      [
        { emailAddress: "a@example.com", status: "5.1.1" },
        { emailAddress: "b@example.com", status: "5.7.1" },
      ],
      "me@example.com"
    );
    expect(result).toEqual({
      enhancedStatus: null,
      diagnosticCode: null,
      reasonKey: null,
    });
  });

  it("reads entry 0 when the row recipient is undefined", () => {
    const result = extractBounceDiagnostic(
      [
        { emailAddress: "a@example.com", status: "5.1.1" },
        { emailAddress: "b@example.com", status: "5.7.1" },
      ],
      undefined
    );
    expect(result.enhancedStatus).toBe("5.1.1");
  });

  it("reads at most 50 entries", () => {
    const recipients = Array.from({ length: 60 }, (_, i) => ({
      emailAddress: i === 55 ? "target@example.com" : `filler${i}@example.com`,
      status: i === 55 ? "5.1.1" : undefined,
    }));
    const result = extractBounceDiagnostic(recipients, "target@example.com");
    expect(result).toEqual({
      enhancedStatus: null,
      diagnosticCode: null,
      reasonKey: null,
    });
  });

  it("skips non-object entries and entries without a string emailAddress", () => {
    const result = extractBounceDiagnostic(
      [
        null,
        "not-an-object",
        { emailAddress: 42, status: "5.7.1" },
        { emailAddress: "me@example.com", status: "5.1.1" },
      ],
      "me@example.com"
    );
    expect(result.enhancedStatus).toBe("5.1.1");
  });

  it("returns all-null for a missing or non-array bouncedRecipients", () => {
    const empty = {
      enhancedStatus: null,
      diagnosticCode: null,
      reasonKey: null,
    };
    expect(extractBounceDiagnostic(undefined, "me@example.com")).toEqual(empty);
    expect(extractBounceDiagnostic("oops", "me@example.com")).toEqual(empty);
  });

  it("drops an invalid enhanced status", () => {
    for (const status of ["550", "5.1", "9.1.1", "5.1.1.1", "5.1.1 extra"]) {
      const result = extractBounceDiagnostic(
        [{ emailAddress: "me@example.com", status }],
        "me@example.com"
      );
      expect(result.enhancedStatus, status).toBeNull();
    }
  });

  it("keeps a well-formed enhanced status", () => {
    const result = extractBounceDiagnostic(
      [{ emailAddress: "me@example.com", status: " 5.7.1 " }],
      "me@example.com"
    );
    expect(result.enhancedStatus).toBe("5.7.1");
  });

  it("redacts, collapses whitespace in and caps the diagnostic code at 512", () => {
    const longCode = `smtp;   550   5.1.1\n\n  ${"x ".repeat(2000)}`;
    const result = extractBounceDiagnostic(
      [{ emailAddress: "me@example.com", diagnosticCode: longCode }],
      "me@example.com"
    );
    expect(result.diagnosticCode).not.toBeNull();
    expect(result.diagnosticCode?.length).toBeLessThanOrEqual(512);
    expect(result.diagnosticCode?.startsWith("smtp; 550 5.1.1 x x")).toBe(true);
    expect(result.diagnosticCode).not.toMatch(/\s{2,}|\n/);
  });

  it("stores a null diagnostic code for an empty or whitespace-only value", () => {
    const result = extractBounceDiagnostic(
      [{ emailAddress: "me@example.com", diagnosticCode: "   \n " }],
      "me@example.com"
    );
    expect(result.diagnosticCode).toBeNull();
  });

  it("replaces a recipient address inside the diagnostic text with [address]", () => {
    const result = extractBounceDiagnostic(
      [
        {
          emailAddress: "me@example.com",
          diagnosticCode:
            "smtp; 550 5.1.1 <me@example.com>: Recipient address rejected",
        },
      ],
      "me@example.com"
    );
    expect(result.diagnosticCode).toBe(
      "smtp; 550 5.1.1 <[address]>: Recipient address rejected"
    );
    expect(result.diagnosticCode).not.toContain("me@example.com");
  });

  it("derives the reason key from translateDiagnosticCode as provider|code|title", () => {
    const diagnosticCode = "smtp; 550 5.1.1 user unknown";
    const expected = translateDiagnosticCode({
      status: "5.1.1",
      diagnosticCode,
    });
    expect(expected).not.toBeNull();

    const result = extractBounceDiagnostic(
      [
        {
          emailAddress: "me@example.com",
          status: "5.1.1",
          diagnosticCode,
        },
      ],
      "me@example.com"
    );
    expect(result.reasonKey).toBe(
      `${expected?.provider ?? ""}|${expected?.code ?? ""}|${expected?.title}`
    );
  });

  it("leaves the reason key null when no code is recognised", () => {
    const result = extractBounceDiagnostic(
      [
        {
          emailAddress: "me@example.com",
          diagnosticCode: "something nobody can classify",
        },
      ],
      "me@example.com"
    );
    expect(result.reasonKey).toBeNull();
    expect(result.diagnosticCode).toBe("something nobody can classify");
  });

  it("caps the reason key at 200 characters", () => {
    const result = extractBounceDiagnostic(
      [{ emailAddress: "me@example.com", status: "5.1.1" }],
      "me@example.com"
    );
    expect(result.reasonKey).not.toBeNull();
    expect((result.reasonKey ?? "").length).toBeLessThanOrEqual(200);
  });
});

describe("redactAddresses", () => {
  it("replaces every address-shaped token and keeps host text", () => {
    // The token class does not exclude commas, so "a@x.com," is one token.
    expect(
      redactAddresses("550 a@x.com, b.c+d@sub.example.org and 192.0.2.10")
    ).toBe("550 [address] [address] and 192.0.2.10");
  });
});

describe("normalizeFeedbackType", () => {
  it("lower-cases well-formed values", () => {
    expect(normalizeFeedbackType("ABUSE")).toBe("abuse");
    expect(normalizeFeedbackType("auth-failure")).toBe("auth-failure");
    expect(normalizeFeedbackType("x".repeat(32))).toBe("x".repeat(32));
  });

  it("rejects other values", () => {
    expect(normalizeFeedbackType("bad type!")).toBeNull();
    expect(normalizeFeedbackType("")).toBeNull();
    expect(normalizeFeedbackType("x".repeat(33))).toBeNull();
    expect(normalizeFeedbackType("abuse1")).toBeNull();
    expect(normalizeFeedbackType(42)).toBeNull();
    expect(normalizeFeedbackType(undefined)).toBeNull();
    expect(normalizeFeedbackType(null)).toBeNull();
  });
});

describe("bounce diagnostics are absent-field tolerant", () => {
  it("an entry with only emailAddress yields all-null fields", () => {
    expect(
      extractBounceDiagnostic(
        [{ emailAddress: "me@example.com" }],
        "me@example.com"
      )
    ).toEqual({ enhancedStatus: null, diagnosticCode: null, reasonKey: null });
  });
});
