import { describe, expect, it } from "vitest";
import {
  buildSpfRecord,
  estimateSpfLookups,
  SPF_PROVIDERS,
  SPF_QUALIFIERS,
} from "@/lib/spf-record";

describe("buildSpfRecord", () => {
  it("builds a default record with the soft-fail qualifier", () => {
    const result = buildSpfRecord({ providers: ["ses"] });
    expect(result.record).toBe("v=spf1 include:amazonses.com ~all");
    expect(result.lookups).toBe(1);
    expect(result.withinLimit).toBe(true);
  });

  it("orders IPs, then providers, then custom includes, then the qualifier", () => {
    const result = buildSpfRecord({
      providers: ["google", "ses"],
      ips: ["192.0.2.1"],
      includes: ["mail.example.com"],
    });
    expect(result.record).toBe(
      "v=spf1 ip4:192.0.2.1 include:_spf.google.com include:amazonses.com include:mail.example.com ~all"
    );
  });

  it("emits ip6: for addresses containing a colon", () => {
    const result = buildSpfRecord({ ips: ["2001:db8::1"] });
    expect(result.record).toBe("v=spf1 ip6:2001:db8::1 ~all");
  });

  it("flags a provider set that exceeds the 10 lookup limit", () => {
    const result = buildSpfRecord({ providers: ["freshdesk", "mailgun"] });
    expect(result.lookups).toBe(12);
    expect(result.withinLimit).toBe(false);
    expect(result.warnings.some((w) => /10 DNS lookup limit/.test(w))).toBe(
      true
    );
  });

  it("ignores unknown providers and reports them", () => {
    const result = buildSpfRecord({ providers: ["ses", "not-a-provider"] });
    expect(result.record).toBe("v=spf1 include:amazonses.com ~all");
    expect(result.unknownProviders).toEqual(["not-a-provider"]);
    expect(result.lookups).toBe(1);
  });

  it("warns about -all and ?all", () => {
    expect(buildSpfRecord({ qualifier: "-all" }).warnings[0]).toMatch(/-all/);
    expect(buildSpfRecord({ qualifier: "?all" }).warnings[0]).toMatch(/\?all/);
  });
});

describe("estimateSpfLookups", () => {
  it("charges 2 lookups per custom include", () => {
    expect(estimateSpfLookups({ includes: ["a.example.com"] })).toBe(2);
    expect(
      estimateSpfLookups({
        providers: ["ses"],
        includes: ["a.example.com", "b.example.com"],
      })
    ).toBe(5);
  });
});

describe("SPF tables", () => {
  it("has include: mechanisms and positive integer lookups for every provider", () => {
    const entries = Object.entries(SPF_PROVIDERS);
    expect(entries).toHaveLength(22);
    for (const [, provider] of entries) {
      expect(provider.mechanism.startsWith("include:")).toBe(true);
      expect(Number.isInteger(provider.lookups)).toBe(true);
      expect(provider.lookups).toBeGreaterThan(0);
    }
  });

  it("recommends only ~all", () => {
    expect(SPF_QUALIFIERS["~all"].recommended).toBe(true);
    expect(SPF_QUALIFIERS["-all"].recommended).toBeFalsy();
    expect(SPF_QUALIFIERS["?all"].recommended).toBeFalsy();
  });
});
