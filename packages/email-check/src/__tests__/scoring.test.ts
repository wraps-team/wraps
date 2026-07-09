import { describe, expect, it } from "vitest";
import type { AllCheckResults } from "../scoring.js";
import {
  calculateScore,
  getGradeColor,
  getGradeDescription,
} from "../scoring.js";

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
  it("caps total bonuses at 10 points within the band", () => {
    const checks = createBaseChecks();

    // Add a second DKIM selector for the bonus
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

    // Grade A band: 90-100. No deductions, so starts at 100.
    // Many bonuses earned but capped at 10 within-band.
    // Score is clamped to band max (100).
    expect(result.finalScore).toBe(100);
    expect(result.grade).toBe("A");
    expect(result.breakdown.bonus.possible).toBe(10);
    expect(result.breakdown.bonus.earned).toBe(10);
    // Raw bonuses exceed 10
    expect(
      result.bonuses.reduce((sum, bonus) => sum + bonus.points, 0)
    ).toBeGreaterThan(10);
  });

  it("applies the reduced DKIM penalty for domains that appear to use AWS SES", () => {
    const checks = createBaseChecks();

    checks.spf.includes = ["include:amazonses.com"];
    checks.dkim.found = false;
    checks.dkim.selectors = [];
    checks.dkim.selectorsChecked = 0;
    checks.dkim.earlyExit = false;

    const result = calculateScore(checks);

    // DKIM assessed as "weak" (not "missing") for SES → still grade B (all three present)
    // Band B: 80-89, starts at 89. Deduction: 2pts for SES DKIM.
    expect(result.grade).toBe("B");
    expect(result.deductions).toContainEqual(
      expect.objectContaining({
        check: "dkim",
        points: 2,
        reason: expect.stringContaining("DKIM not verifiable"),
      })
    );
  });

  it("stacks SPF softfail, lookup overflow, and ptr deductions", () => {
    const checks = createBaseChecks();

    checks.spf.allMechanism = "~all";
    checks.spf.lookupCount = 11;
    checks.spf.hasPtr = true;

    const result = calculateScore(checks);

    // Grade A (SPF present + DKIM present + DMARC enforcing). Band: 90-100.
    // Deductions: ~all (2) + lookups (3) + ptr (1) = 6. Score: 100 - 6 = 94.
    expect(result.grade).toBe("A");
    expect(result.finalScore).toBe(94);
    expect(result.deductions).toEqual(
      expect.arrayContaining([
        {
          check: "spf",
          points: 2,
          reason: "SPF ~all (softfail) instead of -all (hardfail)",
        },
        {
          check: "spf",
          points: 3,
          reason: "SPF exceeds 10 DNS lookups (11)",
        },
        {
          check: "spf",
          points: 1,
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

    // First valid non-revoked selector is "default" (512-bit, test mode).
    // Deductions: weak key (4) + test mode (3) = 7. Band A starts at 100. Score: 100 - 7 + bonus(1 for 2 selectors, capped) = 94.
    expect(result.grade).toBe("A");
    expect(result.finalScore).toBe(94);
    expect(result.deductions).toEqual(
      expect.arrayContaining([
        {
          check: "dkim",
          points: 4,
          reason: "DKIM key too weak (512 bits)",
        },
        {
          check: "dkim",
          points: 3,
          reason: "DKIM in testing mode (t=y)",
        },
      ])
    );
    expect(result.bonuses).toContainEqual({
      check: "dkim",
      points: 1,
      reason: "2 valid DKIM selectors",
    });
  });

  it("clamps catastrophic failures to the F band floor", () => {
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

    // Spamhaus listing → grade F. Band: 0-34.
    // Deductions: spf(5) + dkim(5) + dmarc(5) + mx(2) + blacklist(5) + ptr(2) + dnssec(2) + age(3) = 29.
    // Score: 34 - 29 = 5. Clamped within band [0, 34].
    expect(result.finalScore).toBe(5);
    expect(result.grade).toBe("F");
    expect(result.deductions).toEqual(
      expect.arrayContaining([
        { check: "spf", points: 5, reason: "No SPF record" },
        { check: "dkim", points: 5, reason: "No DKIM record found" },
        { check: "dmarc", points: 5, reason: "No DMARC record" },
        { check: "mx", points: 2, reason: "No MX records" },
        { check: "ptr", points: 2, reason: "Missing reverse DNS" },
        { check: "dnssec", points: 2, reason: "DNSSEC broken" },
        {
          check: "domain-age",
          points: 3,
          reason: "Domain less than 30 days old",
        },
      ])
    );
    expect(
      result.deductions.some(
        (deduction) =>
          deduction.check === "blacklist" &&
          deduction.reason === "Listed on Spamhaus DBL"
      )
    ).toBe(true);
  });
});

describe("DMARCbis scoring", () => {
  it("rewards np=reject with a bonus when enforcing", () => {
    const checks = createBaseChecks();
    checks.dmarc.nonExistentSubdomainPolicy = "reject";

    const result = calculateScore(checks);

    expect(
      result.bonuses.some(
        (bonus) => bonus.check === "dmarc" && bonus.reason.includes("np=reject")
      )
    ).toBe(true);
  });

  it("penalizes DMARC testing mode (t=y) while a policy is set", () => {
    const checks = createBaseChecks();
    checks.dmarc.testing = true;

    const result = calculateScore(checks);

    expect(
      result.deductions.some(
        (deduction) =>
          deduction.check === "dmarc" && deduction.reason.includes("testing")
      )
    ).toBe(true);
  });

  it("treats pct<100 as a deprecation nudge, not a hard penalty", () => {
    const checks = createBaseChecks();
    checks.dmarc.percentage = 25;

    const result = calculateScore(checks);

    const pctDeduction = result.deductions.find(
      (deduction) =>
        deduction.check === "dmarc" && deduction.reason.includes("pct")
    );
    expect(pctDeduction?.points).toBe(1);
    expect(pctDeduction?.reason).toContain("deprecated");
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
      "All three records present, but DMARC not enforcing"
    );
    expect(getGradeDescription("F")).toBe(
      "No email authentication — anyone can spoof your domain"
    );
    expect(getGradeDescription("unknown")).toBe("Unknown");
  });
});
