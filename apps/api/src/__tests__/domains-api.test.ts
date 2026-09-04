/**
 * GET /v1/domains and GET /v1/domains/:identity — boundary-mocked
 *
 * No real DB, no real AWS. Boundaries mocked: SESv2 (ListEmailIdentities,
 * GetEmailIdentity), `../services/credentials` (STS assume-role is not
 * exercised here — that path is covered by account-health-role-access.test.ts),
 * `@wraps/db` (the org-scoped account select), and the DynamoDB-backed rate
 * limiter. The real onError handler is mounted via createErrorHarness so
 * thrown 4xx statuses and their `code` values come from the actual handler,
 * not a hand-copied mirror.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createErrorHarness } from "./error-handler-harness";

type AccountRow = { id: string; accountId: string; region: string };

// Hoisted so the mock factories below (which run before this file's own
// top-level code) can close over them.
const { accountRowsRef, mockGetCredentials, mockSesSend } = vi.hoisted(() => ({
  accountRowsRef: { current: [] as AccountRow[] },
  mockGetCredentials: vi.fn(),
  mockSesSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = mockSesSend;
  },
  ListEmailIdentitiesCommand: class {
    constructor(public input: unknown) {}
  },
  GetEmailIdentityCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock("../services/credentials", () => ({
  getCredentials: mockGetCredentials,
}));

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

// The route's own org-scoped select — a mutable array standing in for
// "what a real, already-filtered query would return". Each test sets
// accountRowsRef.current to the rows a real WHERE would have produced.
vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(accountRowsRef.current)),
      })),
    })),
  },
  awsAccount: {
    id: "id",
    organizationId: "organization_id",
    accountId: "account_id",
    region: "region",
  },
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));

const { domainsRoutes } = await import("../routes/domains");

const AUTH = {
  apiKeyId: "key-1",
  organizationId: "org-1",
  userId: null,
  planId: "pro",
};

const CREDENTIALS = {
  accessKeyId: "a",
  secretAccessKey: "b",
  sessionToken: "c",
  expiration: new Date(Date.now() + 3_600_000),
  region: "us-east-1",
};

function appFor(auth: typeof AUTH = AUTH) {
  const { app } = createErrorHarness();
  return app.derive(() => ({ auth })).use(domainsRoutes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(domainsRoutes);
}

function commandName(command: unknown): string {
  return (command as { constructor: { name: string } }).constructor.name;
}

beforeEach(() => {
  accountRowsRef.current = [];
  mockGetCredentials.mockReset();
  mockSesSend.mockReset();
});

describe("GET /v1/domains", () => {
  it("returns 401 when no auth is provided", async () => {
    const app = unauthedApp();
    const res = await app.handle(new Request("http://localhost/v1/domains"));
    expect(res.status).toBe(401);
  });

  it("calls getCredentials once per this org's account rows, scoped by org", async () => {
    accountRowsRef.current = [
      { id: "acct-1", accountId: "111111111111", region: "us-east-1" },
      { id: "acct-2", accountId: "222222222222", region: "us-west-2" },
    ];
    mockGetCredentials.mockResolvedValue(CREDENTIALS);
    mockSesSend.mockImplementation(async (command: unknown) => {
      if (commandName(command) === "ListEmailIdentitiesCommand") {
        return { EmailIdentities: [] };
      }
      throw new Error(`unexpected command: ${commandName(command)}`);
    });

    const app = appFor();
    const res = await app.handle(new Request("http://localhost/v1/domains"));
    expect(res.status).toBe(200);

    expect(mockGetCredentials).toHaveBeenCalledTimes(2);
    expect(mockGetCredentials).toHaveBeenNthCalledWith(1, "acct-1", "org-1");
    expect(mockGetCredentials).toHaveBeenNthCalledWith(2, "acct-2", "org-1");
    expect(mockGetCredentials).not.toHaveBeenCalledWith(
      expect.anything(),
      "org-2"
    );
  });

  it("returns 404 (not empty) when awsAccountId filters to nothing, and never calls SES", async () => {
    // Simulates the org predicate + id narrowing returning zero rows — the
    // ownership-validation net for a foreign or nonexistent account id.
    accountRowsRef.current = [];

    const app = appFor();
    const res = await app.handle(
      new Request("http://localhost/v1/domains?awsAccountId=not-mine")
    );
    expect(res.status).toBe(404);
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  it("marks one account unreachable on AccessDenied without failing the whole request", async () => {
    accountRowsRef.current = [
      { id: "acct-1", accountId: "111111111111", region: "us-east-1" },
      { id: "acct-2", accountId: "222222222222", region: "us-west-2" },
    ];
    mockGetCredentials.mockImplementation(async (id: string) => {
      if (id === "acct-1") {
        throw new Error("AccessDenied");
      }
      return CREDENTIALS;
    });
    mockSesSend.mockImplementation(async (command: unknown) => {
      if (commandName(command) === "ListEmailIdentitiesCommand") {
        return {
          EmailIdentities: [
            {
              IdentityName: "example.com",
              IdentityType: "DOMAIN",
              SendingEnabled: true,
              VerificationStatus: "SUCCESS",
            },
          ],
        };
      }
      throw new Error(`unexpected command: ${commandName(command)}`);
    });

    const app = appFor();
    const res = await app.handle(new Request("http://localhost/v1/domains"));
    expect(res.status).toBe(200);

    const body = await res.json();
    const acct1 = body.accounts.find((a: { id: string }) => a.id === "acct-1");
    const acct2 = body.accounts.find((a: { id: string }) => a.id === "acct-2");
    expect(acct1.reachable).toBe(false);
    expect(acct2.reachable).toBe(true);
    expect(
      body.data.some(
        (d: { identity: string; awsAccountId: string }) =>
          d.identity === "example.com" && d.awsAccountId === "acct-2"
      )
    ).toBe(true);
  });

  it("paginates ListEmailIdentities until a trailing empty page, de-duplicating within the account", async () => {
    accountRowsRef.current = [
      { id: "acct-1", accountId: "111111111111", region: "us-east-1" },
    ];
    mockGetCredentials.mockResolvedValue(CREDENTIALS);

    let call = 0;
    mockSesSend.mockImplementation(async (command: unknown) => {
      if (commandName(command) !== "ListEmailIdentitiesCommand") {
        throw new Error(`unexpected command: ${commandName(command)}`);
      }
      call++;
      const input = (command as { input: { NextToken?: string } }).input;
      if (call === 1) {
        expect(input.NextToken).toBeUndefined();
        return {
          EmailIdentities: [{ IdentityName: "a.com" }],
          NextToken: "token-a",
        };
      }
      if (call === 2) {
        expect(input.NextToken).toBe("token-a");
        return {
          EmailIdentities: [{ IdentityName: "b.com" }],
          NextToken: "token-b",
        };
      }
      // Trailing page: SES can still carry a NextToken here (verified live
      // 2026-08-18) — the empty EmailIdentities array is what ends the loop.
      return { EmailIdentities: [], NextToken: "token-c" };
    });

    const app = appFor();
    const res = await app.handle(new Request("http://localhost/v1/domains"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(call).toBe(3);
    expect(
      body.data.map((d: { identity: string }) => d.identity).sort()
    ).toEqual(["a.com", "b.com"]);
  });
});

describe("GET /v1/domains/:identity", () => {
  it("returns 404 when GetEmailIdentity reports NotFoundException on every account", async () => {
    accountRowsRef.current = [
      { id: "acct-1", accountId: "111111111111", region: "us-east-1" },
    ];
    mockGetCredentials.mockResolvedValue(CREDENTIALS);
    mockSesSend.mockImplementation(async (command: unknown) => {
      if (commandName(command) === "GetEmailIdentityCommand") {
        const err = new Error("not found");
        err.name = "NotFoundException";
        throw err;
      }
      throw new Error(`unexpected command: ${commandName(command)}`);
    });

    const app = appFor();
    const res = await app.handle(
      new Request("http://localhost/v1/domains/example.com")
    );
    expect(res.status).toBe(404);
  });

  it("classifies a masked NotFoundException (name Error, code only in message) as 404 — the SDK v3 trap", async () => {
    accountRowsRef.current = [
      { id: "acct-1", accountId: "111111111111", region: "us-east-1" },
    ];
    mockGetCredentials.mockResolvedValue(CREDENTIALS);
    mockSesSend.mockImplementation(async (command: unknown) => {
      if (commandName(command) === "GetEmailIdentityCommand") {
        throw new Error("NotFoundException: identity not found");
      }
      throw new Error(`unexpected command: ${commandName(command)}`);
    });

    const app = appFor();
    const res = await app.handle(
      new Request("http://localhost/v1/domains/example.com")
    );
    expect(res.status).toBe(404);
  });

  it("returns 429 when SES throttles the request", async () => {
    accountRowsRef.current = [
      { id: "acct-1", accountId: "111111111111", region: "us-east-1" },
    ];
    mockGetCredentials.mockResolvedValue(CREDENTIALS);
    mockSesSend.mockImplementation(async (command: unknown) => {
      if (commandName(command) === "GetEmailIdentityCommand") {
        const err = new Error("throttled");
        err.name = "TooManyRequestsException";
        throw err;
      }
      throw new Error(`unexpected command: ${commandName(command)}`);
    });

    const app = appFor();
    const res = await app.handle(
      new Request("http://localhost/v1/domains/example.com")
    );
    expect(res.status).toBe(429);
  });

  it("returns 503 only when every account is unreachable, and 200 with unreachableAccountIds when another account finds it", async () => {
    // Sub-case A: the only connected account is unreachable end-to-end.
    accountRowsRef.current = [
      { id: "acct-1", accountId: "111111111111", region: "us-east-1" },
    ];
    mockGetCredentials.mockRejectedValue(new Error("AccessDenied"));

    const allUnreachableApp = appFor();
    const allUnreachableRes = await allUnreachableApp.handle(
      new Request("http://localhost/v1/domains/example.com")
    );
    expect(allUnreachableRes.status).toBe(503);
    const allUnreachableBody = await allUnreachableRes.json();
    expect(allUnreachableBody.error).toBe("aws_account_unreachable");
    expect(allUnreachableBody.message).toContain("wraps platform update-role");

    // Sub-case B: two accounts, one unreachable, the other has the identity.
    accountRowsRef.current = [
      { id: "acct-1", accountId: "111111111111", region: "us-east-1" },
      { id: "acct-2", accountId: "222222222222", region: "us-west-2" },
    ];
    mockGetCredentials.mockImplementation(async (id: string) => {
      if (id === "acct-1") {
        throw new Error("AccessDenied");
      }
      return CREDENTIALS;
    });
    mockSesSend.mockImplementation(async (command: unknown) => {
      if (commandName(command) === "GetEmailIdentityCommand") {
        return {
          IdentityType: "DOMAIN",
          VerifiedForSendingStatus: true,
          VerificationStatus: "SUCCESS",
          DkimAttributes: {
            Status: "SUCCESS",
            SigningAttributesOrigin: "AWS_SES",
            Tokens: ["tok1"],
          },
          FeedbackForwardingStatus: true,
          ConfigurationSetName: null,
        };
      }
      throw new Error(`unexpected command: ${commandName(command)}`);
    });

    const partialApp = appFor();
    const partialRes = await partialApp.handle(
      new Request("http://localhost/v1/domains/example.com")
    );
    expect(partialRes.status).toBe(200);
    const partialBody = await partialRes.json();
    expect(partialBody.unreachableAccountIds).toEqual(["acct-1"]);
    expect(partialBody.awsAccountId).toBe("acct-2");
  });

  it("validates :identity before any AWS call — rejects an invalid identity, accepts an email address", async () => {
    accountRowsRef.current = [
      { id: "acct-1", accountId: "111111111111", region: "us-east-1" },
    ];

    const invalidApp = appFor();
    const invalidRes = await invalidApp.handle(
      new Request("http://localhost/v1/domains/not%20a%20domain")
    );
    expect(invalidRes.status).toBe(400);
    expect(mockSesSend).not.toHaveBeenCalled();

    mockGetCredentials.mockResolvedValue(CREDENTIALS);
    mockSesSend.mockImplementation(async (command: unknown) => {
      if (commandName(command) === "GetEmailIdentityCommand") {
        expect(
          (command as { input: { EmailIdentity: string } }).input.EmailIdentity
        ).toBe("ops@example.com");
        return {
          IdentityType: "EMAIL_ADDRESS",
          VerifiedForSendingStatus: true,
          VerificationStatus: "SUCCESS",
        };
      }
      throw new Error(`unexpected command: ${commandName(command)}`);
    });

    const validApp = appFor();
    const validRes = await validApp.handle(
      new Request("http://localhost/v1/domains/ops@example.com")
    );
    expect(validRes.status).toBe(200);
  });
});
