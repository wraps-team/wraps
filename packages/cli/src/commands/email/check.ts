/**
 * Email Check Command
 * Comprehensive email deliverability audit
 */

import { GetEmailIdentityCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import * as clack from "@clack/prompts";
import {
  describeBlacklistCoverage,
  type EmailCheckResult,
  formatSpfLookupTree,
  getExitCode,
  hardfailWithoutEnforcingDmarc,
  runEmailCheck,
} from "@wraps.dev/email-check";
import pc from "picocolors";
import { trackCommand } from "../../telemetry/events.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../utils/shared/json-output.js";
import { listConnections } from "../../utils/shared/metadata.js";

export type CheckOptions = {
  /** Domain to check */
  domain?: string;
  /** Fast mode: fewer DKIM selectors, top blacklists only */
  quick?: boolean;
  /** Output as JSON */
  json?: boolean;
  /** Show all checks including passing */
  verbose?: boolean;
  /** Specific DKIM selector to check */
  dkimSelector?: string;
  /** Skip blacklist checks */
  skipBlacklists?: boolean;
  /** Skip MX TLS checks */
  skipTls?: boolean;
  /** DNS timeout in milliseconds */
  timeout?: number;
};

/**
 * Run the email check command
 */
export async function check(options: CheckOptions): Promise<void> {
  const startTime = Date.now();

  // Get domain
  let domain = options.domain;
  if (!domain) {
    const input = await clack.text({
      message: "Enter domain to check:",
      placeholder: "example.com",
      validate: (value) => {
        if (!value) {
          return "Domain is required";
        }
        if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(value)) {
          return "Invalid domain format";
        }
      },
    });

    if (clack.isCancel(input)) {
      clack.cancel("Operation cancelled");
      process.exit(0);
      return;
    }

    domain = input as string;
  }

  // Show intro
  if (!isJsonMode()) {
    clack.intro(pc.bold("Wraps Email Check"));
    console.log();
  }

  // Run the check
  const spinner = isJsonMode() ? null : clack.spinner();

  spinner?.start(`Checking ${pc.cyan(domain)}...`);

  // Try to get DKIM selectors from SES if we have a Wraps deployment
  let dkimSelectors: string[] | undefined;
  if (!options.dkimSelector) {
    const sesTokens = await tryGetSesDkimTokens(domain);
    if (sesTokens.length > 0) {
      dkimSelectors = sesTokens;
    }
  }

  try {
    const result = await runEmailCheck(domain, {
      quick: options.quick,
      verbose: options.verbose,
      dkimSelector: options.dkimSelector,
      dkimSelectors, // Use SES tokens if found
      skipBlacklists: options.skipBlacklists,
      skipTls: options.skipTls,
      timeout: options.timeout,
      // Trusted, user-initiated invocation — safe to fetch the BIMI logo/VMC
      // over HTTPS. The public /tools/email-check API must not set this.
      fetchBimiAssets: true,
    });

    spinner?.stop(`Check complete in ${result.duration}ms`);

    // Output results
    if (isJsonMode()) {
      jsonSuccess("email.check", result as unknown as Record<string, unknown>);
    } else {
      displayResults(result, options);
    }

    // Track command
    const duration = Date.now() - startTime;
    trackCommand("email:check", {
      success: true,
      duration_ms: duration,
      grade: result.score.grade,
    });

    // Exit with appropriate code
    process.exit(getExitCode(result.score.grade));
  } catch (error) {
    spinner?.stop("Check failed");
    const msg = error instanceof Error ? error.message : String(error);

    if (isJsonMode()) {
      jsonError("email.check", { code: "CHECK_FAILED", message: msg });
    } else {
      clack.log.error(msg);
    }

    const duration = Date.now() - startTime;
    trackCommand("email:check", {
      success: false,
      duration_ms: duration,
      error: msg,
    });

    process.exit(4);
  }
}

/**
 * Display check results in a beautiful CLI format
 */
function displayResults(result: EmailCheckResult, options: CheckOptions): void {
  const { score, spf, dkim, dmarc, mx, blacklist, bimi } = result;

  // Score box
  console.log();
  displayScoreBox(result.domain, score.finalScore, score.grade, options.quick);
  console.log();

  // Authentication section
  console.log(pc.bold("AUTHENTICATION"));
  console.log();

  // SPF
  displaySpfResult(spf, dmarc, options.verbose);

  // DKIM
  displayDkimResult(dkim, options.verbose);

  // DMARC
  displayDmarcResult(dmarc);

  // BIMI
  displayBimiResult(bimi, result.domain);

  console.log();

  // Infrastructure section
  console.log(pc.bold("INFRASTRUCTURE"));
  console.log();

  // MX Records
  displayMxResult(mx);

  // Mail Server TLS
  displayMxTlsResult(result);

  // Reverse DNS
  displayReverseDnsResult(result);

  // IPv6
  displayIpv6Result(result);

  console.log();

  // Reputation section
  console.log(pc.bold("REPUTATION"));
  console.log();

  // Blacklists
  displayBlacklistResult(blacklist);

  // Domain Age
  displayDomainAgeResult(result);

  // Security section (if anything notable)
  if (
    result.dnssec.enabled ||
    result.caa.configured ||
    result.mtaSts.configured ||
    result.tlsRpt.configured
  ) {
    console.log();
    console.log(pc.bold("SECURITY"));
    console.log();

    if (result.dnssec.enabled) {
      const status = result.dnssec.valid ? pc.green("✓") : pc.red("✗");
      console.log(
        `  ${status} ${pc.dim("DNSSEC")}           ${result.dnssec.valid ? "Enabled and validated" : "Broken"}`
      );
    } else {
      console.log(
        `  ${pc.dim("○")} ${pc.dim("DNSSEC")}           Not configured`
      );
    }

    if (result.caa.configured) {
      console.log(
        `  ${pc.green("✓")} ${pc.dim("CAA")}              Configured (${result.caa.allowedIssuers.join(", ")})`
      );
    } else {
      console.log(
        `  ${pc.dim("○")} ${pc.dim("CAA")}              Not configured`
      );
    }

    if (result.mtaSts.configured) {
      const mode = result.mtaSts.policy?.mode || "unknown";
      console.log(
        `  ${pc.green("✓")} ${pc.dim("MTA-STS")}          ${mode === "enforce" ? "Enforcing mode" : `${mode} mode`}`
      );
    } else {
      console.log(
        `  ${pc.dim("○")} ${pc.dim("MTA-STS")}          Not configured`
      );
    }

    if (result.tlsRpt.configured) {
      console.log(
        `  ${pc.green("✓")} ${pc.dim("TLS-RPT")}          Configured`
      );
    } else {
      console.log(
        `  ${pc.dim("○")} ${pc.dim("TLS-RPT")}          Not configured`
      );
    }
  }

  // Issues section
  const criticalDeductions = score.deductions.filter((d) => d.points >= 20);
  const warningDeductions = score.deductions.filter(
    (d) => d.points >= 5 && d.points < 20
  );

  if (criticalDeductions.length > 0 || warningDeductions.length > 0) {
    console.log();
    console.log(pc.dim("─".repeat(78)));
    console.log();
    console.log(
      pc.bold(
        `ISSUES (${criticalDeductions.length} critical, ${warningDeductions.length} warnings)`
      )
    );
    console.log();

    if (criticalDeductions.length > 0) {
      console.log(pc.red("❌ CRITICAL"));
      console.log();
      for (let i = 0; i < criticalDeductions.length; i++) {
        const d = criticalDeductions[i];
        console.log(
          `  ${i + 1}. ${d.reason} (${pc.red(`-${d.points} points`)})`
        );
        console.log();
        console.log(`     ${getFixSuggestion(d.check, d.reason)}`);
        console.log();
      }
    }

    if (warningDeductions.length > 0) {
      console.log(pc.yellow("⚠️  WARNINGS"));
      console.log();
      for (let i = 0; i < warningDeductions.length; i++) {
        const d = warningDeductions[i];
        console.log(`  ${criticalDeductions.length + i + 1}. ${d.reason}`);
        console.log();
      }
    }
  }

  // Footer
  console.log();
  console.log(pc.dim("─".repeat(78)));
  console.log();

  if (score.grade === "A" || score.grade === "B") {
    console.log(
      pc.green(
        "✅ " +
          (score.grade === "A"
            ? "Excellent! Your email configuration follows all best practices."
            : "Good! Your email configuration is solid with minor improvements possible.")
      )
    );
  } else {
    console.log(
      pc.yellow(
        "Need help fixing these? Deploy Wraps to manage your email infrastructure:"
      )
    );
    console.log();
    console.log(`  ${pc.cyan("npx @wraps.dev/cli email init")}`);
  }

  console.log();
}

/**
 * Display score box
 */
function displayScoreBox(
  domain: string,
  score: number,
  grade: string,
  quick?: boolean
): void {
  const width = 78;
  const bar = "█".repeat(Math.round((score / 100) * 60));
  const emptyBar = "░".repeat(60 - bar.length);

  const gradeColor =
    grade === "A" || grade === "B"
      ? pc.green
      : grade === "C"
        ? pc.yellow
        : grade === "D"
          ? pc.magenta
          : pc.red;

  console.log(pc.dim(`╭${"─".repeat(width - 2)}╮`));
  console.log(pc.dim("│") + " ".repeat(width - 2) + pc.dim("│"));
  console.log(
    pc.dim("│") +
      "   " +
      pc.bold(`wraps email check${quick ? " --quick" : ""}`) +
      " ".repeat(width - 25 - (quick ? 8 : 0)) +
      pc.dim("│")
  );
  console.log(pc.dim("│") + " ".repeat(width - 2) + pc.dim("│"));
  console.log(
    pc.dim("│") +
      "   Domain: " +
      pc.cyan(domain) +
      " ".repeat(width - 12 - domain.length) +
      pc.dim("│")
  );
  console.log(pc.dim("│") + " ".repeat(width - 2) + pc.dim("│"));
  console.log(
    pc.dim("│") +
      "   " +
      gradeColor(bar) +
      pc.dim(emptyBar) +
      "  " +
      gradeColor(pc.bold(grade)) +
      " ".repeat(width - 70) +
      pc.dim("│")
  );
  console.log(
    pc.dim("│") +
      "   Score: " +
      pc.bold(`${score}/100`) +
      " ".repeat(width - 18 - String(score).length) +
      pc.dim("│")
  );
  console.log(pc.dim("│") + " ".repeat(width - 2) + pc.dim("│"));
  console.log(pc.dim(`╰${"─".repeat(width - 2)}╯`));
}

/**
 * Display SPF result
 */
function displaySpfResult(
  spf: EmailCheckResult["spf"],
  dmarc: EmailCheckResult["dmarc"],
  verbose?: boolean
): void {
  const status =
    spf.exists && spf.valid
      ? pc.green("✓")
      : spf.exists
        ? pc.yellow("⚠")
        : pc.red("✗");

  console.log(
    `  ${status} ${pc.dim("SPF")}              ${spf.record || "Not found"}`
  );

  if (spf.exists) {
    // Show lookup count
    const lookupColor =
      spf.lookupCount <= 8
        ? pc.green
        : spf.lookupCount <= 10
          ? pc.yellow
          : pc.red;
    console.log(
      `                     ${lookupColor(`${spf.lookupCount}/10 DNS lookups used`)}`
    );

    // Show lookup tree if verbose or there are issues
    if (verbose && spf.lookupTree.length > 0) {
      console.log();
      console.log(
        "                     " +
          formatSpfLookupTree(spf.lookupTree)
            .split("\n")
            .join("\n                     ")
      );
    }

    // Show warnings
    if (hardfailWithoutEnforcingDmarc(spf, dmarc)) {
      console.log(
        `                     ${pc.yellow("Hardfail (-all) with no enforcing DMARC — forwarded mail is rejected before DKIM is checked")}`
      );
    }
  }

  console.log();
}

/**
 * Display DKIM result
 */
function displayDkimResult(
  dkim: EmailCheckResult["dkim"],
  _verbose?: boolean
): void {
  const validSelectors = dkim.selectors.filter((s) => s.valid && !s.revoked);
  const status =
    validSelectors.length > 0
      ? pc.green("✓")
      : dkim.found
        ? pc.yellow("⚠")
        : pc.red("✗");

  if (validSelectors.length > 0) {
    console.log(
      `  ${status} ${pc.dim("DKIM")}             Found ${validSelectors.length} valid selector${validSelectors.length !== 1 ? "s" : ""}`
    );
    for (const sel of validSelectors.slice(0, 3)) {
      let desc = `• ${sel.selector}`;
      if (sel.keyType === "rsa" && sel.keyBits) {
        desc += ` (${sel.keyBits}-bit RSA)`;
      } else if (sel.keyType === "ed25519") {
        desc += " (Ed25519)";
      }
      console.log(`                     ${desc}`);
    }
    if (validSelectors.length > 3) {
      console.log(
        `                     ${pc.dim(`... and ${validSelectors.length - 3} more`)}`
      );
    }
  } else if (dkim.found) {
    console.log(
      `  ${status} ${pc.dim("DKIM")}             Found but invalid or revoked`
    );
  } else {
    console.log(
      `  ${status} ${pc.dim("DKIM")}             No DKIM selectors found`
    );
    console.log(
      `                     ${pc.dim(`Checked ${dkim.selectorsChecked} common selectors, none valid`)}`
    );
    // Show provider-specific warnings
    for (const warning of dkim.warnings) {
      console.log(`                     ${pc.yellow(`💡 ${warning}`)}`);
    }
  }

  console.log();
}

/**
 * Display DMARC result
 */
function displayDmarcResult(dmarc: EmailCheckResult["dmarc"]): void {
  const status =
    dmarc.exists && dmarc.valid && dmarc.policy !== "none"
      ? pc.green("✓")
      : dmarc.exists
        ? pc.yellow("⚠")
        : pc.red("✗");

  if (dmarc.exists && dmarc.valid) {
    console.log(`  ${status} ${pc.dim("DMARC")}            ${dmarc.record}`);
    const parts = [
      `Policy: ${dmarc.policy}`,
      `Reporting: ${dmarc.reportingEnabled ? "enabled" : "disabled"}`,
      `Alignment: ${dmarc.alignmentSpf === dmarc.alignmentDkim ? dmarc.alignmentSpf : `SPF=${dmarc.alignmentSpf}, DKIM=${dmarc.alignmentDkim}`}`,
    ];
    console.log(`                     ${pc.dim(parts.join(" • "))}`);
  } else if (dmarc.exists) {
    console.log(`  ${status} ${pc.dim("DMARC")}            ${dmarc.record}`);
    console.log(
      `                     ${pc.dim(dmarc.errors.join(", ") || "Invalid syntax")}`
    );
  } else {
    console.log(`  ${status} ${pc.dim("DMARC")}            Not found`);
  }

  console.log();
}

/**
 * Display BIMI result
 */
function displayBimiResult(
  bimi: EmailCheckResult["bimi"],
  domain: string
): void {
  // BIMI cannot work until DMARC is enforcing — show a gate, not setup steps.
  if (!bimi.dmarcCompatible) {
    console.log(
      `  ${pc.dim("○")} ${pc.dim("BIMI")}             Blocked on DMARC enforcement`
    );
    console.log(
      `                     ${pc.dim("Move DMARC to p=quarantine or p=reject first — BIMI cannot work until DMARC enforces.")}`
    );
    console.log();
    return;
  }

  if (bimi.configured) {
    const status =
      bimi.logoValid && bimi.vmcValid
        ? pc.green("✓")
        : bimi.logoValid || bimi.logoAccessible
          ? pc.yellow("⚠")
          : pc.red("✗");

    console.log(`  ${status} ${pc.dim("BIMI")}             ${bimi.record}`);
    const parts = [
      `Logo: ${bimi.logoValid ? "valid" : bimi.logoAccessible ? "accessible, invalid" : "unreachable"}`,
      `VMC: ${bimi.vmcUrl ? (bimi.vmcAccessible ? "reachable (not verified)" : "unreachable") : "none (self-asserted)"}`,
    ];
    console.log(`                     ${pc.dim(parts.join(" • "))}`);
    if (!bimi.vmcUrl) {
      console.log(
        `                     ${pc.dim("Self-asserted BIMI (no VMC): shows in Yahoo, AOL, Fastmail. Gmail requires a VMC or CMC to display your logo.")}`
      );
    }
    for (const error of bimi.errors) {
      console.log(`                     ${pc.yellow(`⚠ ${error}`)}`);
    }
  } else {
    console.log(
      `  ${pc.dim("○")} ${pc.dim("BIMI")}             Not configured`
    );
    console.log(
      `                     ${pc.dim(`default._bimi.${domain} TXT "v=BIMI1; l=https://${domain}/logo.svg; a=https://${domain}/vmc.pem"`)}`
    );
    console.log(
      `                     ${pc.dim("Host a square SVG Tiny P/S logo over HTTPS to enable BIMI. a= (VMC/CMC) is optional — required by Gmail, not by Yahoo/AOL/Fastmail.")}`
    );
  }

  console.log();
}

/**
 * Display MX result
 */
function displayMxResult(mx: EmailCheckResult["mx"]): void {
  const allResolve = mx.records.every((r) => r.resolves);
  const status =
    mx.exists && allResolve
      ? pc.green("✓")
      : mx.exists
        ? pc.yellow("⚠")
        : pc.red("✗");

  if (mx.exists) {
    console.log(
      `  ${status} ${pc.dim("MX Records")}       ${mx.records.length} record${mx.records.length !== 1 ? "s" : ""}, ${allResolve ? "all resolving" : "some not resolving"}`
    );
    const summary = mx.records
      .slice(0, 3)
      .map((r) => `${r.exchange} (${r.priority})`)
      .join(", ");
    console.log(`                     ${pc.dim(summary)}`);
  } else {
    console.log(
      `  ${status} ${pc.dim("MX Records")}       No MX records found`
    );
  }

  console.log();
}

/**
 * Display MX TLS result
 */
function displayMxTlsResult(result: EmailCheckResult): void {
  if (result.mxTls.skipped) {
    console.log(
      `  ${pc.dim("○")} ${pc.dim("Mail Server TLS")}  ${pc.dim(`Skipped (${result.mxTls.skipReason})`)}`
    );
  } else if (result.mxTls.checked) {
    const servers = result.mxTls.servers;
    const connected = servers.filter((s) => s.connected);
    const timedOut = servers.filter((s) =>
      s.connectionError?.includes("timed out")
    );
    const allConnectedSupportTls =
      connected.length > 0 && connected.every((s) => s.supportsStarttls);

    if (timedOut.length === servers.length) {
      // All connections timed out - port 25 blocked
      console.log(
        `  ${pc.dim("○")} ${pc.dim("Mail Server TLS")}  ${pc.dim("Port 25 blocked (cannot check)")}`
      );
    } else if (allConnectedSupportTls) {
      const tlsVersions = [
        ...new Set(connected.map((s) => s.preferredTlsVersion).filter(Boolean)),
      ];
      const tlsInfo =
        tlsVersions.length > 0 ? ` (${tlsVersions.join(", ")})` : "";
      console.log(
        `  ${pc.green("✓")} ${pc.dim("Mail Server TLS")}  All ${connected.length} servers support TLS${tlsInfo}`
      );
    } else if (connected.length > 0) {
      const noTls = connected.filter((s) => !s.supportsStarttls);
      console.log(
        `  ${pc.yellow("⚠")} ${pc.dim("Mail Server TLS")}  ${noTls.length}/${connected.length} servers missing STARTTLS`
      );
    } else {
      console.log(
        `  ${pc.dim("○")} ${pc.dim("Mail Server TLS")}  ${pc.dim("Could not connect to servers")}`
      );
    }
  } else {
    console.log(
      `  ${pc.dim("○")} ${pc.dim("Mail Server TLS")}  ${pc.dim("Not checked")}`
    );
  }

  console.log();
}

/**
 * Display Reverse DNS result
 */
function displayReverseDnsResult(result: EmailCheckResult): void {
  const { reverseDns } = result;
  if (reverseDns.results.length === 0) {
    console.log(
      `  ${pc.dim("○")} ${pc.dim("Reverse DNS")}      ${pc.dim("No IPs to check")}`
    );
  } else {
    const status =
      reverseDns.allHavePtr && reverseDns.allConfirm
        ? pc.green("✓")
        : reverseDns.allHavePtr
          ? pc.yellow("⚠")
          : pc.red("✗");
    console.log(
      `  ${status} ${pc.dim("Reverse DNS")}      ${reverseDns.allHavePtr ? "All IPs have valid PTR records" : "Some IPs missing PTR records"}`
    );
  }

  console.log();
}

/**
 * Display IPv6 result
 */
function displayIpv6Result(result: EmailCheckResult): void {
  if (result.ipv6.mxHasIpv6 && result.ipv6.spfIncludesIpv6) {
    console.log(
      `  ${pc.green("✓")} ${pc.dim("IPv6")}             Full IPv6 support (MX and SPF)`
    );
  } else if (result.ipv6.mxHasIpv6) {
    console.log(
      `  ${pc.yellow("⚠")} ${pc.dim("IPv6")}             Partial (MX has IPv6, SPF does not)`
    );
  } else {
    console.log(
      `  ${pc.dim("○")} ${pc.dim("IPv6")}             Not configured`
    );
  }

  console.log();
}

/**
 * Display blacklist result.
 *
 * What was covered comes from describeBlacklistCoverage(), not from the raw
 * lookup counts: those count list x IP and include lookups that never answered,
 * so "Clean on N/N lists" overstated both.
 */
function displayBlacklistResult(
  blacklist: EmailCheckResult["blacklist"]
): void {
  const summary = describeBlacklistCoverage(blacklist);
  const label = pc.dim("Blacklists");
  const indent = "                     ";

  if (summary.state === "skipped") {
    console.log(`  ${pc.dim("○")} ${label}       ${pc.dim(summary.headline)}`);
    console.log();
    return;
  }

  const mark =
    summary.state === "listed"
      ? pc.red("✗")
      : summary.state === "incomplete"
        ? pc.yellow("⚠")
        : pc.green("✓");
  console.log(`  ${mark} ${label}       ${summary.headline}`);

  for (const listing of [
    ...blacklist.domainChecks.listed,
    ...blacklist.ipChecks.listed,
  ]) {
    console.log(
      `${indent}${pc.red("•")} ${listing.blacklist}: ${listing.meaning}`
    );
  }
  if (summary.detail) {
    console.log(`${indent}${pc.dim(summary.detail)}`);
  }
  if (summary.unansweredLists.length > 0) {
    console.log(
      `${indent}${pc.dim(`Did not answer: ${summary.unansweredLists.join(", ")}`)}`
    );
  }

  console.log();
}

/**
 * Display domain age result
 */
function displayDomainAgeResult(result: EmailCheckResult): void {
  const { domainAge } = result;
  if (domainAge.source === "unavailable") {
    console.log(
      `  ${pc.dim("○")} ${pc.dim("Domain Age")}       ${pc.dim(domainAge.errors[0] || "Unknown")}`
    );
  } else if (domainAge.ageInDays !== null) {
    const years = Math.floor(domainAge.ageInDays / 365);
    const status = domainAge.ageInDays < 30 ? pc.yellow("⚠") : pc.green("✓");
    const desc =
      years > 0
        ? `Registered ${years} year${years !== 1 ? "s" : ""} ago`
        : `Registered ${domainAge.ageInDays} days ago`;
    console.log(`  ${status} ${pc.dim("Domain Age")}       ${desc}`);
    if (domainAge.createdAt) {
      console.log(
        `                     ${pc.dim(`(${domainAge.createdAt.split("T")[0]})`)}`
      );
    }
  }

  console.log();
}

/**
 * Get fix suggestion for a deduction
 */
function getFixSuggestion(check: string, _reason: string): string {
  const suggestions: Record<string, string> = {
    spf: "Add an SPF TXT record to authorize your sending servers.",
    dkim: "Configure DKIM signing with your email provider.",
    dmarc:
      "Add a DMARC record: v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com",
    blacklist: "Check the listed blacklist's website for delisting procedures.",
    ptr: "Contact your hosting provider to add a PTR record for your sending IP.",
    "domain-age":
      "New domains have lower reputation. Send consistently and avoid spam complaints.",
  };

  return suggestions[check] || "Review the issue and take appropriate action.";
}

/**
 * Try to get DKIM tokens from SES for a domain
 * This works if:
 * 1. The user has a Wraps deployment (metadata exists)
 * 2. AWS credentials are available
 * 3. The domain is configured in SES
 *
 * Returns empty array if any of these conditions are not met
 */
async function tryGetSesDkimTokens(domain: string): Promise<string[]> {
  try {
    // Check if we have any Wraps connections (indicates likely SES setup)
    const connections = await listConnections();
    if (connections.length === 0) {
      return [];
    }

    // Try to find a connection that might have this domain
    // Check each region where we have deployments
    const regionsToCheck = new Set(connections.map((c) => c.region));

    for (const region of regionsToCheck) {
      try {
        const sesClient = new SESv2Client({ region });
        const response = await sesClient.send(
          new GetEmailIdentityCommand({ EmailIdentity: domain })
        );

        const tokens = response.DkimAttributes?.Tokens;
        if (tokens && tokens.length > 0) {
          return tokens;
        }
      } catch {} // baseline:allow-no-swallowed-errors — SES identity may not exist in this region
    }

    return [];
    // baseline:allow-next-line no-swallowed-errors — best-effort DKIM lookup, falls back to common selectors
  } catch {
    // No credentials, no metadata, or other error - fall back to common selectors
    return [];
  }
}
