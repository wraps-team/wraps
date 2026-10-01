import { describe, expect, it } from "vitest";
import {
  buildDmarcRecord,
  DEFAULT_DMARC_INPUT,
  type DmarcInput,
  normalizeDomain,
} from "@/lib/dmarc-builder";

function input(overrides: Partial<DmarcInput> = {}): DmarcInput {
  return { ...DEFAULT_DMARC_INPUT, domain: "example.com", ...overrides };
}

const ids = (overrides: Partial<DmarcInput>) =>
  buildDmarcRecord(input(overrides)).warnings.map((w) => w.id);

describe("record string", () => {
  it("builds the minimal monitoring record", () => {
    expect(buildDmarcRecord(input()).value).toBe("v=DMARC1; p=none");
  });

  it("builds p=none with a report address", () => {
    expect(buildDmarcRecord(input({ rua: "dmarc@example.com" })).value).toBe(
      "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
    );
  });

  it("builds quarantine and reject", () => {
    expect(buildDmarcRecord(input({ policy: "quarantine" })).value).toBe(
      "v=DMARC1; p=quarantine"
    );
    expect(buildDmarcRecord(input({ policy: "reject" })).value).toBe(
      "v=DMARC1; p=reject"
    );
  });

  it("emits every tag in the documented order", () => {
    const { value } = buildDmarcRecord(
      input({
        policy: "reject",
        subdomainPolicy: "quarantine",
        nonExistentSubdomainPolicy: "reject",
        testing: true,
        adkim: "s",
        aspf: "s",
        rua: "a@example.com, b@example.com",
        ruf: "f@example.com",
        fo: "1",
      })
    );
    expect(value).toBe(
      "v=DMARC1; p=reject; sp=quarantine; np=reject; t=y; adkim=s; aspf=s; rua=mailto:a@example.com,mailto:b@example.com; ruf=mailto:f@example.com; fo=1"
    );
  });

  it("omits relaxed alignment and emits only the strict one", () => {
    expect(buildDmarcRecord(input({ adkim: "s" })).value).toBe(
      "v=DMARC1; p=none; adkim=s"
    );
    expect(buildDmarcRecord(input({ aspf: "s" })).value).toBe(
      "v=DMARC1; p=none; aspf=s"
    );
  });

  it("omits fo unless a valid ruf is present", () => {
    expect(buildDmarcRecord(input({ fo: "1" })).value).not.toContain("fo=");
    expect(
      buildDmarcRecord(input({ ruf: "not-an-address", fo: "1" })).value
    ).not.toContain("fo=");
  });

  it("accepts mailto: prefixed addresses without doubling the prefix", () => {
    expect(
      buildDmarcRecord(input({ rua: "mailto:dmarc@example.com" })).value
    ).toBe("v=DMARC1; p=none; rua=mailto:dmarc@example.com");
  });

  it("never emits pct, ri or rf in any combination", () => {
    const policies = ["none", "quarantine", "reject"] as const;
    for (const policy of policies) {
      for (const testing of [true, false]) {
        for (const strict of ["r", "s"] as const) {
          const { value } = buildDmarcRecord(
            input({
              policy,
              testing,
              adkim: strict,
              aspf: strict,
              subdomainPolicy: "reject",
              nonExistentSubdomainPolicy: "reject",
              rua: "a@example.com",
              ruf: "b@example.com",
              fo: "d",
            })
          );
          expect(value).not.toMatch(/(^|;\s*)(pct|ri|rf)=/);
        }
      }
    }
  });
});

describe("record name", () => {
  it("emits _dmarc.<domain> for a valid domain", () => {
    expect(buildDmarcRecord(input()).name).toBe("_dmarc.example.com");
  });

  it("normalizes case, trailing dot and a pasted _dmarc prefix", () => {
    expect(normalizeDomain(" _dmarc.Example.COM. ")).toBe("example.com");
  });

  it("returns null for a missing or invalid domain", () => {
    expect(buildDmarcRecord(input({ domain: "" })).name).toBeNull();
    expect(
      buildDmarcRecord(input({ domain: "https://x.com/a" })).name
    ).toBeNull();
  });
});

describe("warnings", () => {
  it("warns that p=none is monitoring only, and only for none", () => {
    expect(ids({ policy: "none" })).toContain("monitoring-only");
    expect(ids({ policy: "reject" })).not.toContain("monitoring-only");
    expect(ids({ policy: "quarantine" })).not.toContain("monitoring-only");
  });

  it("gives the progression advice in the monitoring warning", () => {
    const warning = buildDmarcRecord(input()).warnings.find(
      (w) => w.id === "monitoring-only"
    );
    expect(warning?.message).toContain("quarantine");
    expect(warning?.message).toContain("reject");
  });

  it("warns about enforcing as a first step for quarantine and reject only", () => {
    expect(ids({ policy: "reject" })).toContain("enforcing-first-step");
    expect(ids({ policy: "quarantine" })).toContain("enforcing-first-step");
    expect(ids({ policy: "none" })).not.toContain("enforcing-first-step");
  });

  it("warns on sp=none only while p is enforcing", () => {
    expect(ids({ policy: "reject", subdomainPolicy: "none" })).toContain(
      "subdomain-weaker"
    );
    expect(ids({ policy: "none", subdomainPolicy: "none" })).not.toContain(
      "subdomain-weaker"
    );
    expect(ids({ policy: "reject", subdomainPolicy: "reject" })).not.toContain(
      "subdomain-weaker"
    );
  });

  it("warns on t=y only with an enforcing policy", () => {
    expect(ids({ policy: "quarantine", testing: true })).toContain(
      "testing-with-enforcement"
    );
    expect(ids({ policy: "none", testing: true })).not.toContain(
      "testing-with-enforcement"
    );
    expect(ids({ policy: "reject", testing: false })).not.toContain(
      "testing-with-enforcement"
    );
  });

  it("suggests np=reject for enforcing policies without np", () => {
    expect(ids({ policy: "reject" })).toContain("no-np");
    expect(
      ids({ policy: "reject", nonExistentSubdomainPolicy: "reject" })
    ).not.toContain("no-np");
    expect(ids({ policy: "none" })).not.toContain("no-np");
  });

  it("warns when there is no rua, and not when there is", () => {
    expect(ids({ rua: "" })).toContain("no-rua");
    expect(ids({ rua: "d@example.com" })).not.toContain("no-rua");
  });

  it("excludes an invalid rua, warns, and treats it as no rua", () => {
    const result = buildDmarcRecord(input({ rua: "nope, ok@example.com" }));
    expect(result.value).toBe("v=DMARC1; p=none; rua=mailto:ok@example.com");
    expect(result.warnings.map((w) => w.id)).toContain("invalid-rua");
    expect(ids({ rua: "nope" })).toEqual(
      expect.arrayContaining(["invalid-rua", "no-rua"])
    );
  });

  it("excludes an invalid ruf and warns", () => {
    const result = buildDmarcRecord(input({ ruf: "bad@", fo: "1" }));
    expect(result.value).not.toContain("ruf=");
    expect(result.warnings.map((w) => w.id)).toContain("invalid-ruf");
  });

  it("flags an external report domain with the authorization record name", () => {
    const result = buildDmarcRecord(input({ rua: "r@reports.vendor.io" }));
    const warning = result.warnings.find(
      (w) => w.id === "external-report-domain"
    );
    expect(warning?.message).toContain(
      "example.com._report._dmarc.reports.vendor.io"
    );
  });

  it("does not flag same-domain or subdomain report addresses", () => {
    expect(ids({ rua: "d@example.com" })).not.toContain(
      "external-report-domain"
    );
    expect(ids({ rua: "d@mail.example.com" })).not.toContain(
      "external-report-domain"
    );
  });

  it("does not flag external domains when no domain is entered", () => {
    expect(ids({ domain: "", rua: "r@vendor.io" })).not.toContain(
      "external-report-domain"
    );
  });
});
