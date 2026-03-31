import { describe, expect, it } from "vitest";
import {
  calculateScore,
  getGradeColor,
  getGradeDescription,
  type AllCheckResults,
} from "./scoring.js";

function createChecks(): AllCheckResults {
  return {
    spf: {
      exists: true,
      record: "v=spf1 -all",
      records: ["v=spf1 -all"],
      multipleRecords: false,
      valid: true,
      syntaxErrors: [],
      warnings: [],
      lookupCount: 0,
      lookupLimit: 10,
      lookupTree: [],
      allMechanism: "-all",
      includes: [],
      hasPtr: false,
      hasDuplicates: false,
      hasCircularInclude: false,
      recordLength: 11,
      usesMacros: false,
      macros: [],
    },
    dkim: {
      found: true,
      selectors: [
        {
          selector: "google",
          exists: true,
          record: "v=DKIM1; k=rsa; p=abc",
          valid: true,
          keyType: "rsa",
          keyBits: 2048,
          publicKey: "abc",
          testMode: false,
          revoked: false,
          expired: false,
          hashAlgorithms: ["sha256"],
          serviceTypes: ["*"],
          flags: [],
          errors: [],
          warnings: [],
        },
      ],
      selectorsChecked: 1,
      earlyExit: true,
      warnings: [],
    },
    dmarc: {
      exists: true,
      record: "v=DMARC1; p=reject; rua=mailto:dmarc@example.com",
      valid: true,
      policy: "reject",
      subdomainPolicy: null,
      percentage: 100,
      reportingEnabled: true,
      ruaAddresses: ["mailto:dmarc@example.com"],
      rufAddresses: [],
      alignmentSpf: "relaxed",
      alignmentDkim: "relaxed",
      failureOptions: "0",
      reportInterval: 86400,
      reportFormat: "afrf",
      errors: [],
      warnings: [],
    },
    mx: {
      exists: true,
      records: [
        {
          priority: 10,
          exchange: "mx.example.com",
          resolves: true,
          ipv4Addresses: ["203.0.113.10"],
          ipv6Addresses: [],
          isLocalhost: false,
          isIpAddress: false,
          reverseHostnames: ["mx.example.com"],
        },
      ],
      hasRedundancy: false,
      warnings: [],
    },
    mxTls: {
      checked: false,
      skipped: true,
      skipReason: "test",
      servers: [],
    },
    mtaSts: {
      configured: false,
      dnsRecord: null,
      dnsRecordId: null,
      policyFetched: false,
      policyUrl: "https://mta-sts.example.com/.well-known/mta-sts.txt",
      policy: null,
      mxPatternsMatch: false,
      errors: [],
      warnings: [],
    },
    tlsRpt: {
      configured: false,
      record: null,
      version: null,
      reportingUris: [],
      errors: [],
    },
    bimi: {
      configured: false,
      record: null,
      logoUrl: null,
      vmcUrl: null,
      logoAccessible: false,
      logoValid: false,
      vmcAccessible: false,
      vmcValid: false,
      dmarcCompatible: true,
      errors: [],
      warnings: [],
    },
    dnssec: {
      enabled: false,
      valid: false,
      validationMethod: "system-resolver",
      chainOfTrust: [],
      algorithm: null,
      keyTag: null,
      errors: [],
    },
    ipv6: {
      mxHasIpv6: false,
      mxIpv6Addresses: [],
      ipv6Connectable: false,
      spfIncludesIpv6: false,
      warnings: [],
    },
    reverseDns: {
      results: [],
      allHavePtr: true,
      allConfirm: true,
      warnings: [],
    },
    blacklist: {
      domainChecks: {
        checked: 0,
        listed: [],
        clean: [],
        errors: [],
        timeouts: [],
      },
      ipChecks: {
        checked: 0,
        listed: [],
        clean: [],
        errors: [],
        timeouts: [],
      },
      overallClean: true,
      quickMode: false,
    },
    domainAge: {
      createdAt: null,
      expiresAt: null,
      updatedAt: null,
      ageInDays: null,
      daysUntilExpiry: null,
      registrar: null,
      registrantOrganization: null,
      registrantCountry: null,
      nameservers: [],
      dnssecEnabled: false,
      source: "unavailable",
      privacyEnabled: false,
      errors: [],
    },
    caa: {
      configured: false,
      records: [],
      allowedIssuers: [],
      allowedWildcardIssuers: [],
      reportingConfigured: false,
      iodefUri: null,
    },
  };
}

describe("calculateScore", () => {
  it("keeps fully authenticated domains in the A band", () => {
    const checks = createChecks();

    checks.mx.exists = false;
    checks.mx.records = [];
    checks.dkim.selectors[0] = {
      ...checks.dkim.selectors[0],
      keyBits: 512,
      testMode: true,
    };
    checks.dmarc.reportingEnabled = false;
    checks.reverseDns.allHavePtr = false;
    checks.reverseDns.allConfirm = false;
    checks.dnssec.enabled = true;
    checks.dnssec.valid = false;
    checks.domainAge.ageInDays = 10;

    const result = calculateScore(checks);

    expect(result.grade).toBe("A");
    expect(result.rawScore).toBeLessThan(90);
    expect(result.finalScore).toBe(90);
  });

  it("downgrades neutral SPF to a B even when DKIM and DMARC are present", () => {
    const checks = createChecks();

    checks.spf.record = "v=spf1 ?all";
    checks.spf.records = ["v=spf1 ?all"];
    checks.spf.allMechanism = "?all";

    const result = calculateScore(checks);

    expect(result.grade).toBe("B");
    expect(result.finalScore).toBeGreaterThanOrEqual(80);
    expect(result.finalScore).toBeLessThanOrEqual(89);
    expect(getGradeColor(result.grade)).toBe("yellow");
    expect(getGradeDescription(result.grade)).toBe(
      "All three records present, but DMARC not enforcing"
    );
  });

  it("treats undiscoverable AWS SES DKIM as present enough for a B grade", () => {
    const checks = createChecks();

    checks.spf.includes = ["include:amazonses.com"];
    checks.dkim.found = false;
    checks.dkim.selectors = [];
    checks.dkim.selectorsChecked = 25;
    checks.dkim.earlyExit = false;

    const result = calculateScore(checks);

    expect(result.grade).toBe("B");
    expect(result.finalScore).toBeGreaterThanOrEqual(80);
    expect(result.finalScore).toBeLessThanOrEqual(89);
    expect(result.deductions).toContainEqual({
      check: "dkim",
      points: 2,
      reason:
        "DKIM not verifiable (AWS SES uses random selectors). Send a test email to verify.",
    });
  });

  it("returns C when one authentication record is missing", () => {
    const checks = createChecks();

    checks.dmarc.exists = false;
    checks.dmarc.record = null;
    checks.dmarc.valid = false;
    checks.dmarc.policy = null;
    checks.dmarc.reportingEnabled = false;
    checks.dmarc.ruaAddresses = [];

    const result = calculateScore(checks);

    expect(result.grade).toBe("C");
    expect(result.finalScore).toBeGreaterThanOrEqual(65);
    expect(result.finalScore).toBeLessThanOrEqual(79);
  });

  it("returns D when only one authentication record is present", () => {
    const checks = createChecks();

    checks.spf.exists = false;
    checks.spf.record = null;
    checks.spf.records = [];
    checks.spf.valid = false;
    checks.spf.allMechanism = null;
    checks.dkim.found = false;
    checks.dkim.selectors = [];
    checks.dkim.selectorsChecked = 0;
    checks.dkim.earlyExit = false;

    const result = calculateScore(checks);

    expect(result.grade).toBe("D");
    expect(result.finalScore).toBeGreaterThanOrEqual(35);
    expect(result.finalScore).toBeLessThanOrEqual(64);
  });

  it("returns F for permissive SPF +all even with other auth configured", () => {
    const checks = createChecks();

    checks.spf.record = "v=spf1 +all";
    checks.spf.records = ["v=spf1 +all"];
    checks.spf.valid = false;
    checks.spf.allMechanism = "+all";
    checks.spf.syntaxErrors = ["SPF ends with +all which allows anyone to send"];

    const result = calculateScore(checks);

    expect(result.grade).toBe("F");
    expect(result.finalScore).toBeLessThanOrEqual(34);
  });
});
