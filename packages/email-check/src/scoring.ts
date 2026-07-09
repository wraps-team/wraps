/**
 * Scoring System
 *
 * Grade is determined by the auth triad (SPF, DKIM, DMARC) status.
 * Score is placed within the grade's band based on secondary factors.
 *
 * Grade tiers:
 *   A (90-100) — SPF + DKIM + DMARC enforcing (quarantine/reject)
 *   B (80-89)  — All three present, but DMARC not enforcing or SPF issues
 *   C (65-79)  — Missing one of the three core records
 *   D (35-64)  — Missing two, or one critically broken
 *   F (0-34)   — Missing all, +all, or blacklisted on Spamhaus
 */

import type {
  BimiResult,
  BlacklistResult,
  Bonus,
  CaaResult,
  Deduction,
  DkimResult,
  DmarcResult,
  DnssecResult,
  DomainAgeResult,
  Ipv6Result,
  MtaStsResult,
  MxResult,
  MxTlsResult,
  ReverseDnsResult,
  ScoreResult,
  SpfResult,
  TlsRptResult,
} from "./types.js";

export type AllCheckResults = {
  spf: SpfResult;
  dkim: DkimResult;
  dmarc: DmarcResult;
  mx: MxResult;
  mxTls: MxTlsResult;
  mtaSts: MtaStsResult;
  tlsRpt: TlsRptResult;
  bimi: BimiResult;
  dnssec: DnssecResult;
  ipv6: Ipv6Result;
  reverseDns: ReverseDnsResult;
  blacklist: BlacklistResult;
  domainAge: DomainAgeResult;
  caa: CaaResult;
};

const GRADE_BANDS = {
  A: { min: 90, max: 100 },
  B: { min: 80, max: 89 },
  C: { min: 65, max: 79 },
  D: { min: 35, max: 64 },
  F: { min: 0, max: 34 },
} as const;

/**
 * Calculate email deliverability score
 */
export function calculateScore(checks: AllCheckResults): ScoreResult {
  const deductions: Deduction[] = [];
  const bonuses: Bonus[] = [];

  // Collect all issues (for the detail view)
  collectSpfIssues(checks.spf, deductions);
  collectDkimIssues(checks, deductions, bonuses);
  collectDmarcIssues(checks.dmarc, deductions, bonuses);
  collectInfraIssues(checks, deductions, bonuses);

  // Grade is determined by the auth triad
  const grade = determineGrade(checks);

  // Score is placed within the grade's band
  const band = GRADE_BANDS[grade];
  let score = band.max;

  // Secondary deductions pull score down within band
  for (const d of deductions) {
    score -= d.points;
  }

  // Bonuses push back up (capped at band max)
  const totalBonus = bonuses.reduce((sum, b) => sum + b.points, 0);
  score += Math.min(totalBonus, 10);

  const finalScore = Math.max(band.min, Math.min(band.max, score));

  return {
    rawScore: score,
    finalScore,
    grade,
    deductions,
    bonuses,
    breakdown: {
      spf: {
        max: 30,
        score: Math.max(0, 30 - sumDeductions(deductions, "spf")),
      },
      dkim: {
        max: 25,
        score: Math.max(0, 25 - sumDeductions(deductions, "dkim")),
      },
      dmarc: {
        max: 25,
        score: Math.max(0, 25 - sumDeductions(deductions, "dmarc")),
      },
      mx: { max: 10, score: Math.max(0, 10 - sumDeductions(deductions, "mx")) },
      blacklist: {
        max: 10,
        score: Math.max(0, 10 - sumDeductions(deductions, "blacklist")),
      },
      bonus: { earned: Math.min(totalBonus, 10), possible: 10 },
    },
  };
}

// =============================================================================
// Auth Triad Assessment
// =============================================================================

type AuthStatus = "good" | "present" | "weak" | "missing";

function assessSpf(spf: SpfResult): AuthStatus {
  if (!spf.exists || spf.multipleRecords || !spf.valid) {
    return "missing";
  }
  if (spf.allMechanism === "+all" || spf.hasCircularInclude) {
    return "missing";
  }
  if (spf.allMechanism === "?all") {
    return "weak";
  }
  // ~all or -all both count as "present"
  return "present";
}

function assessDkim(checks: AllCheckResults): AuthStatus {
  if (checks.dkim.found) {
    const valid = checks.dkim.selectors.find((s) => s.valid && !s.revoked);
    return valid ? "present" : "missing";
  }
  // AWS SES uses random DKIM selectors — give benefit of the doubt
  const usesAwsSes = checks.spf.includes.some(
    (inc) => inc.includes("amazonses.com") || inc.includes("amazon.com")
  );
  return usesAwsSes ? "weak" : "missing";
}

function assessDmarc(dmarc: DmarcResult): AuthStatus {
  if (!(dmarc.exists && dmarc.valid)) {
    return "missing";
  }
  if (dmarc.policy === "reject" || dmarc.policy === "quarantine") {
    return "good";
  }
  return "present"; // policy=none
}

/**
 * Grade is determined by the auth triad status.
 *
 *   A — SPF present + DKIM present + DMARC enforcing
 *   B — All three present, but DMARC not enforcing (or SPF weak)
 *   C — Missing one of the three
 *   D — Missing two, or one critically broken
 *   F — Missing all three, or critical failure
 */
function determineGrade(checks: AllCheckResults): "A" | "B" | "C" | "D" | "F" {
  // Critical overrides → F
  if (checks.spf.allMechanism === "+all") {
    return "F";
  }
  const hasSpamhausListing = [
    ...checks.blacklist.domainChecks.listed,
    ...checks.blacklist.ipChecks.listed,
  ].some((l) => l.zone.includes("spamhaus"));
  if (hasSpamhausListing) {
    return "F";
  }

  const spf = assessSpf(checks.spf);
  const dkim = assessDkim(checks);
  const dmarc = assessDmarc(checks.dmarc);

  const presentCount = [spf, dkim, dmarc].filter((s) => s !== "missing").length;

  // A: all three present and DMARC enforcing
  if (
    spf === "present" &&
    (dkim === "present" || dkim === "good") &&
    dmarc === "good"
  ) {
    return "A";
  }

  // B: all three present but not fully enforcing
  if (presentCount === 3) {
    return "B";
  }

  // C: missing one
  if (presentCount === 2) {
    return "C";
  }

  // D: missing two (but at least one present)
  if (presentCount === 1) {
    return "D";
  }

  // F: missing all
  return "F";
}

// =============================================================================
// Issue Collection (populates deductions/bonuses for the detail view)
// =============================================================================

function collectSpfIssues(spf: SpfResult, deductions: Deduction[]): void {
  if (!spf.exists) {
    deductions.push({ check: "spf", points: 5, reason: "No SPF record" });
    return;
  }
  if (spf.multipleRecords) {
    deductions.push({
      check: "spf",
      points: 5,
      reason: "Multiple SPF records (RFC violation)",
    });
    return;
  }
  if (!spf.valid) {
    deductions.push({ check: "spf", points: 5, reason: "Invalid SPF syntax" });
    return;
  }
  if (spf.allMechanism === "+all") {
    deductions.push({
      check: "spf",
      points: 5,
      reason: "SPF +all allows anyone to send as your domain",
    });
    return;
  }
  if (spf.hasCircularInclude) {
    deductions.push({
      check: "spf",
      points: 5,
      reason: "SPF has circular include (infinite loop)",
    });
    return;
  }

  // SPF exists and is valid — minor issues
  if (spf.allMechanism === "?all") {
    deductions.push({
      check: "spf",
      points: 3,
      reason: "SPF ?all is too permissive",
    });
  } else if (spf.allMechanism === "~all") {
    deductions.push({
      check: "spf",
      points: 2,
      reason: "SPF ~all (softfail) instead of -all (hardfail)",
    });
  }
  if (spf.lookupCount > 10) {
    deductions.push({
      check: "spf",
      points: 3,
      reason: `SPF exceeds 10 DNS lookups (${spf.lookupCount})`,
    });
  }
  if (spf.hasPtr) {
    deductions.push({
      check: "spf",
      points: 1,
      reason: "SPF uses deprecated ptr mechanism",
    });
  }
}

function collectDkimIssues(
  checks: AllCheckResults,
  deductions: Deduction[],
  bonuses: Bonus[]
): void {
  const usesAwsSes = checks.spf.includes.some(
    (inc) => inc.includes("amazonses.com") || inc.includes("amazon.com")
  );

  if (checks.dkim.found) {
    const validSelector = checks.dkim.selectors.find(
      (s) => s.valid && !s.revoked
    );
    if (!validSelector) {
      deductions.push({
        check: "dkim",
        points: 5,
        reason: "No valid DKIM record",
      });
      return;
    }

    if (
      validSelector.keyType === "rsa" &&
      validSelector.keyBits &&
      validSelector.keyBits < 1024
    ) {
      deductions.push({
        check: "dkim",
        points: 4,
        reason: `DKIM key too weak (${validSelector.keyBits} bits)`,
      });
    } else if (
      validSelector.keyType === "rsa" &&
      validSelector.keyBits &&
      validSelector.keyBits < 2048
    ) {
      deductions.push({
        check: "dkim",
        points: 2,
        reason: `DKIM key should be 2048+ bits (${validSelector.keyBits})`,
      });
    }
    if (validSelector.testMode) {
      deductions.push({
        check: "dkim",
        points: 3,
        reason: "DKIM in testing mode (t=y)",
      });
    }

    const validCount = checks.dkim.selectors.filter(
      (s) => s.valid && !s.revoked
    ).length;
    if (validCount > 1) {
      bonuses.push({
        check: "dkim",
        points: 1,
        reason: `${validCount} valid DKIM selectors`,
      });
    }
  } else if (usesAwsSes) {
    deductions.push({
      check: "dkim",
      points: 2,
      reason:
        "DKIM not verifiable (AWS SES uses random selectors). Send a test email to verify.",
    });
  } else {
    deductions.push({
      check: "dkim",
      points: 5,
      reason: "No DKIM record found",
    });
  }
}

function collectDmarcIssues(
  dmarc: DmarcResult,
  deductions: Deduction[],
  bonuses: Bonus[]
): void {
  if (!dmarc.exists) {
    deductions.push({ check: "dmarc", points: 5, reason: "No DMARC record" });
    return;
  }
  if (!dmarc.valid) {
    deductions.push({
      check: "dmarc",
      points: 5,
      reason: "Invalid DMARC syntax",
    });
    return;
  }

  if (dmarc.policy === "none") {
    deductions.push({
      check: "dmarc",
      points: 3,
      reason: "DMARC policy is none (not enforcing)",
    });
  }
  if (dmarc.testing && dmarc.policy !== "none") {
    deductions.push({
      check: "dmarc",
      points: 2,
      reason: "DMARC testing mode (t=y) — receivers won't enforce the policy",
    });
  }
  if (dmarc.percentage < 100) {
    deductions.push({
      check: "dmarc",
      points: 1,
      reason: `DMARC pct=${dmarc.percentage} is deprecated (DMARCbis receivers ignore it; enforcement is inconsistent)`,
    });
  }
  if (!dmarc.reportingEnabled) {
    deductions.push({
      check: "dmarc",
      points: 2,
      reason: "DMARC reporting not configured (no rua=)",
    });
  }
  if (dmarc.alignmentSpf === "strict" && dmarc.alignmentDkim === "strict") {
    bonuses.push({
      check: "dmarc",
      points: 1,
      reason: "DMARC strict alignment configured",
    });
  }
  if (
    (dmarc.policy === "quarantine" || dmarc.policy === "reject") &&
    dmarc.nonExistentSubdomainPolicy === "reject"
  ) {
    bonuses.push({
      check: "dmarc",
      points: 1,
      reason: "np=reject blocks non-existent subdomain spoofing (DMARCbis)",
    });
  }
}

function collectInfraIssues(
  checks: AllCheckResults,
  deductions: Deduction[],
  bonuses: Bonus[]
): void {
  // MX
  if (checks.mx.exists) {
    const unresolving = checks.mx.records.filter((r) => !r.resolves);
    if (unresolving.length > 0) {
      deductions.push({
        check: "mx",
        points: 2,
        reason: `${unresolving.length} MX records don't resolve`,
      });
    }
    if (checks.mx.hasRedundancy) {
      bonuses.push({
        check: "mx",
        points: 1,
        reason: "Multiple MX records for redundancy",
      });
    }
  } else {
    deductions.push({ check: "mx", points: 2, reason: "No MX records" });
  }

  // Blacklists
  for (const listing of [
    ...checks.blacklist.domainChecks.listed,
    ...checks.blacklist.ipChecks.listed,
  ]) {
    if (listing.zone.includes("spamhaus")) {
      deductions.push({
        check: "blacklist",
        points: 5,
        reason: `Listed on ${listing.blacklist}`,
      });
    } else if (listing.priority === "critical" || listing.priority === "high") {
      deductions.push({
        check: "blacklist",
        points: 3,
        reason: `Listed on ${listing.blacklist}`,
      });
    } else {
      deductions.push({
        check: "blacklist",
        points: 1,
        reason: `Listed on ${listing.blacklist}`,
      });
    }
  }
  if (checks.blacklist.overallClean) {
    bonuses.push({
      check: "blacklist",
      points: 1,
      reason: "Clean on all blacklists",
    });
  }

  // MTA-STS
  if (checks.mtaSts.configured && checks.mtaSts.policy?.mode === "enforce") {
    bonuses.push({ check: "mta-sts", points: 2, reason: "MTA-STS enforcing" });
  } else if (
    checks.mtaSts.configured &&
    checks.mtaSts.policy?.mode === "testing"
  ) {
    bonuses.push({
      check: "mta-sts",
      points: 1,
      reason: "MTA-STS testing mode",
    });
  }

  // TLS-RPT
  if (checks.tlsRpt.configured) {
    bonuses.push({ check: "tls-rpt", points: 1, reason: "TLS-RPT configured" });
  }

  // BIMI
  if (checks.bimi.configured && checks.bimi.dmarcCompatible) {
    if (checks.bimi.vmcValid) {
      bonuses.push({ check: "bimi", points: 2, reason: "BIMI with VMC" });
    } else if (checks.bimi.logoAccessible) {
      bonuses.push({
        check: "bimi",
        points: 1,
        reason: "BIMI configured (no VMC)",
      });
    }
  }

  // MX TLS
  if (checks.mxTls.checked && !checks.mxTls.skipped) {
    const allMxTls13 = checks.mxTls.servers.every((s) =>
      s.tlsVersions?.includes("TLSv1.3")
    );
    if (allMxTls13) {
      bonuses.push({
        check: "mx-tls",
        points: 1,
        reason: "All MX servers support TLS 1.3",
      });
    }
  }

  // DNSSEC
  if (checks.dnssec.enabled && checks.dnssec.valid) {
    bonuses.push({
      check: "dnssec",
      points: 1,
      reason: "DNSSEC enabled and valid",
    });
  } else if (checks.dnssec.enabled && !checks.dnssec.valid) {
    deductions.push({ check: "dnssec", points: 2, reason: "DNSSEC broken" });
  }

  // IPv6
  if (checks.ipv6.mxHasIpv6 && checks.ipv6.spfIncludesIpv6) {
    bonuses.push({ check: "ipv6", points: 1, reason: "Full IPv6 support" });
  }

  // Reverse DNS
  if (checks.reverseDns.allHavePtr && checks.reverseDns.allConfirm) {
    bonuses.push({ check: "ptr", points: 1, reason: "All PTR records valid" });
  } else if (!checks.reverseDns.allHavePtr) {
    deductions.push({ check: "ptr", points: 2, reason: "Missing reverse DNS" });
  }

  // Domain age
  if (checks.domainAge.ageInDays !== null) {
    if (checks.domainAge.ageInDays < 30) {
      deductions.push({
        check: "domain-age",
        points: 3,
        reason: "Domain less than 30 days old",
      });
    } else if (checks.domainAge.ageInDays < 90) {
      deductions.push({
        check: "domain-age",
        points: 1,
        reason: "Domain less than 90 days old",
      });
    } else if (checks.domainAge.ageInDays > 365) {
      bonuses.push({
        check: "domain-age",
        points: 1,
        reason: "Domain over 1 year old",
      });
    }
  }

  // CAA
  if (checks.caa.configured) {
    bonuses.push({ check: "caa", points: 1, reason: "CAA records configured" });
  }
}

// =============================================================================
// Helpers
// =============================================================================

function sumDeductions(deductions: Deduction[], check: string): number {
  return deductions
    .filter((d) => d.check === check)
    .reduce((sum, d) => sum + d.points, 0);
}

/**
 * Get grade color for terminal output
 */
export function getGradeColor(
  grade: string
): "green" | "yellow" | "orange" | "red" {
  switch (grade) {
    case "A":
      return "green";
    case "B":
      return "yellow";
    case "C":
      return "yellow";
    case "D":
      return "orange";
    default:
      return "red";
  }
}

/**
 * Get grade description
 */
export function getGradeDescription(grade: string): string {
  switch (grade) {
    case "A":
      return "SPF + DKIM + DMARC enforcing — your domain is protected";
    case "B":
      return "All three records present, but DMARC not enforcing";
    case "C":
      return "Missing one core record (SPF, DKIM, or DMARC)";
    case "D":
      return "Missing two core records — significant spoofing risk";
    case "F":
      return "No email authentication — anyone can spoof your domain";
    default:
      return "Unknown";
  }
}
