/**
 * Unit tests for workflow processor utility functions.
 *
 * Tests pure functions exported from workflow-processor.ts:
 * - evaluateCondition: Condition evaluation logic
 * - sanitizeEmailSubject: Email subject sanitization
 * - isValidE164Phone: Phone number validation
 * - substituteVariables: Handlebars template substitution
 */

import { describe, expect, it } from "vitest";

import {
  evaluateCondition,
  isValidE164Phone,
  sanitizeEmailSubject,
  substituteVariables,
} from "../workers/workflow-processor";
import { isRetryableStep } from "../workers/workflow-utils";

// =============================================================================
// evaluateCondition
// =============================================================================

describe("evaluateCondition", () => {
  describe("equals operator", () => {
    it("should return true when values are equal strings", () => {
      expect(evaluateCondition("hello", "equals", "hello")).toBe(true);
    });

    it("should return false when values are different strings", () => {
      expect(evaluateCondition("hello", "equals", "world")).toBe(false);
    });

    it("should convert numbers to strings for comparison", () => {
      expect(evaluateCondition(42, "equals", "42")).toBe(true);
      expect(evaluateCondition("42", "equals", 42)).toBe(true);
    });

    it("should handle null values", () => {
      expect(evaluateCondition(null, "equals", "")).toBe(true);
      expect(evaluateCondition(null, "equals", "null")).toBe(false);
    });

    it("should handle undefined values", () => {
      expect(evaluateCondition(undefined, "equals", "")).toBe(true);
    });

    it("should be case-sensitive", () => {
      expect(evaluateCondition("Hello", "equals", "hello")).toBe(false);
    });
  });

  describe("not_equals operator", () => {
    it("should return true when values are different", () => {
      expect(evaluateCondition("hello", "not_equals", "world")).toBe(true);
    });

    it("should return false when values are equal", () => {
      expect(evaluateCondition("hello", "not_equals", "hello")).toBe(false);
    });
  });

  describe("contains operator", () => {
    it("should return true when value contains substring", () => {
      expect(evaluateCondition("hello world", "contains", "world")).toBe(true);
    });

    it("should return false when value does not contain substring", () => {
      expect(evaluateCondition("hello", "contains", "world")).toBe(false);
    });

    it("should handle empty substring", () => {
      expect(evaluateCondition("hello", "contains", "")).toBe(true);
    });

    it("should be case-sensitive", () => {
      expect(evaluateCondition("Hello World", "contains", "world")).toBe(false);
    });
  });

  describe("not_contains operator", () => {
    it("should return true when value does not contain substring", () => {
      expect(evaluateCondition("hello", "not_contains", "world")).toBe(true);
    });

    it("should return false when value contains substring", () => {
      expect(evaluateCondition("hello world", "not_contains", "world")).toBe(
        false
      );
    });
  });

  describe("starts_with operator", () => {
    it("should return true when value starts with prefix", () => {
      expect(evaluateCondition("hello world", "starts_with", "hello")).toBe(
        true
      );
    });

    it("should return false when value does not start with prefix", () => {
      expect(evaluateCondition("hello world", "starts_with", "world")).toBe(
        false
      );
    });

    it("should handle empty prefix", () => {
      expect(evaluateCondition("hello", "starts_with", "")).toBe(true);
    });
  });

  describe("ends_with operator", () => {
    it("should return true when value ends with suffix", () => {
      expect(evaluateCondition("hello world", "ends_with", "world")).toBe(true);
    });

    it("should return false when value does not end with suffix", () => {
      expect(evaluateCondition("hello world", "ends_with", "hello")).toBe(
        false
      );
    });

    it("should handle empty suffix", () => {
      expect(evaluateCondition("hello", "ends_with", "")).toBe(true);
    });
  });

  describe("greater_than operator", () => {
    it("should compare numbers correctly", () => {
      expect(evaluateCondition(10, "greater_than", 5)).toBe(true);
      expect(evaluateCondition(5, "greater_than", 10)).toBe(false);
      expect(evaluateCondition(5, "greater_than", 5)).toBe(false);
    });

    it("should convert string numbers", () => {
      expect(evaluateCondition("10", "greater_than", "5")).toBe(true);
      expect(evaluateCondition("5", "greater_than", "10")).toBe(false);
    });

    it("should handle NaN gracefully", () => {
      expect(evaluateCondition("abc", "greater_than", 5)).toBe(false);
      expect(evaluateCondition(5, "greater_than", "abc")).toBe(false);
    });
  });

  describe("less_than operator", () => {
    it("should compare numbers correctly", () => {
      expect(evaluateCondition(5, "less_than", 10)).toBe(true);
      expect(evaluateCondition(10, "less_than", 5)).toBe(false);
      expect(evaluateCondition(5, "less_than", 5)).toBe(false);
    });

    it("should convert string numbers", () => {
      expect(evaluateCondition("5", "less_than", "10")).toBe(true);
    });
  });

  describe("is_set operator", () => {
    it("should return true for non-empty values", () => {
      expect(evaluateCondition("hello", "is_set", "")).toBe(true);
      expect(evaluateCondition(0, "is_set", "")).toBe(true);
      expect(evaluateCondition(false, "is_set", "")).toBe(true);
    });

    it("should return false for null", () => {
      expect(evaluateCondition(null, "is_set", "")).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(evaluateCondition(undefined, "is_set", "")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(evaluateCondition("", "is_set", "")).toBe(false);
    });
  });

  describe("is_not_set operator", () => {
    it("should return true for null", () => {
      expect(evaluateCondition(null, "is_not_set", "")).toBe(true);
    });

    it("should return true for undefined", () => {
      expect(evaluateCondition(undefined, "is_not_set", "")).toBe(true);
    });

    it("should return true for empty string", () => {
      expect(evaluateCondition("", "is_not_set", "")).toBe(true);
    });

    it("should return false for non-empty values", () => {
      expect(evaluateCondition("hello", "is_not_set", "")).toBe(false);
      expect(evaluateCondition(0, "is_not_set", "")).toBe(false);
    });
  });

  describe("unknown operator", () => {
    it("should return false for unknown operators", () => {
      expect(evaluateCondition("hello", "unknown_op", "hello")).toBe(false);
    });
  });
});

// =============================================================================
// sanitizeEmailSubject
// =============================================================================

describe("sanitizeEmailSubject", () => {
  it("should return subject unchanged if already clean", () => {
    expect(sanitizeEmailSubject("Hello World")).toBe("Hello World");
  });

  it("should remove newlines (header injection prevention)", () => {
    expect(sanitizeEmailSubject("Hello\nWorld")).toBe("Hello World");
    expect(sanitizeEmailSubject("Hello\r\nWorld")).toBe("Hello World");
    expect(sanitizeEmailSubject("Hello\rWorld")).toBe("Hello World");
  });

  it("should collapse multiple whitespaces", () => {
    expect(sanitizeEmailSubject("Hello    World")).toBe("Hello World");
    expect(sanitizeEmailSubject("Hello\t\tWorld")).toBe("Hello World");
  });

  it("should trim leading and trailing whitespace", () => {
    expect(sanitizeEmailSubject("  Hello World  ")).toBe("Hello World");
  });

  it("should truncate to 998 characters (RFC 2822)", () => {
    const longSubject = "a".repeat(2000);
    const result = sanitizeEmailSubject(longSubject);
    expect(result.length).toBe(998);
  });

  it("should handle empty string", () => {
    expect(sanitizeEmailSubject("")).toBe("");
  });

  it("should handle subject with only whitespace", () => {
    expect(sanitizeEmailSubject("   \n\r\t   ")).toBe("");
  });

  it("does NOT entity-escape — subjects are plain-text headers, not HTML", () => {
    // Escaping here double-encoded subjects ("Smith & Co" arrived as
    // "Smith &amp; Co" in real inboxes). Display-layer escaping is the
    // dashboard's job; the send path must deliver the literal characters.
    expect(sanitizeEmailSubject("Price < $10 & save > 20%")).toBe(
      "Price < $10 & save > 20%"
    );
    expect(sanitizeEmailSubject('Test "quotes" & ampersand')).toBe(
      'Test "quotes" & ampersand'
    );
  });

  it("should prevent header injection attacks by removing newlines", () => {
    const malicious = "Subject\r\nBcc: attacker@evil.com\r\n\r\nMalicious body";
    const result = sanitizeEmailSubject(malicious);
    // Newlines are removed, so the injection attempt becomes part of subject
    // The key is that \r\n is removed, preventing actual header injection
    expect(result).not.toContain("\r\n");
    expect(result).not.toContain("\n");
    expect(result).not.toContain("\r");
    // All content is collapsed into single line
    expect(result).toBe("Subject Bcc: attacker@evil.com Malicious body");
  });
});

// =============================================================================
// isValidE164Phone
// =============================================================================

describe("isValidE164Phone", () => {
  describe("valid E.164 numbers", () => {
    it("should accept US numbers", () => {
      expect(isValidE164Phone("+15551234567")).toBe(true);
      expect(isValidE164Phone("+12025551234")).toBe(true);
    });

    it("should accept UK numbers", () => {
      expect(isValidE164Phone("+447911123456")).toBe(true);
    });

    it("should accept international numbers", () => {
      expect(isValidE164Phone("+33612345678")).toBe(true); // France
      expect(isValidE164Phone("+81312345678")).toBe(true); // Japan
      expect(isValidE164Phone("+8613912345678")).toBe(true); // China
    });

    it("should accept minimum length (10 digits after +)", () => {
      expect(isValidE164Phone("+1234567890")).toBe(true);
    });

    it("should accept maximum length (15 digits after +)", () => {
      expect(isValidE164Phone("+123456789012345")).toBe(true);
    });
  });

  describe("invalid E.164 numbers", () => {
    it("should reject numbers without + prefix", () => {
      expect(isValidE164Phone("15551234567")).toBe(false);
    });

    it("should reject numbers starting with 0", () => {
      expect(isValidE164Phone("+05551234567")).toBe(false);
    });

    it("should reject numbers too short", () => {
      expect(isValidE164Phone("+123456789")).toBe(false); // 9 digits
    });

    it("should reject numbers too long", () => {
      expect(isValidE164Phone("+1234567890123456")).toBe(false); // 16 digits
    });

    it("should reject numbers with non-digit characters", () => {
      expect(isValidE164Phone("+1-555-123-4567")).toBe(false);
      expect(isValidE164Phone("+1 555 123 4567")).toBe(false);
      expect(isValidE164Phone("+1(555)1234567")).toBe(false);
    });

    it("should reject empty string", () => {
      expect(isValidE164Phone("")).toBe(false);
    });

    it("should reject just +", () => {
      expect(isValidE164Phone("+")).toBe(false);
    });
  });
});

// =============================================================================
// substituteVariables
// =============================================================================

describe("substituteVariables", () => {
  describe("simple substitution", () => {
    it("should replace simple variables", () => {
      const result = substituteVariables("Hello {{name}}!", { name: "World" });
      expect(result).toBe("Hello World!");
    });

    it("should handle multiple variables", () => {
      const result = substituteVariables("{{greeting}} {{name}}!", {
        greeting: "Hello",
        name: "World",
      });
      expect(result).toBe("Hello World!");
    });

    it("should handle missing variables as empty string", () => {
      const result = substituteVariables("Hello {{name}}!", {});
      expect(result).toBe("Hello !");
    });
  });

  describe("Handlebars conditionals", () => {
    it("should use value when variable is present", () => {
      const template = "Hi {{#if firstName}}{{firstName}}{{else}}there{{/if}}!";
      const result = substituteVariables(template, { firstName: "John" });
      expect(result).toBe("Hi John!");
      expect(result).not.toContain("there");
    });

    it("should use fallback when variable is missing", () => {
      const template = "Hi {{#if firstName}}{{firstName}}{{else}}there{{/if}}!";
      const result = substituteVariables(template, {});
      expect(result).toBe("Hi there!");
    });

    it("should use fallback when variable is empty string", () => {
      const template = "Hi {{#if firstName}}{{firstName}}{{else}}there{{/if}}!";
      const result = substituteVariables(template, { firstName: "" });
      expect(result).toBe("Hi there!");
    });

    it("should handle multiple conditionals", () => {
      const template =
        "Hi {{#if name}}{{name}}{{else}}there{{/if}}, " +
        "welcome to {{#if company}}{{company}}{{else}}our site{{/if}}!";

      // Both present
      expect(
        substituteVariables(template, { name: "John", company: "Acme" })
      ).toBe("Hi John, welcome to Acme!");

      // Only name present
      expect(substituteVariables(template, { name: "John" })).toBe(
        "Hi John, welcome to our site!"
      );

      // Only company present
      expect(substituteVariables(template, { company: "Acme" })).toBe(
        "Hi there, welcome to Acme!"
      );

      // Neither present
      expect(substituteVariables(template, {})).toBe(
        "Hi there, welcome to our site!"
      );
    });
  });

  describe("HTML escaping", () => {
    it("does not escape HTML bodies — SES substitutes verbatim", () => {
      const result = substituteVariables("Hello {{name}}!", {
        name: "<b>Jane</b>",
      });
      expect(result).toBe("Hello <b>Jane</b>!");
    });

    it("does not escape plain text either — subjects and SMS bodies", () => {
      // "Smith & Co" in a subject line must arrive as "Smith & Co",
      // not "Smith &amp; Co".
      const result = substituteVariables("Welcome to {{company}}", {
        company: "Smith & Co",
      });
      expect(result).toBe("Welcome to Smith & Co");
    });
  });

  describe("edge cases", () => {
    it("should handle empty template", () => {
      expect(substituteVariables("", { name: "test" })).toBe("");
    });

    it("should handle template with no variables", () => {
      expect(substituteVariables("Hello World!", {})).toBe("Hello World!");
    });

    it("should handle nested data objects", () => {
      // Handlebars supports nested objects at runtime
      const result = substituteVariables("Hello {{user.name}}!", {
        user: { name: "John" },
      } as unknown as Record<string, string>);
      expect(result).toBe("Hello John!");
    });

    it("should handle numeric values", () => {
      // Handlebars converts numbers to strings at runtime
      const result = substituteVariables("Count: {{count}}", {
        count: 42,
      } as unknown as Record<string, string>);
      expect(result).toBe("Count: 42");
    });

    it("should handle boolean values", () => {
      // Handlebars converts booleans to strings at runtime
      const result = substituteVariables("Active: {{active}}", {
        active: true,
      } as unknown as Record<string, string>);
      expect(result).toBe("Active: true");
    });
  });
});

// =============================================================================
// isRetryableStep
// =============================================================================

describe("isRetryableStep", () => {
  const snapshot = { steps: [{ id: "step-a" }, { id: "step-b" }] };

  it("allows retry for pre-snapshot executions (null snapshot)", () => {
    expect(isRetryableStep(null, "unknown")).toBe(true);
  });

  it("allows retry when the step is in the snapshot", () => {
    expect(isRetryableStep(snapshot, "step-b")).toBe(true);
  });

  it("refuses retry when the step is absent from the snapshot", () => {
    expect(isRetryableStep(snapshot, "step-z")).toBe(false);
  });

  it("refuses retry for the reaper's 'unknown' placeholder", () => {
    expect(isRetryableStep(snapshot, "unknown")).toBe(false);
  });
});
