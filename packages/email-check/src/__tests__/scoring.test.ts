import { describe, expect, it } from "vitest";

import {
  calculateScore,
  getGradeColor,
  getGradeDescription,
} from "../scoring.js";
import type { AllCheckResults } from "../scoring.js";

function createBaseChecks(): AllCheckResults {
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
          selector: "default",
          exists: true,
          record: "v=DKIM1; p=abc",
          valid: true,
          keyType: "rsa",
          keyBits: 2048,
          publicKey: "abc",
          testMode: false,
          revoked: false,
          expired: false,
          hashAlgorithms: ["sha256"],
          serviceTypes: ["email"],
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
      record: "v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@example.com",
      valid: true,
      policy: "quarantine",
      subdomainPolicy: "quarantine",
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
          exchange: "mx1.example.com",
          resolves: true,
          ipv4Addresses: ["203.0.113.10"],
          ipv6Addresses: [],
          isLocalhost: false,
          isIpAddress: false,
          reverseHostnames: ["mx1.example.com"],
        },
      ],
      hasRedundancy: false,
      warnings: [],
    },
    mxTls: {
      checked: false,
      skipped: true,
      skipReason: "not checked",
      servers: [],
    },
    mtaSts: {
      configured: false,
      dnsRecord: null,
      dnsRecordId: null,
      policyFetched: false,
      policyUrl: "",
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
      dmarcCompatible: false,
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
      allConfirm: false,
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
      overallClean: false,
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
  it("caps total bonuses at 20 points", () => {
    const checks = createBaseChecks();

    checks.dkim.selectors.push({
      selector: "backup",
      exists: true,
      record: "v=DKIM1; p=def",
      valid: true,
      keyType: "rsa",
      keyBits: 2048,
      publicKey: "def",
      testMode: false,
      revoked: false,
      expired: false,
      hashAlgorithms: ["sha256"],
      serviceTypes: ["email"],
      flags: [],
      errors: [],
      warnings: [],
    });
    checks.dmarc.alignmentSpf = "strict";
    checks.dmarc.alignmentDkim = "strict";
    checks.mx.hasRedundancy = true;
    checks.blacklist.overallClean = true;
    checks.mtaSts.configured = true;
    checks.mtaSts.policy = {
      version: "STSv1",
      mode: "enforce",
      maxAge: 86400,
      mxPatterns: ["mx1.example.com"],
    };
    checks.tlsRpt.configured = true;
    checks.bimi.configured = true;
    checks.bimi.dmarcCompatible = true;
    checks.bimi.logoAccessible = true;
    checks.bimi.vmcValid = true;
    checks.mxTls.checked = true;
    checks.mxTls.skipped = false;
    checks.mxTls.skipReason = null;
    checks.mxTls.servers = [
      {
        server: "mx1.example.com",
        port: 25,
        connected: true,
        connectionError: null,
        supportsStarttls: true,
        tlsVersions: ["TLSv1.2", "TLSv1.3"],
        preferredTlsVersion: "TLSv1.3",
        cipherSuite: "TLS_AES_256_GCM_SHA384",
        certificate: null,
        errors: [],
      },
    ];
    checks.dnssec.enabled = true;
    checks.dnssec.valid = true;
    checks.ipv6.mxHasIpv6 = true;
    checks.ipv6.spfIncludesIpv6 = true;
    checks.reverseDns.allConfirm = true;
    checks.domainAge.ageInDays = 400;
    checks.caa.configured = true;

    const result = calculateScore(checks);

    expect(result.finalScore).toBe(100);
    expect(result.rawScore).toBe(120);
    expect(result.grade).toBe("A");
    expect(result.breakdown.bonus.earned).toBe(20);
    expect(result.breakdown.bonus.possible).toBe(20);
    expect(result.bonuses.reduce((sum, bonus) => sum + bonus.points, 0)).toBe(34);
  });

  it("applies the reduced DKIM penalty for domains that appear to use AWS SES", () => {
    const checks = createBaseChecks();

    checks.spf.includes = ["include:amazonses.com"];
    checks.dkim.found = false;
    checks.dkim.selectors = [];
    checks.dkim.selectorsChecked = 0;
    checks.dkim.earlyExit = false;

    const result = calculateScore(checks);

    expect(result.finalScore).toBe(95);
    expect(result.grade).toBe("A");
    expect(result.breakdown.dkim.score).toBe(20);
    expect(result.deductions).toContainEqual({
      check: "dkim",
      points: 5,
      reason:
        "DKIM not verifiable (AWS SES uses random selectors). Send a test email to verify DKIM configuration.",
    });
  });

  it("stacks SPF softfail, lookup overflow, and ptr deductions", () => {
    const checks = createBaseChecks();

    checks.spf.allMechanism = "~all";
    checks.spf.lookupCount = 11;
    checks.spf.hasPtr = true;

    const result = calculateScore(checks);

    expect(result.finalScore).toBe(83);
    expect(result.grade).toBe("B");
    expect(result.breakdown.spf.score).toBe(13);
    expect(result.deductions).toEqual(
      expect.arrayContaining([
        {
          check: "spf",
          points: 5,
          reason: "SPF ~all (softfail) instead of -all",
        },
        {
          check: "spf",
          points: 10,
          reason: "SPF exceeds 10 lookups (11)",
        },
        {
          check: "spf",
          points: 2,
          reason: "SPF uses deprecated ptr mechanism",
        },
      ])
    );
  });

  it("penalizes weak DKIM keys and test mode while still crediting selector redundancy", () => {
    const checks = createBaseChecks();

    checks.dkim.selectors = [
      {
        selector: "default",
        exists: true,
        record: "v=DKIM1; t=y; p=abc",
        valid: true,
        keyType: "rsa",
        keyBits: 512,
        publicKey: "abc",
        testMode: true,
        revoked: false,
        expired: false,
        hashAlgorithms: ["sha256"],
        serviceTypes: ["email"],
        flags: ["y"],
        errors: [],
        warnings: [],
      },
      {
        selector: "backup",
        exists: true,
        record: "v=DKIM1; p=def",
        valid: true,
        keyType: "rsa",
        keyBits: 2048,
        publicKey: "def",
        testMode: false,
        revoked: false,
        expired: false,
        hashAlgorithms: ["sha256"],
        serviceTypes: ["email"],
        flags: [],
        errors: [],
        warnings: [],
      },
    ];

    const result = calculateScore(checks);

    expect(result.finalScore).toBe(72);
    expect(result.grade).toBe("C");
    expect(result.breakdown.dkim.score).toBe(0);
    expect(result.deductions).toEqual(
      expect.arrayContaining([
        {
          check: "dkim",
          points: 20,
          reason: "DKIM key too weak (512 bits)",
        },
        {
          check: "dkim",
          points: 10,
          reason: "DKIM in testing mode (t=y)",
        },
      ])
    );
    expect(result.bonuses).toContainEqual({
      check: "dkim",
      points: 2,
      reason: "2 valid DKIM selectors",
    });
  });

  it("clamps catastrophic failures to a zero final score", () => {
    const checks = createBaseChecks();

    checks.spf.exists = false;
    checks.dkim.found = false;
    checks.dkim.selectors = [];
    checks.dmarc.exists = false;
    checks.mx.exists = false;
    checks.mx.records = [];
    checks.blacklist.domainChecks.listed = [
      {
        blacklist: "Spamhaus DBL",
        zone: "dbl.spamhaus.org",
        priority: "critical",
        type: "domain",
        target: "example.com",
        returnCode: "127.0.1.2",
        meaning: "Listed",
        delistUrl: null,
      },
    ];
    checks.reverseDns.allHavePtr = false;
    checks.dnssec.enabled = true;
    checks.dnssec.valid = false;
    checks.domainAge.ageInDays = 10;

    const result = calculateScore(checks);

    expect(result.rawScore).toBe(-30);
    expect(result.finalScore).toBe(0);
    expect(result.grade).toBe("F");
    expect(result.deductions).toEqual(
      expect.arrayContaining([
        { check: "spf", points: 30, reason: "No SPF record" },
        { check: "dkim", points: 25, reason: "No DKIM record found" },
        { check: "dmarc", points: 20, reason: "No DMARC record" },
        { check: "mx", points: 5, reason: "No MX records" },
        { check: "ptr", points: 5, reason: "Missing reverse DNS" },
        { check: "dnssec", points: 5, reason: "DNSSEC broken" },
        { check: "domain-age", points: 10, reason: "Domain less than 30 days old" },
      ])
    );
    expect(
      result.deductions.some(
        (deduction) =>
          deduction.check === "blacklist" && deduction.reason === "Listed on Spamhaus DBL"
      )
    ).toBe(true);
  });
});

describe("grade helpers", () => {
  it("maps grades to terminal colors", () => {
    expect(getGradeColor("A")).toBe("green");
    expect(getGradeColor("C")).toBe("yellow");
    expect(getGradeColor("D")).toBe("orange");
    expect(getGradeColor("unknown")).toBe("red");
  });

  it("returns descriptive copy for known and unknown grades", () => {
    expect(getGradeDescription("B")).toBe(
      "Good - all critical checks pass, minor improvements possible"
    );
    expect(getGradeDescription("F")).toBe(
      "Failing - critical issues, emails likely going to spam"
    );
    expect(getGradeDescription("unknown")).toBe("Unknown");
  });
});
