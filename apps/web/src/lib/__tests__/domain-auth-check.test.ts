/**
 * Unit tests for the live DNS comparison behind the Sending Domains detail
 * sheet. Uses a hand-built fake DnsProvider — no real DNS lookup is ever made.
 * A lookup that throws must surface as "unknown", never "missing": a resolver
 * timeout is not evidence that a record was removed.
 */

import type { DnsProvider } from "@wraps.dev/email-check";
import { describe, expect, it, vi } from "vitest";
import type { SendingDomain } from "@/actions/domains";
import { checkDomainAuthRecords } from "../domain-auth-check";

function domain(overrides: Partial<SendingDomain> = {}): SendingDomain {
  return {
    identity: "example.com",
    identityType: "DOMAIN",
    verifiedForSending: true,
    verificationStatus: "SUCCESS",
    dkim: { status: "SUCCESS", tokens: ["tok1"] },
    mailFromDomain: { domain: "mail.example.com", status: "SUCCESS" },
    configurationSet: null,
    awsAccountId: "acct-1",
    region: "us-east-1",
    ...overrides,
  };
}

const DKIM_VALUE = "tok1.dkim.amazonses.com";
const MX_HOST = "feedback-smtp.us-east-1.amazonses.com";

function fakeProvider(overrides: Partial<DnsProvider> = {}): DnsProvider {
  return {
    resolveTxt: vi.fn(async (name: string) =>
      name === "_dmarc.example.com"
        ? [["v=DMARC1; p=none"]]
        : [["v=spf1 include:amazonses.com ~all"]]
    ),
    resolveMx: vi.fn(async () => [{ exchange: MX_HOST, priority: 10 }]),
    resolveA: vi.fn(async () => []),
    resolveAaaa: vi.fn(async () => []),
    resolvePtr: vi.fn(async () => []),
    resolveCaa: vi.fn(async () => []),
    resolveCname: vi.fn(async () => [DKIM_VALUE]),
    ...overrides,
  };
}

function byKind(
  results: Awaited<ReturnType<typeof checkDomainAuthRecords>>,
  kind: string
) {
  const found = results.find((r) => r.kind === kind);
  if (!found) throw new Error(`no ${kind} result`);
  return found;
}

describe("checkDomainAuthRecords", () => {
  describe("dkim", () => {
    it("is verified on an exact value match", async () => {
      const results = await checkDomainAuthRecords(domain(), fakeProvider());
      const dkim = byKind(results, "dkim");
      expect(dkim.status).toBe("verified");
      expect(dkim.name).toBe("tok1._domainkey.example.com");
      expect(dkim.found).toEqual([DKIM_VALUE]);
    });

    it("is verified when the value has a trailing dot", async () => {
      const provider = fakeProvider({
        resolveCname: vi.fn(async () => [`${DKIM_VALUE}.`]),
      });
      const results = await checkDomainAuthRecords(domain(), provider);
      expect(byKind(results, "dkim").status).toBe("verified");
    });

    it("is incorrect when the CNAME points elsewhere", async () => {
      const provider = fakeProvider({
        resolveCname: vi.fn(async () => ["other.example.net"]),
      });
      const results = await checkDomainAuthRecords(domain(), provider);
      const dkim = byKind(results, "dkim");
      expect(dkim.status).toBe("incorrect");
      expect(dkim.found).toEqual(["other.example.net"]);
    });

    it("is missing when nothing resolves", async () => {
      const provider = fakeProvider({ resolveCname: vi.fn(async () => []) });
      const results = await checkDomainAuthRecords(domain(), provider);
      const dkim = byKind(results, "dkim");
      expect(dkim.status).toBe("missing");
      expect(dkim.found).toEqual([]);
    });
  });

  describe("mailfrom_mx", () => {
    it("is verified with a trailing dot on the exchange", async () => {
      const provider = fakeProvider({
        resolveMx: vi.fn(async () => [
          { exchange: `${MX_HOST}.`, priority: 10 },
        ]),
      });
      const results = await checkDomainAuthRecords(domain(), provider);
      expect(byKind(results, "mailfrom_mx").status).toBe("verified");
    });

    it("is incorrect when the exchange is the wrong host", async () => {
      const provider = fakeProvider({
        resolveMx: vi.fn(async () => [
          { exchange: "mx.other.example.net", priority: 10 },
        ]),
      });
      const results = await checkDomainAuthRecords(domain(), provider);
      expect(byKind(results, "mailfrom_mx").status).toBe("incorrect");
    });
  });

  describe("mailfrom_spf", () => {
    it("is verified from a TXT record split into chunks", async () => {
      const provider = fakeProvider({
        resolveTxt: vi.fn(async (name: string) =>
          name === "_dmarc.example.com"
            ? [["v=DMARC1; p=none"]]
            : [["v=spf1 include:amazon", "ses.com ~all"]]
        ),
      });
      const results = await checkDomainAuthRecords(domain(), provider);
      const spf = byKind(results, "mailfrom_spf");
      expect(spf.status).toBe("verified");
      expect(spf.found).toEqual(["v=spf1 include:amazonses.com ~all"]);
    });

    it("is incorrect when SPF exists without amazonses", async () => {
      const provider = fakeProvider({
        resolveTxt: vi.fn(async (name: string) =>
          name === "_dmarc.example.com"
            ? [["v=DMARC1; p=none"]]
            : [["v=spf1 include:_spf.google.com ~all"]]
        ),
      });
      const results = await checkDomainAuthRecords(domain(), provider);
      expect(byKind(results, "mailfrom_spf").status).toBe("incorrect");
    });
  });

  describe("dmarc", () => {
    it("is verified when a v=DMARC1 record exists", async () => {
      const results = await checkDomainAuthRecords(domain(), fakeProvider());
      const dmarc = byKind(results, "dmarc");
      expect(dmarc.status).toBe("verified");
      expect(dmarc.name).toBe("_dmarc.example.com");
    });

    it("is missing when there is no DMARC record", async () => {
      const provider = fakeProvider({
        resolveTxt: vi.fn(async (name: string) =>
          name === "_dmarc.example.com"
            ? []
            : [["v=spf1 include:amazonses.com ~all"]]
        ),
      });
      const results = await checkDomainAuthRecords(domain(), provider);
      expect(byKind(results, "dmarc").status).toBe("missing");
    });
  });

  it("marks a timed-out lookup unknown and still resolves the others", async () => {
    const provider = fakeProvider({
      resolveTxt: vi.fn(async (name: string) => {
        if (name === "_dmarc.example.com") {
          throw new Error("DNS TXT lookup for x timed out after 5000ms");
        }
        return [["v=spf1 include:amazonses.com ~all"]];
      }),
    });
    const results = await checkDomainAuthRecords(domain(), provider);
    const dmarc = byKind(results, "dmarc");
    expect(dmarc.status).toBe("unknown");
    expect(dmarc.found).toEqual([]);
    expect(byKind(results, "dkim").status).toBe("verified");
    expect(byKind(results, "mailfrom_mx").status).toBe("verified");
    expect(byKind(results, "mailfrom_spf").status).toBe("verified");
  });

  it("returns no records for an email-address identity", async () => {
    const provider = fakeProvider();
    const results = await checkDomainAuthRecords(
      domain({ identityType: "EMAIL_ADDRESS", identity: "a@example.com" }),
      provider
    );
    expect(results).toEqual([]);
    expect(provider.resolveCname).not.toHaveBeenCalled();
  });

  it("emits only dkim and dmarc rows without a MAIL FROM domain", async () => {
    const results = await checkDomainAuthRecords(
      domain({ mailFromDomain: null }),
      fakeProvider()
    );
    expect(results.map((r) => r.kind).sort()).toEqual(["dkim", "dmarc"]);
  });
});
