import { afterEach, describe, expect, it } from "vitest";
import { checkSpf } from "./spf.js";
import { nodeDns } from "../dns/node.js";
import { setDnsProvider } from "../dns/index.js";
import type { DnsProvider } from "../types.js";

const dnsProvider: DnsProvider = {
  resolveTxt: async (domain) => {
    if (domain === "plus-all.example.com") {
      return [["v=spf1 +all"]];
    }
    if (domain === "neutral.example.com") {
      return [["v=spf1 ?all"]];
    }
    return [];
  },
  resolveMx: async () => [],
  resolveA: async () => [],
  resolveAaaa: async () => [],
  resolvePtr: async () => [],
  resolveCaa: async () => [],
  resolveCname: async () => [],
};

afterEach(() => {
  setDnsProvider(nodeDns);
});

describe("checkSpf", () => {
  it("preserves a +all mechanism so callers can treat it as a critical failure", async () => {
    setDnsProvider(dnsProvider);

    const result = await checkSpf("plus-all.example.com");

    expect(result.allMechanism).toBe("+all");
    expect(result.valid).toBe(false);
    expect(result.syntaxErrors).toContain(
      "SPF ends with +all which allows anyone to send"
    );
  });

  it("preserves a ?all mechanism instead of collapsing it to +all", async () => {
    setDnsProvider(dnsProvider);

    const result = await checkSpf("neutral.example.com");

    expect(result.allMechanism).toBe("?all");
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      "SPF uses ?all (neutral) - consider using -all or ~all"
    );
  });
});
