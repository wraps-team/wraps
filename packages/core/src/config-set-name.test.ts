import { describe, expect, it } from "vitest";
import { domainToConfigSetName } from "./config-set-name.js";

describe("domainToConfigSetName", () => {
  it('returns "wraps-email-example-com" for "example.com"', () => {
    expect(domainToConfigSetName("example.com")).toBe(
      "wraps-email-example-com"
    );
  });

  it('converts dots to hyphens: "mail.example.com" → "wraps-email-mail-example-com"', () => {
    expect(domainToConfigSetName("mail.example.com")).toBe(
      "wraps-email-mail-example-com"
    );
  });

  it("produces name ≤ 64 chars with hash suffix when slug exceeds 52 chars", () => {
    const longDomain =
      "averylongdomainname.with.multiple.subdomains.and.more.example.com";
    const result = domainToConfigSetName(longDomain);
    expect(result.length).toBeLessThanOrEqual(64);
    expect(result.startsWith("wraps-email-")).toBe(true);
    // hash suffix appended (last segment is 8-char hex)
    const parts = result.split("-");
    const lastPart = parts.at(-1);
    expect(lastPart).toMatch(/^[0-9a-f]{8}$/);
  });

  it("prevents collision: my.domain.com and my-domain.com produce different names", () => {
    expect(domainToConfigSetName("my.domain.com")).not.toBe(
      domainToConfigSetName("my-domain.com")
    );
  });

  it("output contains only [A-Za-z0-9-] characters", () => {
    const domains = [
      "example.com",
      "mail.example.com",
      "my-domain.com",
      "my.domain.com",
      "averylongdomainname.with.multiple.subdomains.and.more.example.com",
    ];
    for (const domain of domains) {
      const result = domainToConfigSetName(domain);
      expect(result).toMatch(/^[A-Za-z0-9-]+$/);
    }
  });
});
