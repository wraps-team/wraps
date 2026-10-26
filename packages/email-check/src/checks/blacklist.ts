/**
 * Blacklist Check
 * Checks domain and IPs against DNS-based blocklists
 */

import {
  BLACKLIST_BATCH_SIZE,
  DOMAIN_BLACKLISTS,
  IP_BLACKLISTS,
  QUICK_BLACKLISTS,
  SPAMHAUS_RETURN_CODES,
} from "../constants.js";
import { batchDnsQuery, resolveARecords } from "../dns/index.js";
import type {
  BlacklistConfig,
  BlacklistListing,
  BlacklistResult,
} from "../types.js";
import { isIpv4, reverseIp } from "../utils/domain.js";

/**
 * Return codes that indicate test/error responses, not actual listings
 * These should be ignored as they are not real blacklist entries
 */
const TEST_RETURN_CODES = new Set([
  "127.0.0.1", // Generic test response / query confirmation
  "127.0.1.255", // Spamhaus DBL test/error response
  "127.255.255.252", // DNS resolver test
  "127.255.255.254", // URIBL test response
  "127.255.255.255", // Reserved/test
]);

/**
 * A DNSBL signals a listing with an A record in 127.0.0.0/8. A routable answer
 * means the zone is dead or wildcarded, not that the target is listed.
 */
export function isValidListingResponse(returnCode: string): boolean {
  return returnCode.startsWith("127.");
}

/**
 * Check if a return code is a test/error response, or not a listing at all
 */
function isTestResponse(returnCode: string): boolean {
  return (
    !isValidListingResponse(returnCode) || TEST_RETURN_CODES.has(returnCode)
  );
}

export type BlacklistCheckOptions = {
  /**
   * Use the reduced list set: the first 5 of QUICK_BLACKLISTS for the domain
   * and all 10 for each IPv4 address.
   */
  quick?: boolean;
  /** Skip blacklist checks entirely */
  skip?: boolean;
  /** Domain to check */
  domain: string;
  /** IPs to check (from MX records) */
  ips?: string[];
};

/**
 * Check domain and IPs against blacklists
 */
export async function checkBlacklist(
  options: BlacklistCheckOptions
): Promise<BlacklistResult> {
  const { quick = false, skip = false, domain, ips = [] } = options;

  const result: BlacklistResult = {
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
    quickMode: quick,
  };

  if (skip) {
    result.skipped = true;
    result.coverage = { domainLists: 0, ipLists: 0, ipAddresses: 0 };
    return result;
  }

  // Determine which blacklists to check
  const domainBlacklists = quick
    ? QUICK_BLACKLISTS.slice(0, 5)
    : DOMAIN_BLACKLISTS;
  const ipBlacklists = quick ? QUICK_BLACKLISTS : IP_BLACKLISTS;

  // IPv6 is not queried (see checkIpBlacklists), so only IPv4 addresses count.
  const ipv4Count = ips.filter(isIpv4).length;
  result.skipped = false;
  result.coverage = {
    domainLists: domainBlacklists.length,
    ipLists: ipv4Count > 0 ? ipBlacklists.length : 0,
    ipAddresses: ipv4Count,
  };

  // Check domain blacklists
  await checkDomainBlacklists(domain, domainBlacklists, result);

  // Check IP blacklists
  if (ips.length > 0) {
    await checkIpBlacklists(ips, ipBlacklists, result);
  }

  // Determine if overall clean
  result.overallClean =
    result.domainChecks.listed.length === 0 &&
    result.ipChecks.listed.length === 0;

  return result;
}

/**
 * Check domain against domain blacklists
 */
async function checkDomainBlacklists(
  domain: string,
  blacklists: BlacklistConfig[],
  result: BlacklistResult
): Promise<void> {
  const checks = blacklists.map((bl) => ({
    blacklist: bl,
    query: `${domain}.${bl.zone}`,
  }));

  await batchDnsQuery(
    checks,
    async (check) => {
      result.domainChecks.checked++;
      try {
        const records = await resolveARecords(check.query);
        const firstRecord = records[0];
        // Filter out test responses
        if (records.length > 0 && firstRecord && !isTestResponse(firstRecord)) {
          const listing = createListing(
            check.blacklist,
            "domain",
            domain,
            firstRecord
          );
          result.domainChecks.listed.push(listing);
          result.overallClean = false;
        } else {
          result.domainChecks.clean.push(check.blacklist.name);
        }
      } catch (error: any) {
        if (error.message?.includes("timed out")) {
          result.domainChecks.timeouts.push(check.blacklist.name);
        } else if (error.code !== "ENOTFOUND" && error.code !== "ENODATA") {
          result.domainChecks.errors.push(
            `${check.blacklist.name}: ${error.message}`
          );
        } else {
          // ENOTFOUND/ENODATA means not listed
          result.domainChecks.clean.push(check.blacklist.name);
        }
      }
    },
    BLACKLIST_BATCH_SIZE
  );
}

/**
 * Check IPs against IP blacklists
 */
async function checkIpBlacklists(
  ips: string[],
  blacklists: BlacklistConfig[],
  result: BlacklistResult
): Promise<void> {
  // Filter to IPv4 only for now (IPv6 blacklist queries are more complex)
  const ipv4Ips = ips.filter(isIpv4);

  // One pool across every (IP, list) pair, not one batch per IP in turn. Each
  // batch waits for its slowest lookup (up to the DNS timeout), so querying IPs
  // one after another made the worst case grow with the number of mail servers.
  const checks = ipv4Ips.flatMap((ip) => {
    const reversedIp = reverseIp(ip);
    return blacklists.map((bl) => ({
      blacklist: bl,
      query: `${reversedIp}.${bl.zone}`,
      ip,
    }));
  });

  await batchDnsQuery(
    checks,
    async (check) => {
      result.ipChecks.checked++;
      try {
        const records = await resolveARecords(check.query);
        const firstRecord = records[0];
        // Filter out test responses
        if (records.length > 0 && firstRecord && !isTestResponse(firstRecord)) {
          const listing = createListing(
            check.blacklist,
            "ip",
            check.ip,
            firstRecord
          );
          result.ipChecks.listed.push(listing);
          result.overallClean = false;
        } else {
          result.ipChecks.clean.push(check.blacklist.name);
        }
      } catch (error: any) {
        if (error.message?.includes("timed out")) {
          result.ipChecks.timeouts.push(check.blacklist.name);
        } else if (error.code !== "ENOTFOUND" && error.code !== "ENODATA") {
          result.ipChecks.errors.push(
            `${check.blacklist.name}: ${error.message}`
          );
        } else {
          result.ipChecks.clean.push(check.blacklist.name);
        }
      }
    },
    BLACKLIST_BATCH_SIZE
  );
}

/**
 * Create a blacklist listing
 */
function createListing(
  blacklist: BlacklistConfig,
  type: "domain" | "ip",
  target: string,
  returnCode: string
): BlacklistListing {
  return {
    blacklist: blacklist.name,
    zone: blacklist.zone,
    priority: blacklist.priority || "medium",
    type,
    target,
    returnCode,
    meaning: getMeaning(blacklist.zone, returnCode),
    delistUrl: getDelistUrl(blacklist.zone),
  };
}

/**
 * Get meaning of return code
 */
function getMeaning(zone: string, returnCode: string): string {
  if (zone.includes("spamhaus")) {
    return SPAMHAUS_RETURN_CODES[returnCode] || `Listed (${returnCode})`;
  }

  // Common return codes
  if (returnCode === "127.0.0.2") {
    return "Listed as spam source";
  }
  if (returnCode === "127.0.0.3") {
    return "Listed as spam source (elevated threat)";
  }

  return `Listed (${returnCode})`;
}

/**
 * Get delist URL for a blacklist
 */
function getDelistUrl(zone: string): string | null {
  const delistUrls: Record<string, string> = {
    "zen.spamhaus.org": "https://check.spamhaus.org/",
    "dbl.spamhaus.org": "https://check.spamhaus.org/",
    "sbl.spamhaus.org": "https://check.spamhaus.org/",
    "xbl.spamhaus.org": "https://check.spamhaus.org/",
    "pbl.spamhaus.org": "https://check.spamhaus.org/",
    "b.barracudacentral.org": "https://www.barracudacentral.org/lookups",
    "bl.spamcop.net": "https://www.spamcop.net/bl.shtml",
    "cbl.abuseat.org": "https://cbl.abuseat.org/lookup.cgi",
    "dnsbl.sorbs.net": "http://www.sorbs.net/lookup.shtml",
  };

  return delistUrls[zone] || null;
}

export type BlacklistSummary = {
  /**
   * - skipped: nothing was looked up
   * - listed: at least one listing was found
   * - incomplete: nothing listed, but some lookups did not answer
   * - clean: nothing listed and every lookup answered
   */
  state: "skipped" | "listed" | "incomplete" | "clean";
  listings: number;
  /** Lookups attempted: one per list for the domain, plus one per list per IPv4 address. */
  lookups: number;
  /** Lookups that errored or timed out. */
  unanswered: number;
  /** The lists behind those lookups, once each, in the order they were met. */
  unansweredLists: string[];
  /** Lists consulted, or null when the result predates `coverage`. */
  lists: number | null;
  /** One line, safe to show next to a check or cross. Never says "clean" unless it is. */
  headline: string;
  /** Second line: what the lists were run against. Null when there is nothing to add. */
  detail: string | null;
};

function plural(n: number, noun: string, many = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : many}`;
}

/**
 * Say what a blacklist check actually covered.
 *
 * `checked` counts lookups (list x target), not lists, and it includes lookups
 * that never got an answer. Printing it as "clean on N lists" claims more than
 * was established, and the number changes with how many mail server IPs a
 * domain has. Callers render this instead and add their own colour.
 */
export function describeBlacklistCoverage(
  result: BlacklistResult
): BlacklistSummary {
  // Tolerate results that lack the arrays (hand-built or from older callers):
  // an absent array is an empty one.
  const domain = result.domainChecks;
  const ip = result.ipChecks;
  const unansweredEntries = [
    ...(domain.errors ?? []),
    ...(ip.errors ?? []),
    ...(domain.timeouts ?? []),
    ...(ip.timeouts ?? []),
  ];
  const listings = (domain.listed?.length ?? 0) + (ip.listed?.length ?? 0);
  const lookups = (domain.checked ?? 0) + (ip.checked ?? 0);
  const unanswered = unansweredEntries.length;
  // Errors are "List name: message"; timeouts are the bare list name.
  const unansweredLists = [
    ...new Set(
      unansweredEntries.map((entry) => entry.split(":")[0]?.trim() ?? entry)
    ),
  ];
  const coverage = result.coverage;
  const lists = coverage ? coverage.domainLists + coverage.ipLists : null;
  const mode = result.quickMode ? " (quick mode)" : "";

  let detail: string | null = null;
  if (coverage && lists) {
    detail =
      coverage.ipAddresses > 0
        ? `Domain: ${plural(coverage.domainLists, "list")} • Mail servers: ${plural(coverage.ipLists, "list")} on ${plural(coverage.ipAddresses, "IPv4 address", "IPv4 addresses")}`
        : `Domain: ${plural(coverage.domainLists, "list")} • No IPv4 mail server addresses to check`;
  }

  if (result.skipped === true || lookups === 0) {
    return {
      state: "skipped",
      listings: 0,
      lookups,
      unanswered,
      unansweredLists,
      lists,
      headline: "Skipped",
      detail: null,
    };
  }

  if (listings > 0) {
    return {
      state: "listed",
      listings,
      lookups,
      unanswered,
      unansweredLists,
      lists,
      headline: `Listed on ${plural(listings, "list")}`,
      detail,
    };
  }

  if (unanswered > 0) {
    return {
      state: "incomplete",
      listings,
      lookups,
      unanswered,
      unansweredLists,
      lists,
      headline: `No listings found; ${unanswered} of ${plural(lookups, "lookup")} did not answer`,
      detail,
    };
  }

  return {
    state: "clean",
    listings,
    lookups,
    unanswered,
    unansweredLists,
    lists,
    headline:
      lists === null
        ? `Clean on every list checked${mode}`
        : `Clean on all ${plural(lists, "list")}${mode}`,
    detail,
  };
}

/**
 * Format blacklist results for display
 */
export function formatBlacklistResults(result: BlacklistResult): string {
  const summary = describeBlacklistCoverage(result);

  if (summary.state !== "listed") {
    return summary.headline;
  }

  const lines: string[] = [summary.headline];

  // Show domain listings
  for (const listing of result.domainChecks.listed) {
    lines.push(`• ${listing.blacklist}: ${listing.meaning}`);
    if (listing.delistUrl) {
      lines.push(`  Delist: ${listing.delistUrl}`);
    }
  }

  // Show IP listings
  for (const listing of result.ipChecks.listed) {
    lines.push(
      `• ${listing.blacklist} (${listing.target}): ${listing.meaning}`
    );
    if (listing.delistUrl) {
      lines.push(`  Delist: ${listing.delistUrl}`);
    }
  }

  return lines.join("\n");
}
