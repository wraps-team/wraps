import {
  describeBlacklistCoverage,
  type EmailCheckResult,
  formatSpfLookupTree,
  getExitCode,
  hardfailWithoutEnforcingDmarc,
  runEmailCheck,
} from "@wraps.dev/email-check";
import pc from "picocolors";
import type { ParsedArgs } from "../parse-args.js";
import { createSpinner, printJson } from "../utils.js";

export async function runCheck(
  domain: string,
  flags: ParsedArgs["flags"]
): Promise<void> {
  const spinner = flags.json ? null : createSpinner();
  spinner?.start(`Checking ${pc.cyan(domain)}...`);

  try {
    const result = await runEmailCheck(domain, {
      quick: flags.quick,
      verbose: flags.verbose,
      skipBlacklists: flags.skipBlacklists,
      skipTls: flags.skipTls,
      timeout: flags.timeout,
    });

    spinner?.stop();

    if (flags.json) {
      printJson(result);
    } else {
      displayResults(result, flags);
    }

    process.exit(getExitCode(result.score.grade));
  } catch (error) {
    spinner?.stop();
    const msg = error instanceof Error ? error.message : String(error);
    if (flags.json) {
      printJson({ error: msg });
    } else {
      console.log(pc.red(`Error: ${msg}`));
    }
    process.exit(4);
  }
}

export function displayResults(
  result: EmailCheckResult,
  flags: ParsedArgs["flags"]
): void {
  const { score, spf, dkim, dmarc, mx, blacklist } = result;

  console.log();
  displayScoreBox(result.domain, score.finalScore, score.grade, flags.quick);
  console.log();

  // Authentication section
  console.log(pc.bold("AUTHENTICATION"));
  console.log();

  displaySpfResult(spf, dmarc, flags.verbose);
  displayDkimResult(dkim);
  displayDmarcResult(dmarc);

  console.log();

  // Infrastructure section
  console.log(pc.bold("INFRASTRUCTURE"));
  console.log();

  displayMxResult(mx);
  displayMxTlsResult(result);
  displayReverseDnsResult(result);
  displayIpv6Result(result);

  console.log();

  // Reputation section
  console.log(pc.bold("REPUTATION"));
  console.log();

  displayBlacklistResult(blacklist);
  displayDomainAgeResult(result);

  // Security section
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
      for (const [i, d] of criticalDeductions.entries()) {
        console.log(
          `  ${i + 1}. ${d.reason} (${pc.red(`-${d.points} points`)})`
        );
        console.log();
        console.log(`     ${getFixSuggestion(d.check)}`);
        console.log();
      }
    }

    if (warningDeductions.length > 0) {
      console.log(pc.yellow("⚠️  WARNINGS"));
      console.log();
      for (const [i, d] of warningDeductions.entries()) {
        console.log(`  ${criticalDeductions.length + i + 1}. ${d.reason}`);
        console.log();
      }
    }
  }

  // Footer
  console.log();
  console.log(pc.dim("─".repeat(78)));
  console.log();

  if (score.grade === "A") {
    const msg =
      score.finalScore === 100
        ? "Perfect! SPF + DKIM + DMARC enforcing with all best practices."
        : "Excellent! SPF + DKIM + DMARC enforcing. Check deductions above for the last few points.";
    console.log(pc.green(`✅ ${msg}`));
  } else if (score.grade === "B") {
    console.log(
      pc.yellow(
        "⚠️  All three records present, but DMARC is not enforcing. Set policy to quarantine or reject to reach grade A."
      )
    );
    console.log();
    console.log(
      `  ${pc.cyan(`wraps.dev/tools?domain=${result.domain}&utm_source=mail-audit&utm_medium=cli&grade=${score.grade}`)}`
    );
  } else {
    console.log(
      pc.yellow("Need help fixing these? Check your domain's full report:")
    );
    console.log();
    console.log(
      `  ${pc.cyan(`wraps.dev/tools?domain=${result.domain}&utm_source=mail-audit&utm_medium=cli&grade=${score.grade}`)}`
    );
  }

  console.log();
}

export function displayScoreBox(
  domain: string,
  score: number,
  grade: string,
  quick?: boolean
): void {
  const width = 78;
  const innerWidth = width - 2;
  const barLen = Math.round((score / 100) * 60);
  const bar = "━".repeat(barLen);
  const emptyBar = "─".repeat(60 - barLen);

  const gradeColor =
    grade === "A" || grade === "B"
      ? pc.green
      : grade === "C"
        ? pc.yellow
        : grade === "D"
          ? pc.magenta
          : pc.red;

  const line = (content: string): string => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence stripping
    const visible = content.replace(/\x1B\[[0-9;]*m/g, "").length;
    const pad = Math.max(0, innerWidth - visible);
    return pc.dim("│") + content + " ".repeat(pad) + pc.dim("│");
  };

  console.log(pc.dim(`╭${"─".repeat(innerWidth)}╮`));
  console.log(line(""));
  console.log(line(`   ${pc.bold(`mail-audit${quick ? " --quick" : ""}`)}`));
  console.log(line(""));
  console.log(
    line(
      `   Domain: ${pc.cyan(domain.length > 60 ? `${domain.slice(0, 57)}...` : domain)}`
    )
  );
  console.log(line(""));
  console.log(
    line(
      `   ${gradeColor(bar)}${pc.dim(emptyBar)}  ${gradeColor(pc.bold(grade))}`
    )
  );
  console.log(line(`   Score: ${pc.bold(`${score}/100`)}`));
  console.log(line(""));
  console.log(pc.dim(`╰${"─".repeat(innerWidth)}╯`));
}

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
    if (spf.multipleRecords) {
      console.log(
        `                     ${pc.red(`${spf.records.length} SPF records found — RFC 7208 allows only one`)}`
      );
      for (const rec of spf.records) {
        console.log(`                     ${pc.dim(rec)}`);
      }
      console.log(
        `                     ${pc.yellow("Merge into a single record to fix")}`
      );
    } else {
      const lookupColor =
        spf.lookupCount <= 8
          ? pc.green
          : spf.lookupCount <= 10
            ? pc.yellow
            : pc.red;
      console.log(
        `                     ${lookupColor(`${spf.lookupCount}/10 DNS lookups used`)}`
      );

      if (verbose && spf.lookupTree.length > 0) {
        console.log();
        console.log(
          "                     " +
            formatSpfLookupTree(spf.lookupTree)
              .split("\n")
              .join("\n                     ")
        );
      }

      if (hardfailWithoutEnforcingDmarc(spf, dmarc)) {
        console.log(
          `                     ${pc.yellow("Hardfail (-all) with no enforcing DMARC — forwarded mail is rejected before DKIM is checked")}`
        );
      }
    }
  }

  console.log();
}

function displayDkimResult(dkim: EmailCheckResult["dkim"]): void {
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
    for (const warning of dkim.warnings) {
      console.log(`                     ${pc.yellow(`💡 ${warning}`)}`);
    }
  }

  console.log();
}

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

function getFixSuggestion(check: string): string {
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
