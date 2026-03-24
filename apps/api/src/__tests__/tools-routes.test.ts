import type { EmailCheckResult } from "@wraps/email-check";
import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDynamoSend, mockRunEmailCheck } = vi.hoisted(() => ({
  mockDynamoSend: vi.fn(),
  mockRunEmailCheck: vi.fn(),
}));

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    send = mockDynamoSend;
  }

  class GetItemCommand {
    constructor(public input: unknown) {}
  }

  class PutItemCommand {
    constructor(public input: unknown) {}
  }

  return {
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand,
  };
});

vi.mock("@wraps/email-check", () => ({
  runEmailCheck: mockRunEmailCheck,
}));

vi.mock("../middleware/public-rate-limit", () => ({
  publicRateLimitMiddleware: new Elysia({ name: "public-rate-limit" }),
}));

const { toolsRoutes } = await import("../routes/tools");

type DynamoCommand = {
  input: {
    Item?: {
      pk?: { S?: string };
    };
    Key?: {
      pk?: { S?: string };
    };
  };
};

function createApp() {
  return new Elysia().use(toolsRoutes);
}

function createEmailCheckResult(domain: string = "example.com"): EmailCheckResult {
  return {
    domain,
    checkedAt: "2026-03-24T10:00:00.000Z",
    duration: 125,
    options: {
      quick: false,
      skipBlacklists: false,
      skipTls: true,
      dkimSelectors: ["selector-b", "selector-a"],
    },
    spf: {
      exists: true,
      valid: true,
      record: "v=spf1 include:amazonses.com -all",
      lookupCount: 1,
      lookupLimit: 10,
      lookupTree: [],
      allMechanism: "-all",
      includes: ["amazonses.com"],
      hasPtr: false,
      warnings: [],
    },
    dkim: {
      found: true,
      selectors: [
        {
          selector: "selector-b",
          valid: true,
          revoked: false,
          keyType: "rsa",
          keyBits: 2048,
          testMode: false,
        },
        {
          selector: "selector-a",
          valid: false,
          revoked: true,
          keyType: "rsa",
          keyBits: 1024,
          testMode: false,
        },
      ],
      selectorsChecked: 2,
      warnings: [],
    },
    dmarc: {
      exists: true,
      valid: true,
      record: "v=DMARC1; p=reject;",
      policy: "reject",
      subdomainPolicy: "reject",
      reportingEnabled: true,
      percentage: 100,
      alignmentSpf: "r",
      alignmentDkim: "r",
      ruaAddresses: ["mailto:dmarc@example.com"],
      warnings: [],
    },
    mx: {
      exists: true,
      hasRedundancy: true,
      records: [
        {
          exchange: "mx.example.com",
          priority: 10,
          resolves: true,
          ipv4Addresses: ["203.0.113.10"],
          ipv6Addresses: ["2001:db8::10"],
        },
      ],
    },
    mxTls: {
      checked: false,
      skipped: true,
      skipReason: "disabled in route",
      servers: [],
    },
    mtaSts: {
      configured: false,
      policy: null,
    },
    tlsRpt: {
      configured: false,
      rua: [],
    },
    reverseDns: {
      allHavePtr: true,
      allConfirm: true,
      results: [],
    },
    ipv6: {
      mxHasIpv6: true,
      spfIncludesIpv6: false,
      mxIpv6Addresses: ["2001:db8::10"],
    },
    blacklist: {
      quickMode: false,
      overallClean: true,
      domainChecks: {
        checked: 1,
        listed: [],
        clean: ["zen.example.test"],
      },
      ipChecks: {
        checked: 1,
        listed: [],
        clean: ["zen.example.test"],
      },
    },
    domainAge: {
      ageInDays: 365,
      createdAt: "2025-03-24T10:00:00.000Z",
      expiresAt: "2027-03-24T10:00:00.000Z",
      daysUntilExpiry: 365,
      registrar: "Example Registrar",
      source: "rdap",
      privacyEnabled: false,
    },
    dnssec: {
      enabled: true,
      valid: true,
    },
    caa: {
      configured: false,
      allowedIssuers: [],
    },
    bimi: {
      configured: false,
      record: null,
      location: null,
      hasVmc: false,
      vmcAuthority: null,
      warnings: [],
    },
    score: {
      finalScore: 97,
      grade: "A",
      deductions: [
        {
          check: "spf",
          reason: "sample deduction",
          points: 5,
        },
      ],
      bonuses: [
        {
          check: "blacklist",
          reason: "clean",
          points: 5,
        },
      ],
      breakdown: {
        spf: { score: 25, max: 30 },
        dkim: { score: 25, max: 25 },
        dmarc: { score: 25, max: 25 },
        mx: { score: 10, max: 10 },
        blacklist: { score: 10, max: 10 },
      },
    },
  } as EmailCheckResult;
}

function createCachedItem(data: unknown) {
  return {
    Item: {
      data: { S: JSON.stringify(data) },
      expiresAt: { N: String(Math.floor(Date.now() / 1000) + 300) },
    },
  };
}

function getDynamoCommand(index: number): DynamoCommand {
  return mockDynamoSend.mock.calls[index]?.[0] as DynamoCommand;
}

describe("toolsRoutes", () => {
  beforeEach(() => {
    mockDynamoSend.mockReset();
    mockDynamoSend.mockResolvedValue({});
    mockRunEmailCheck.mockReset();
  });

  it("rejects invalid domains before touching cache or email checks", async () => {
    const app = createApp();

    const response = await app.handle(
      new Request("http://localhost/tools/email-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "invalid_domain",
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Invalid domain format",
      domain: "invalid_domain",
    });
    expect(response.headers.get("x-cache")).toBeNull();
    expect(mockDynamoSend).not.toHaveBeenCalled();
    expect(mockRunEmailCheck).not.toHaveBeenCalled();
  });

  it("returns cached POST results without running a live check", async () => {
    const cachedResponse = {
      success: true,
      domain: "example.com",
      checkedAt: "2026-03-24T10:00:00.000Z",
    };

    mockDynamoSend.mockResolvedValueOnce(createCachedItem(cachedResponse));

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/tools/email-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "example.com",
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(cachedResponse);
    expect(response.headers.get("x-cache")).toBe("HIT");
    expect(getDynamoCommand(0).input.Key?.pk?.S).toBe(
      "cache:email-check:example.com:quick"
    );
    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
    expect(mockRunEmailCheck).not.toHaveBeenCalled();
  });

  it("uses sorted full-mode cache keys and array selectors on POST cache misses", async () => {
    const result = createEmailCheckResult();
    mockRunEmailCheck.mockResolvedValueOnce(result);

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/tools/email-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "Example.com",
          quick: false,
          dkimSelector: "ignored-selector",
          dkimSelectors: ["selector-b", "selector-a"],
        }),
      })
    );

    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache")).toBe("MISS");
    expect(mockRunEmailCheck).toHaveBeenCalledWith("Example.com", {
      quick: false,
      skipBlacklists: false,
      skipTls: true,
      dkimSelectors: ["selector-b", "selector-a"],
    });
    expect(mockDynamoSend).toHaveBeenCalledTimes(2);
    expect(getDynamoCommand(0).input.Key?.pk?.S).toBe(
      "cache:email-check:example.com:full:dkim:selector-a,selector-b"
    );
    expect(getDynamoCommand(1).input.Item?.pk?.S).toBe(
      "cache:email-check:example.com:full:dkim:selector-a,selector-b"
    );
    expect(json).toMatchObject({
      success: true,
      domain: "example.com",
      score: {
        grade: "A",
        score: 97,
      },
      blacklist: {
        checked: true,
        overallClean: true,
      },
      dkim: {
        found: true,
        selectorsChecked: 2,
        selectorsFound: [
          {
            selector: "selector-b",
            keyType: "rsa",
            keyBits: 2048,
            testMode: false,
          },
        ],
      },
    });
  });

  it("returns GET errors without caching failed checks", async () => {
    mockRunEmailCheck.mockRejectedValueOnce(new Error("DNS lookup failed"));

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/tools/email-check/example.com")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "DNS lookup failed",
      domain: "example.com",
    });
    expect(response.headers.get("x-cache")).toBeNull();
    expect(mockRunEmailCheck).toHaveBeenCalledWith("example.com", {
      quick: true,
      skipBlacklists: true,
      skipTls: true,
    });
    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
  });
});
