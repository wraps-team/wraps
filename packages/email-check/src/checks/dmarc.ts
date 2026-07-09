/**
 * DMARC Check
 * Validates DMARC records
 */

import { findDmarcRecord } from "../dns/index.js";
import type { DmarcResult } from "../types.js";

/**
 * Check DMARC record for a domain
 */
export async function checkDmarc(domain: string): Promise<DmarcResult> {
  const result: DmarcResult = {
    exists: false,
    record: null,
    valid: false,
    policy: null,
    subdomainPolicy: null,
    nonExistentSubdomainPolicy: null,
    testing: false,
    psd: null,
    percentage: 100,
    reportingEnabled: false,
    ruaAddresses: [],
    rufAddresses: [],
    alignmentSpf: "relaxed",
    alignmentDkim: "relaxed",
    failureOptions: "0",
    reportInterval: 86_400,
    reportFormat: "afrf",
    errors: [],
    warnings: [],
  };

  try {
    const record = await findDmarcRecord(domain);

    if (!record) {
      return result;
    }

    result.exists = true;
    result.record = record;

    // Parse DMARC record
    parseDmarcRecord(record, result);
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

/**
 * Parse a DMARC TXT record
 */
function parseDmarcRecord(record: string, result: DmarcResult): void {
  // Parse tags
  const tags = parseDmarcTags(record);

  // Check version
  const version = tags.get("v");
  if (version !== "DMARC1") {
    result.errors.push(`Invalid DMARC version: ${version || "missing"}`);
    return;
  }

  // Get policy (required)
  const policy = tags.get("p");
  if (!policy) {
    result.errors.push("Missing required policy (p=)");
    return;
  }

  if (!["none", "quarantine", "reject"].includes(policy)) {
    result.errors.push(`Invalid policy: ${policy}`);
    return;
  }

  result.policy = policy as DmarcResult["policy"];

  // Get subdomain policy
  const subdomainPolicy = tags.get("sp");
  if (subdomainPolicy) {
    if (["none", "quarantine", "reject"].includes(subdomainPolicy)) {
      result.subdomainPolicy =
        subdomainPolicy as DmarcResult["subdomainPolicy"];
    } else {
      result.warnings.push(`Invalid subdomain policy: ${subdomainPolicy}`);
    }
  } else {
    // Defaults to same as p=
    result.subdomainPolicy = result.policy;
  }

  // Get non-existent subdomain policy (np) — DMARCbis / RFC 9989.
  // Closes the phantom-subdomain spoofing gap that p= and sp= don't cover.
  const np = tags.get("np");
  if (np) {
    if (["none", "quarantine", "reject"].includes(np)) {
      result.nonExistentSubdomainPolicy =
        np as DmarcResult["nonExistentSubdomainPolicy"];
    } else {
      result.warnings.push(`Invalid non-existent subdomain policy (np): ${np}`);
    }
  }

  // Testing flag (t=y) — DMARCbis's replacement for pct-based ramping.
  // When set, receivers apply the policy for reporting but not disposition.
  if (tags.get("t") === "y") {
    result.testing = true;
  }

  // Public suffix domain declaration (psd) — DMARCbis / RFC 9989
  const psd = tags.get("psd");
  if (psd && ["y", "n", "u"].includes(psd)) {
    result.psd = psd as DmarcResult["psd"];
  }

  // Get percentage (pct) — retired in DMARCbis; receivers ignore it
  const pct = tags.get("pct");
  if (pct) {
    const pctNum = Number.parseInt(pct, 10);
    if (Number.isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      result.warnings.push(`Invalid percentage: ${pct}`);
    } else {
      result.percentage = pctNum;
      if (pctNum < 100) {
        result.warnings.push(
          `pct=${pctNum} is deprecated (DMARCbis receivers ignore it; enforcement is all-or-nothing). Use t=y while testing instead.`
        );
      }
    }
  }

  // Get aggregate report addresses (rua)
  const rua = tags.get("rua");
  if (rua) {
    result.ruaAddresses = parseReportAddresses(rua);
    result.reportingEnabled = result.ruaAddresses.length > 0;
  }

  // Get forensic report addresses (ruf)
  const ruf = tags.get("ruf");
  if (ruf) {
    result.rufAddresses = parseReportAddresses(ruf);
  }

  // Get SPF alignment mode
  const aspf = tags.get("aspf");
  if (aspf) {
    if (aspf === "s") {
      result.alignmentSpf = "strict";
    } else if (aspf === "r") {
      result.alignmentSpf = "relaxed";
    } else {
      result.warnings.push(`Invalid SPF alignment mode: ${aspf}`);
    }
  }

  // Get DKIM alignment mode
  const adkim = tags.get("adkim");
  if (adkim) {
    if (adkim === "s") {
      result.alignmentDkim = "strict";
    } else if (adkim === "r") {
      result.alignmentDkim = "relaxed";
    } else {
      result.warnings.push(`Invalid DKIM alignment mode: ${adkim}`);
    }
  }

  // Get failure reporting options
  const fo = tags.get("fo");
  if (fo) {
    const validOptions = ["0", "1", "d", "s"];
    const options = fo.split(":").map((o) => o.trim());
    for (const opt of options) {
      if (!validOptions.includes(opt)) {
        result.warnings.push(`Unknown failure option: ${opt}`);
      }
    }
    result.failureOptions = fo;
  }

  // Get report interval
  const ri = tags.get("ri");
  if (ri) {
    const riNum = Number.parseInt(ri, 10);
    if (Number.isNaN(riNum) || riNum < 0) {
      result.warnings.push(`Invalid report interval: ${ri}`);
    } else {
      result.reportInterval = riNum;
    }
  }

  // Get report format
  const rf = tags.get("rf");
  if (rf) {
    result.reportFormat = rf;
  }

  // Validate and add warnings
  if (result.policy === "none") {
    result.warnings.push(
      'DMARC policy is "none" - not enforcing authentication'
    );
  }

  if (result.subdomainPolicy === "none" && result.policy !== "none") {
    result.warnings.push("Subdomain policy is less strict than domain policy");
  }

  const enforcing =
    result.policy === "quarantine" || result.policy === "reject";

  if (result.testing && result.policy !== "none") {
    result.warnings.push(
      "t=y (testing) is set — receivers will not enforce the policy"
    );
  }

  if (enforcing && !result.nonExistentSubdomainPolicy) {
    result.warnings.push(
      "No np= set — add np=reject to block spoofing from non-existent subdomains (DMARCbis)"
    );
  }

  if (!result.reportingEnabled) {
    result.warnings.push("No aggregate reporting configured (rua=)");
  }

  // Check for external report destination validation
  for (const addr of [...result.ruaAddresses, ...result.rufAddresses]) {
    const match = addr.match(/^mailto:([^@]+)@(.+)$/i);
    if (match) {
      const _domain = result.record?.includes("_dmarc.")
        ? result.record.split("_dmarc.")[1]?.split(" ")[0]
        : null;
      // Note: Full external validation would require checking DNS
      // for the _report._dmarc record at the destination domain
    }
  }

  // Mark as valid if no errors
  result.valid = result.errors.length === 0;
}

/**
 * Parse DMARC tags from a record
 */
function parseDmarcTags(record: string): Map<string, string> {
  const tags = new Map<string, string>();

  // Split by semicolon, handling whitespace
  const parts = record
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = part.slice(0, eqIndex).trim().toLowerCase();
    const value = part.slice(eqIndex + 1).trim();
    tags.set(key, value);
  }

  return tags;
}

/**
 * Parse report addresses from rua/ruf tag
 */
function parseReportAddresses(value: string): string[] {
  // Split by comma, handle mailto: URIs
  return value
    .split(",")
    .map((addr) => addr.trim())
    .filter(Boolean);
}

/**
 * Format DMARC results for display
 */
export function formatDmarcResult(result: DmarcResult): string {
  if (!result.exists) {
    return "No DMARC record found";
  }

  if (!result.valid) {
    return `Invalid DMARC record: ${result.errors.join(", ")}`;
  }

  const parts: string[] = [];

  // Policy
  parts.push(`Policy: ${result.policy}`);

  // Reporting
  if (result.reportingEnabled) {
    parts.push("Reporting: enabled");
  } else {
    parts.push("Reporting: disabled");
  }

  // Alignment
  if (result.alignmentSpf === "strict" && result.alignmentDkim === "strict") {
    parts.push("Alignment: strict");
  } else if (
    result.alignmentSpf === "relaxed" &&
    result.alignmentDkim === "relaxed"
  ) {
    parts.push("Alignment: relaxed");
  } else {
    parts.push(
      `Alignment: SPF=${result.alignmentSpf}, DKIM=${result.alignmentDkim}`
    );
  }

  return parts.join(" • ");
}
