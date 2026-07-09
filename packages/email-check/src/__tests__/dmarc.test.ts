import { afterEach, describe, expect, it } from "vitest";
import { checkDmarc } from "../checks/dmarc.js";
import { nodeDns, setDnsProvider } from "../dns/index.js";
import type { DnsProvider } from "../types.js";

/** Inject a DNS provider that serves the given TXT records by name. */
function mockDns(records: Record<string, string[]>): void {
  const provider: DnsProvider = {
    resolveTxt: (domain: string) =>
      Promise.resolve((records[domain] ?? []).map((r) => [r])),
    resolveMx: () => Promise.resolve([]),
    resolveA: () => Promise.resolve([]),
    resolveAaaa: () => Promise.resolve([]),
    resolvePtr: () => Promise.resolve([]),
    resolveCaa: () => Promise.resolve([]),
    resolveCname: () => Promise.resolve([]),
  };
  setDnsProvider(provider);
}

afterEach(() => {
  setDnsProvider(nodeDns);
});

describe("DMARCbis parsing", () => {
  it("parses np, t, and psd tags", async () => {
    mockDns({
      "_dmarc.example.com": [
        "v=DMARC1; p=reject; sp=reject; np=reject; t=n; psd=n; rua=mailto:dmarc@example.com",
      ],
    });

    const result = await checkDmarc("example.com");

    expect(result.valid).toBe(true);
    expect(result.policy).toBe("reject");
    expect(result.nonExistentSubdomainPolicy).toBe("reject");
    expect(result.testing).toBe(false);
    expect(result.psd).toBe("n");
  });

  it("flags t=y as testing (policy not enforced)", async () => {
    mockDns({
      "_dmarc.example.com": [
        "v=DMARC1; p=reject; t=y; rua=mailto:dmarc@example.com",
      ],
    });

    const result = await checkDmarc("example.com");

    expect(result.testing).toBe(true);
    expect(result.warnings.some((w) => w.includes("t=y"))).toBe(true);
  });

  it("recommends np= when enforcing but np is absent", async () => {
    mockDns({
      "_dmarc.example.com": [
        "v=DMARC1; p=quarantine; rua=mailto:d@example.com",
      ],
    });

    const result = await checkDmarc("example.com");

    expect(result.nonExistentSubdomainPolicy).toBeNull();
    expect(result.warnings.some((w) => w.includes("np="))).toBe(true);
  });

  it("marks pct as deprecated instead of a sampling knob", async () => {
    mockDns({
      "_dmarc.example.com": [
        "v=DMARC1; p=quarantine; pct=25; rua=mailto:d@example.com",
      ],
    });

    const result = await checkDmarc("example.com");

    expect(result.percentage).toBe(25);
    expect(
      result.warnings.some((w) => w.toLowerCase().includes("deprecated"))
    ).toBe(true);
  });

  it("rejects an invalid np value with a warning", async () => {
    mockDns({
      "_dmarc.example.com": [
        "v=DMARC1; p=reject; np=bogus; rua=mailto:d@example.com",
      ],
    });

    const result = await checkDmarc("example.com");

    expect(result.nonExistentSubdomainPolicy).toBeNull();
    expect(result.warnings.some((w) => w.includes("np"))).toBe(true);
  });
});
