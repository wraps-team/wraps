/**
 * Email Check Library
 * Comprehensive email deliverability auditing
 */

import { checkBimi } from "./checks/bimi.js";
import { checkBlacklist } from "./checks/blacklist.js";
import { checkDkim } from "./checks/dkim.js";
import { checkDmarc } from "./checks/dmarc.js";
import { checkMx } from "./checks/mx.js";
import { checkMxTls } from "./checks/mx-tls.js";
import { checkDomainAge } from "./checks/rdap.js";
import { checkSpf } from "./checks/spf.js";
import { calculateScore } from "./scoring.js";
import type {
  CaaResult,
  DnssecResult,
  EmailCheckOptions,
  EmailCheckResult,
  Ipv6Result,
  MtaStsResult,
  ReverseDnsResult,
  TlsRptResult,
} from "./types.js";
import { isValidDomain, toAsciiDomain } from "./utils/domain.js";

export { checkBimi } from "./checks/bimi.js";
export type { BlacklistSummary } from "./checks/blacklist.js";
export {
  checkBlacklist,
  describeBlacklistCoverage,
  formatBlacklistResults,
} from "./checks/blacklist.js";
export { checkDkim, formatDkimResults } from "./checks/dkim.js";
export { checkDmarc, formatDmarcResult } from "./checks/dmarc.js";
export { checkMx, formatMxResults } from "./checks/mx.js";
export { checkMxTls, formatMxTlsResult } from "./checks/mx-tls.js";
export { checkDomainAge, formatDomainAgeResult } from "./checks/rdap.js";
export { checkSpf, formatSpfLookupTree } from "./checks/spf.js";
export * from "./constants.js";
export * from "./dns/index.js";
export {
  calculateScore,
  getGradeColor,
  getGradeDescription,
  hardfailWithoutEnforcingDmarc,
} from "./scoring.js";
// Re-export types
export * from "./types.js";
export * from "./utils/domain.js";

/**
 * Run a complete email deliverability check
 */
export async function runEmailCheck(
  domain: string,
  options: EmailCheckOptions = {}
): Promise<EmailCheckResult> {
  const startTime = Date.now();

  // Validate and normalize domain
  const normalizedDomain = toAsciiDomain(domain);
  if (!isValidDomain(normalizedDomain)) {
    throw new Error(`Invalid domain: ${domain}`);
  }

  const {
    quick = false,
    skipBlacklists = false,
    skipTls = false,
    fetchBimiAssets = false,
  } = options;

  // Run core authentication checks in parallel
  const [spfResult, dkimResult, dmarcResult, mxResult] = await Promise.all([
    checkSpf(normalizedDomain),
    checkDkim(normalizedDomain, {
      quick,
      selector: options.dkimSelector,
      selectors: options.dkimSelectors,
      verbose: options.verbose,
    }),
    checkDmarc(normalizedDomain),
    checkMx(normalizedDomain),
  ]);

  // Detect email provider from SPF and add helpful DKIM warnings
  if (!dkimResult.found && spfResult.record) {
    const spfLower = spfResult.record.toLowerCase();
    if (spfLower.includes("amazonses") || spfLower.includes("_spf.aws")) {
      dkimResult.warnings.push(
        "AWS SES uses random DKIM selectors. Run `wraps email domains get-dkim -d <domain>` to find yours."
      );
    } else if (spfLower.includes("sendgrid")) {
      dkimResult.warnings.push(
        "SendGrid uses custom DKIM selectors. Check your SendGrid dashboard or use --dkimSelector."
      );
    } else if (spfLower.includes("mailgun")) {
      dkimResult.warnings.push(
        "Mailgun uses custom DKIM selectors. Check your Mailgun dashboard or use --dkimSelector."
      );
    }
  }

  // Get IPs from MX records for blacklist checks
  const mxIps: string[] = [];
  for (const mx of mxResult.records) {
    mxIps.push(...mx.ipv4Addresses);
  }

  // Run blacklist checks
  const blacklistResult = await checkBlacklist({
    domain: normalizedDomain,
    ips: mxIps,
    quick,
    skip: skipBlacklists,
  });

  // Check MX server TLS support
  const mxTlsResult = await checkMxTls(mxResult.records, {
    skip: skipTls,
    quick,
  });

  const mtaStsResult: MtaStsResult = {
    configured: false,
    dnsRecord: null,
    dnsRecordId: null,
    policyFetched: false,
    policyUrl: `https://mta-sts.${normalizedDomain}/.well-known/mta-sts.txt`,
    policy: null,
    mxPatternsMatch: false,
    errors: [],
    warnings: [],
  };

  const tlsRptResult: TlsRptResult = {
    configured: false,
    record: null,
    version: null,
    reportingUris: [],
    errors: [],
  };

  const reverseDnsResult: ReverseDnsResult = {
    results: [],
    allHavePtr: false,
    allConfirm: false,
    warnings: [],
  };

  // Build reverse DNS results from MX data
  for (const mx of mxResult.records) {
    for (const ip of mx.ipv4Addresses) {
      const hasPtr = mx.reverseHostnames.length > 0;
      reverseDnsResult.results.push({
        ip,
        ipVersion: 4,
        ptrHostname: mx.reverseHostnames[0] || null,
        forwardConfirms: hasPtr, // Simplified - would need actual check
        looksGeneric: false,
        matchesDomain: mx.reverseHostnames.some((h) =>
          h.includes(normalizedDomain)
        ),
      });
    }
  }
  reverseDnsResult.allHavePtr = reverseDnsResult.results.every(
    (r) => r.ptrHostname !== null
  );
  reverseDnsResult.allConfirm = reverseDnsResult.results.every(
    (r) => r.forwardConfirms
  );

  const ipv6Result: Ipv6Result = {
    mxHasIpv6: mxResult.records.some((r) => r.ipv6Addresses.length > 0),
    mxIpv6Addresses: mxResult.records
      .filter((r) => r.ipv6Addresses.length > 0)
      .map((r) => ({ mx: r.exchange, addresses: r.ipv6Addresses })),
    ipv6Connectable: false, // Would need actual check
    spfIncludesIpv6: spfResult.record?.includes("ip6:") ?? false,
    warnings: [],
  };

  // Check domain age via RDAP (always run - it's a single fast HTTP request)
  const domainAgeResult = await checkDomainAge(normalizedDomain);

  const dnssecResult: DnssecResult = {
    enabled: false,
    valid: false,
    validationMethod: "system-resolver",
    chainOfTrust: [],
    algorithm: null,
    keyTag: null,
    errors: [],
  };

  const caaResult: CaaResult = {
    configured: false,
    records: [],
    allowedIssuers: [],
    allowedWildcardIssuers: [],
    reportingConfigured: false,
    iodefUri: null,
  };

  const bimiResult = await checkBimi(
    normalizedDomain,
    dmarcResult.policy,
    fetchBimiAssets
  );

  // Calculate score
  const score = calculateScore({
    spf: spfResult,
    dkim: dkimResult,
    dmarc: dmarcResult,
    mx: mxResult,
    mxTls: mxTlsResult,
    mtaSts: mtaStsResult,
    tlsRpt: tlsRptResult,
    bimi: bimiResult,
    dnssec: dnssecResult,
    ipv6: ipv6Result,
    reverseDns: reverseDnsResult,
    blacklist: blacklistResult,
    domainAge: domainAgeResult,
    caa: caaResult,
  });

  const duration = Date.now() - startTime;

  return {
    domain: normalizedDomain,
    checkedAt: new Date().toISOString(),
    duration,
    options,
    spf: spfResult,
    dkim: dkimResult,
    dmarc: dmarcResult,
    mx: mxResult,
    mxTls: mxTlsResult,
    mtaSts: mtaStsResult,
    tlsRpt: tlsRptResult,
    reverseDns: reverseDnsResult,
    ipv6: ipv6Result,
    blacklist: blacklistResult,
    domainAge: domainAgeResult,
    dnssec: dnssecResult,
    caa: caaResult,
    bimi: bimiResult,
    score,
  };
}

/**
 * Get exit code based on grade
 */
export function getExitCode(grade: string): number {
  switch (grade) {
    case "A":
    case "B":
      return 0;
    case "C":
    case "D":
      return 1;
    case "F":
      return 2;
    default:
      return 4;
  }
}
