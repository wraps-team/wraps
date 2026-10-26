import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkBlacklist,
  describeBlacklistCoverage,
  formatBlacklistResults,
  isValidListingResponse,
} from "../checks/blacklist.js";
import {
  DOMAIN_BLACKLISTS,
  IP_BLACKLISTS,
  QUICK_BLACKLISTS,
} from "../constants.js";
import type { BlacklistListing, BlacklistResult } from "../types.js";

// DNS is the only I/O. Every lookup answers "not listed" unless a test says
// otherwise, and batchDnsQuery runs sequentially so counts are deterministic.
const dns = vi.hoisted(() => ({
  resolveARecords: vi.fn(),
}));

vi.mock("../dns/index.js", () => ({
  resolveARecords: dns.resolveARecords,
  batchDnsQuery: async <T>(items: T[], fn: (item: T) => Promise<unknown>) => {
    for (const item of items) {
      await fn(item);
    }
    return [];
  },
}));

function notListed(): never {
  throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
}

beforeEach(() => {
  dns.resolveARecords.mockReset();
  dns.resolveARecords.mockImplementation(async () => notListed());
});

function emptyResult(
  overrides: Partial<BlacklistResult> = {}
): BlacklistResult {
  return {
    domainChecks: {
      checked: 0,
      listed: [],
      clean: [],
      errors: [],
      timeouts: [],
    },
    ipChecks: { checked: 0, listed: [], clean: [], errors: [], timeouts: [] },
    overallClean: true,
    quickMode: false,
    ...overrides,
  };
}

const listing: BlacklistListing = {
  blacklist: "ZapBL RHSBL",
  zone: "rhsbl.zapbl.net",
  priority: "low",
  type: "domain",
  target: "example.com",
  returnCode: "127.0.0.2",
  meaning: "Listed as spam source",
  delistUrl: null,
};

describe("isValidListingResponse", () => {
  it("accepts listings in 127.0.0.0/8", () => {
    for (const code of ["127.0.0.2", "127.0.0.3", "127.0.0.10", "127.0.1.2"]) {
      expect(isValidListingResponse(code)).toBe(true);
    }
  });

  it("rejects answers outside 127.0.0.0/8", () => {
    for (const code of [
      "208.98.40.36",
      "208.98.43.100",
      "208.98.40.223",
      "0.0.0.0",
      "1.2.3.4",
    ]) {
      expect(isValidListingResponse(code)).toBe(false);
    }
  });

  it("does not treat a 127-prefixed substring elsewhere as valid", () => {
    expect(isValidListingResponse("10.127.0.2")).toBe(false);
  });
});

describe("IP_BLACKLISTS", () => {
  it("does not ship the dead cbl.anti-spam.org.cn zone", () => {
    const zones = IP_BLACKLISTS.map((b) => b.zone);
    expect(zones).not.toContain("cbl.anti-spam.org.cn");
  });

  it("has no duplicate zones", () => {
    const zones = IP_BLACKLISTS.map((b) => b.zone);
    expect(new Set(zones).size).toBe(zones.length);
  });
});

describe("DOMAIN_BLACKLISTS", () => {
  it("has no duplicate zones, so one listing is never reported or deducted twice", () => {
    const zones = DOMAIN_BLACKLISTS.map((b) => b.zone);
    expect(new Set(zones).size).toBe(zones.length);
  });

  it("is the 15 domain lists the site and README describe", () => {
    expect(DOMAIN_BLACKLISTS).toHaveLength(15);
    expect(IP_BLACKLISTS).toHaveLength(38);
    expect(QUICK_BLACKLISTS).toHaveLength(10);
  });
});

describe("checkBlacklist coverage", () => {
  it("records a skipped check and makes no lookups", async () => {
    const result = await checkBlacklist({
      domain: "example.com",
      ips: ["192.0.2.1"],
      skip: true,
    });
    expect(result.skipped).toBe(true);
    expect(result.coverage).toEqual({
      domainLists: 0,
      ipLists: 0,
      ipAddresses: 0,
    });
    expect(dns.resolveARecords).not.toHaveBeenCalled();
    expect(describeBlacklistCoverage(result).state).toBe("skipped");
  });

  it("counts lists, not lookups: full mode against two IPv4 addresses", async () => {
    const result = await checkBlacklist({
      domain: "example.com",
      ips: ["192.0.2.1", "192.0.2.2"],
    });
    expect(result.coverage).toEqual({
      domainLists: 15,
      ipLists: 38,
      ipAddresses: 2,
    });
    // 15 + 38 * 2 lookups, but 53 lists.
    expect(result.domainChecks.checked + result.ipChecks.checked).toBe(91);
    const summary = describeBlacklistCoverage(result);
    expect(summary.state).toBe("clean");
    expect(summary.lists).toBe(53);
    expect(summary.headline).toBe("Clean on all 53 lists");
  });

  it("gives the same list count however many mail server IPs there are", async () => {
    const one = await checkBlacklist({
      domain: "example.com",
      ips: ["192.0.2.1"],
    });
    const five = await checkBlacklist({
      domain: "example.com",
      ips: ["192.0.2.1", "192.0.2.2", "192.0.2.3", "192.0.2.4", "192.0.2.5"],
    });
    expect(describeBlacklistCoverage(one).lists).toBe(
      describeBlacklistCoverage(five).lists
    );
  });

  it("quick mode checks the domain against 5 lists and each IPv4 against 10", async () => {
    const result = await checkBlacklist({
      domain: "example.com",
      ips: ["192.0.2.1", "2001:db8::1"],
      quick: true,
    });
    expect(result.coverage).toEqual({
      domainLists: 5,
      ipLists: 10,
      ipAddresses: 1,
    });
    expect(describeBlacklistCoverage(result).headline).toBe(
      "Clean on all 15 lists (quick mode)"
    );
  });

  it("pluralises the IPv4 address count correctly", async () => {
    const one = await checkBlacklist({
      domain: "example.com",
      ips: ["192.0.2.1"],
    });
    const two = await checkBlacklist({
      domain: "example.com",
      ips: ["192.0.2.1", "192.0.2.2"],
    });
    expect(describeBlacklistCoverage(one).detail).toBe(
      "Domain: 15 lists • Mail servers: 38 lists on 1 IPv4 address"
    );
    expect(describeBlacklistCoverage(two).detail).toBe(
      "Domain: 15 lists • Mail servers: 38 lists on 2 IPv4 addresses"
    );
  });

  it("does not count IPv6 addresses, which are never queried", async () => {
    const result = await checkBlacklist({
      domain: "example.com",
      ips: ["2001:db8::1"],
    });
    expect(result.coverage).toEqual({
      domainLists: 15,
      ipLists: 0,
      ipAddresses: 0,
    });
    expect(result.ipChecks.checked).toBe(0);
    const summary = describeBlacklistCoverage(result);
    expect(summary.lists).toBe(15);
    expect(summary.detail).toBe(
      "Domain: 15 lists • No IPv4 mail server addresses to check"
    );
  });
});

describe("describeBlacklistCoverage", () => {
  it("never says clean when lookups timed out", async () => {
    dns.resolveARecords.mockImplementation(async (query: string) => {
      if (query.endsWith(".zen.spamhaus.org")) {
        throw new Error("DNS A timed out after 5000ms");
      }
      return notListed();
    });
    const result = await checkBlacklist({
      domain: "example.com",
      ips: ["192.0.2.1"],
    });
    const summary = describeBlacklistCoverage(result);
    expect(result.overallClean).toBe(true); // still means "no listing found"
    expect(summary.state).toBe("incomplete");
    expect(summary.unanswered).toBe(1);
    expect(summary.unansweredLists).toEqual(["Spamhaus ZEN"]);
    expect(summary.headline).toBe(
      "No listings found; 1 of 53 lookups did not answer"
    );
    expect(summary.headline).not.toMatch(/clean/i);
  });

  it("names each list that did not answer once, however many IPs it failed on", () => {
    const result = emptyResult({
      coverage: { domainLists: 15, ipLists: 38, ipAddresses: 3 },
    });
    result.domainChecks.checked = 15;
    result.ipChecks.checked = 114;
    result.ipChecks.errors = [
      "WPBL: queryA ESERVFAIL 1.2.0.192.db.wpbl.info",
      "WPBL: queryA ESERVFAIL 2.2.0.192.db.wpbl.info",
      "WPBL: queryA ESERVFAIL 3.2.0.192.db.wpbl.info",
    ];
    result.domainChecks.timeouts = ["SURBL Multi"];
    const summary = describeBlacklistCoverage(result);
    expect(summary.unanswered).toBe(4);
    expect(summary.unansweredLists).toEqual(["WPBL", "SURBL Multi"]);
  });

  it("reports a listing before anything else", () => {
    const result = emptyResult({
      overallClean: false,
      coverage: { domainLists: 15, ipLists: 38, ipAddresses: 1 },
    });
    result.domainChecks.checked = 15;
    result.domainChecks.listed = [listing];
    const summary = describeBlacklistCoverage(result);
    expect(summary.state).toBe("listed");
    expect(summary.headline).toBe("Listed on 1 list");
    expect(formatBlacklistResults(result)).toContain(
      "• ZapBL RHSBL: Listed as spam source"
    );
  });

  it("still describes results that predate the coverage field", () => {
    const result = emptyResult();
    result.domainChecks.checked = 16;
    result.ipChecks.checked = 190;
    const summary = describeBlacklistCoverage(result);
    expect(summary.state).toBe("clean");
    expect(summary.lists).toBeNull();
    expect(summary.headline).toBe("Clean on every list checked");
  });

  it("does not throw on a hand-built result missing the errors and timeouts arrays", () => {
    const partial = {
      domainChecks: { checked: 3, listed: [], clean: [] },
      ipChecks: { checked: 0, listed: [], clean: [] },
      overallClean: true,
      quickMode: false,
    } as unknown as BlacklistResult;
    expect(describeBlacklistCoverage(partial).state).toBe("clean");
  });

  it("treats an old-shape result with no lookups as skipped, not clean", () => {
    expect(describeBlacklistCoverage(emptyResult()).state).toBe("skipped");
  });

  it("formats the clean string without the old N/N lookup count", () => {
    const result = emptyResult({
      coverage: { domainLists: 15, ipLists: 38, ipAddresses: 5 },
    });
    result.domainChecks.checked = 15;
    result.ipChecks.checked = 190;
    expect(formatBlacklistResults(result)).toBe("Clean on all 53 lists");
    expect(formatBlacklistResults(result)).not.toMatch(/205|206/);
  });
});
