import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB module — listSuppressedAddresses resolves accounts with
// findMany (an org can have more than one), not findFirst.
const mockFindMany = vi.fn();
vi.mock("@wraps/db", () => ({
  db: {
    query: {
      awsAccount: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
    },
  },
  awsAccount: { organizationId: "organizationId" },
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
}));

// Mock the credential cache
const mockGetOrAssumeRole = vi.fn();
vi.mock("../credential-cache", () => ({
  getOrAssumeRole: (...args: unknown[]) => mockGetOrAssumeRole(...args),
}));

// Pattern copied from apps/web/src/actions/__tests__/domains.test.ts (added
// 2026-09-10): each command class stamps a `_type` discriminator so the
// mocked `send` can switch on it.
type SesCommand = {
  _type: string;
  input: Record<string, unknown>;
};

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send(command: SesCommand) {
      return mockSend(command);
    }
  },
  ListSuppressedDestinationsCommand: class {
    _type = "ListSuppressedDestinationsCommand";
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  GetSuppressedDestinationCommand: class {
    _type = "GetSuppressedDestinationCommand";
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  DeleteSuppressedDestinationCommand: class {
    _type = "DeleteSuppressedDestinationCommand";
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

// Import after mocks are set up
import {
  deleteSuppressedAddress,
  getSuppressedAddress,
  listSuppressedAddresses,
} from "../ses-suppression";

// getSuppressedAddress/deleteSuppressedAddress accept a full AwsAccountRow
// (the caller — the removeSuppression server action — already has one from
// its own org-scoped lookup); these fixtures only need the fields the
// module actually reads, so the rest are cast away rather than filled in.
type MockAccountRow = Parameters<typeof getSuppressedAddress>[0]["account"];

const MOCK_ACCOUNT_1 = {
  id: "acc-1",
  organizationId: "org-1",
  roleArn: "arn:aws:iam::111111111111:role/wraps",
  externalId: "ext-1",
  region: "us-east-1",
} as unknown as MockAccountRow;

const MOCK_ACCOUNT_2 = {
  id: "acc-2",
  organizationId: "org-1",
  roleArn: "arn:aws:iam::222222222222:role/wraps",
  externalId: "ext-2",
  region: "eu-west-1",
} as unknown as MockAccountRow;

const MOCK_CREDENTIALS = {
  accessKeyId: "AKIA_TEST",
  secretAccessKey: "secret-test",
  sessionToken: "session-test",
};

function summariesOf(count: number, prefix = "addr") {
  return Array.from({ length: count }, (_, i) => ({
    EmailAddress: `${prefix}-${i}@example.com`,
    Reason: "BOUNCE",
    LastUpdateTime: new Date("2026-01-01T00:00:00Z"),
  }));
}

/** Like summariesOf, but names entries `${prefix}-${start}` .. `${prefix}-${end - 1}`. */
function summariesOfRange(start: number, end: number, prefix = "addr") {
  return Array.from({ length: end - start }, (_, i) => ({
    EmailAddress: `${prefix}-${start + i}@example.com`,
    Reason: "BOUNCE",
    LastUpdateTime: new Date("2026-01-01T00:00:00Z"),
  }));
}

function summariesNamed(names: string[]) {
  return names.map((name) => ({
    EmailAddress: `${name}@example.com`,
    Reason: "BOUNCE",
    LastUpdateTime: new Date("2026-01-01T00:00:00Z"),
  }));
}

type SesResponse = {
  SuppressedDestinationSummaries: unknown[];
  NextToken?: string;
};

/** Sentinel key for "no NextToken was sent" in a token-keyed page script. */
const START = "__start__";

/** Round-trips listSuppressedAddresses' own opaque cursor encoding for a
 * test that wants to start mid-sequence (the non-advancing-token guard
 * test). Mirrors encodeCursor in ../ses-suppression.ts exactly — duplicated
 * here rather than imported since that function is intentionally not
 * exported (callers must treat the token as opaque). */
function encodeStartToken(perAccountToken: Record<string, string>): string {
  return Buffer.from(JSON.stringify(perAccountToken), "utf8").toString(
    "base64url"
  );
}

/**
 * Drives listSuppressedAddresses to exhaustion (hasMore: false) and returns
 * the concatenation of every page's entries, in order. Used by the
 * pagination-boundary regression tests: the invariant under test is that
 * this concatenation contains every entry exactly once.
 */
async function drainAllPages(params: {
  organizationId: string;
  limit: number;
}): Promise<string[]> {
  const allEmails: string[] = [];
  let startToken: string | undefined;
  let hasMore = true;
  let guard = 0;
  while (hasMore && guard < 20) {
    const result = await listSuppressedAddresses({ ...params, startToken });
    allEmails.push(...result.entries.map((e) => e.email));
    hasMore = result.hasMore;
    startToken = result.nextToken;
    guard += 1;
  }
  return allEmails;
}

describe("ses-suppression", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetOrAssumeRole.mockResolvedValue(MOCK_CREDENTIALS);
  });

  describe("listSuppressedAddresses — pagination", () => {
    it("requests PageSize = limit (not limit + 1 — a lookahead cannot be combined with an opaque continuation token without dropping an entry)", async () => {
      mockFindMany.mockResolvedValue([MOCK_ACCOUNT_1]);
      mockSend.mockResolvedValueOnce({
        SuppressedDestinationSummaries: summariesOf(1),
      });

      await listSuppressedAddresses({ organizationId: "org-1", limit: 25 });

      const sentCommand = mockSend.mock.calls[0][0] as SesCommand;
      expect(sentCommand._type).toBe("ListSuppressedDestinationsCommand");
      expect(sentCommand.input.PageSize).toBe(25);
    });

    it("returns every entry SES sent, even a full page of exactly `limit` — no lookahead truncation", async () => {
      mockFindMany.mockResolvedValue([MOCK_ACCOUNT_1]);
      mockSend.mockResolvedValueOnce({
        SuppressedDestinationSummaries: summariesOf(5),
        NextToken: "next-page-token",
      });

      const result = await listSuppressedAddresses({
        organizationId: "org-1",
        limit: 5,
      });

      expect(result.entries).toHaveLength(5);
    });

    it("hasMore is true when the response carries an advancing NextToken — even for a full `limit`-sized page, accepting one possible trailing empty page as the cost of never dropping an entry", async () => {
      mockFindMany.mockResolvedValue([MOCK_ACCOUNT_1]);
      mockSend.mockResolvedValueOnce({
        SuppressedDestinationSummaries: summariesOf(5),
        NextToken: "trailing-token-on-last-page",
      });

      const result = await listSuppressedAddresses({
        organizationId: "org-1",
        limit: 5,
      });

      expect(result.hasMore).toBe(true);
      expect(result.nextToken).toBeDefined();
    });

    it("hasMore is false when the response carries no NextToken at all", async () => {
      mockFindMany.mockResolvedValue([MOCK_ACCOUNT_1]);
      mockSend.mockResolvedValueOnce({
        SuppressedDestinationSummaries: summariesOf(2),
      });

      const result = await listSuppressedAddresses({
        organizationId: "org-1",
        limit: 5,
      });

      expect(result.hasMore).toBe(false);
      expect(result.nextToken).toBeUndefined();
    });

    it("hasMore is false when the returned NextToken does not advance past the one sent (the non-advancing-token guard)", async () => {
      mockFindMany.mockResolvedValue([MOCK_ACCOUNT_1]);
      mockSend.mockResolvedValueOnce({
        SuppressedDestinationSummaries: summariesOf(3),
        NextToken: "stuck-token",
      });

      const result = await listSuppressedAddresses({
        organizationId: "org-1",
        limit: 5,
        startToken: encodeStartToken({ [MOCK_ACCOUNT_1.id]: "stuck-token" }),
      });

      expect(result.hasMore).toBe(false);
    });

    it("regression for the limit+1 lookahead: paging a single account to exhaustion returns every entry exactly once, including the entry that used to sit at the page boundary and get dropped", async () => {
      mockFindMany.mockResolvedValue([MOCK_ACCOUNT_1]);

      // 5 entries total, limit 2: two full pages, then a trailing 1-entry
      // page that STILL carries a NextToken (the SES quirk), then a final
      // empty page with no token. Under the old limit+1 lookahead, the item
      // at index `limit` (here, "addr-2" on the first page) was returned by
      // SES but sliced off and never surfaced again once the token advanced
      // past it.
      const pagesByToken: Record<string, SesResponse> = {
        [START]: {
          SuppressedDestinationSummaries: summariesOf(2, "addr"),
          NextToken: "t1",
        },
        t1: {
          SuppressedDestinationSummaries: summariesOfRange(2, 4, "addr"),
          NextToken: "t2",
        },
        t2: {
          SuppressedDestinationSummaries: summariesOfRange(4, 5, "addr"),
          NextToken: "t3", // trailing token on the last non-empty page
        },
        t3: { SuppressedDestinationSummaries: [] },
      };
      mockSend.mockImplementation((command: SesCommand) => {
        const key = (command.input.NextToken as string | undefined) ?? START;
        const page = pagesByToken[key];
        if (!page) {
          return Promise.reject(new Error(`Unscripted token ${key}`));
        }
        return Promise.resolve(page);
      });

      const allEmails = await drainAllPages({
        organizationId: "org-1",
        limit: 2,
      });

      expect(allEmails).toEqual([
        "addr-0@example.com",
        "addr-1@example.com",
        "addr-2@example.com",
        "addr-3@example.com",
        "addr-4@example.com",
      ]);
      expect(new Set(allEmails).size).toBe(allEmails.length);
    });
  });

  describe("listSuppressedAddresses — AccessDenied", () => {
    it("surfaces AccessDeniedException (name shape) as a denied account, not a thrown error", async () => {
      mockFindMany.mockResolvedValue([MOCK_ACCOUNT_1]);
      const err = new Error("denied");
      err.name = "AccessDeniedException";
      mockSend.mockRejectedValueOnce(err);

      const result = await listSuppressedAddresses({ organizationId: "org-1" });

      expect(result.deniedAccountIds).toEqual([MOCK_ACCOUNT_1.id]);
      expect(result.entries).toEqual([]);
    });

    it("surfaces AccessDeniedException carried only in .message (name: 'Error') as a denied account", async () => {
      // AWS SDK v3 sometimes returns name: "Error" with the real exception
      // type only in the message — both must be checked.
      mockFindMany.mockResolvedValue([MOCK_ACCOUNT_1]);
      const err = new Error("AccessDeniedException: not authorized");
      mockSend.mockRejectedValueOnce(err);

      const result = await listSuppressedAddresses({ organizationId: "org-1" });

      expect(result.deniedAccountIds).toEqual([MOCK_ACCOUNT_1.id]);
    });
  });

  describe("listSuppressedAddresses — multi-account", () => {
    it("one account denied does not blank the others: the second account's entries still return, and the first is named in deniedAccountIds", async () => {
      mockFindMany.mockResolvedValue([MOCK_ACCOUNT_1, MOCK_ACCOUNT_2]);

      const err = new Error("denied");
      err.name = "AccessDeniedException";
      mockSend.mockImplementation((command: SesCommand) => {
        if (command._type !== "ListSuppressedDestinationsCommand") {
          return Promise.reject(
            new Error(`Unexpected command ${command._type}`)
          );
        }
        // First call (account 1) is denied; second call (account 2) succeeds.
        if (mockSend.mock.calls.length === 1) {
          return Promise.reject(err);
        }
        return Promise.resolve({
          SuppressedDestinationSummaries: [
            {
              EmailAddress: "surviving@example.com",
              Reason: "BOUNCE",
              LastUpdateTime: new Date("2026-01-01T00:00:00Z"),
            },
          ],
        });
      });

      const result = await listSuppressedAddresses({ organizationId: "org-1" });

      expect(result.deniedAccountIds).toEqual([MOCK_ACCOUNT_1.id]);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].email).toBe("surviving@example.com");
      expect(result.entries[0].awsAccountId).toBe(MOCK_ACCOUNT_2.id);
    });

    it("regression for a dropped EXHAUSTED sentinel: paging two accounts to exhaustion, where the first exhausts before the second, returns no duplicates once the first account stops being queried", async () => {
      mockFindMany.mockResolvedValue([MOCK_ACCOUNT_1, MOCK_ACCOUNT_2]);

      // Account 1: exactly one page (2 entries), then a trailing token (the
      // SES quirk) that resolves to empty — exhausted after its 2nd call.
      // Account 2: needs two pages to exhaust. If the EXHAUSTED sentinel for
      // account 1 is ever dropped from the cursor instead of carried
      // forward, account 1 looks "never queried" on the 3rd round-trip and
      // gets re-read from the start — its first page (a0, a1) would then
      // come back a second time.
      const scriptsByAccount: Record<string, Record<string, SesResponse>> = {
        [MOCK_ACCOUNT_1.id]: {
          [START]: {
            SuppressedDestinationSummaries: summariesNamed(["a0", "a1"]),
            NextToken: "a-t1",
          },
          "a-t1": { SuppressedDestinationSummaries: [] },
        },
        [MOCK_ACCOUNT_2.id]: {
          [START]: {
            SuppressedDestinationSummaries: summariesNamed(["b0", "b1"]),
            NextToken: "b-t1",
          },
          "b-t1": {
            SuppressedDestinationSummaries: summariesNamed(["b2"]),
            NextToken: "b-t2",
          },
          "b-t2": { SuppressedDestinationSummaries: [] },
        },
      };

      let currentAccountId: string | null = null;
      mockGetOrAssumeRole.mockImplementation((params: { roleArn?: string }) => {
        currentAccountId =
          params.roleArn === MOCK_ACCOUNT_1.roleArn
            ? MOCK_ACCOUNT_1.id
            : MOCK_ACCOUNT_2.id;
        return Promise.resolve(MOCK_CREDENTIALS);
      });

      mockSend.mockImplementation((command: SesCommand) => {
        if (!currentAccountId) {
          return Promise.reject(new Error("no current account set"));
        }
        const key = (command.input.NextToken as string | undefined) ?? START;
        const page = scriptsByAccount[currentAccountId]?.[key];
        if (!page) {
          return Promise.reject(
            new Error(`Unscripted call for ${currentAccountId} token ${key}`)
          );
        }
        return Promise.resolve(page);
      });

      const allEmails = await drainAllPages({
        organizationId: "org-1",
        limit: 2,
      });

      const expected = ["a0", "a1", "b0", "b1", "b2"].map(
        (n) => `${n}@example.com`
      );
      expect([...allEmails].sort()).toEqual(expected.sort());
      expect(new Set(allEmails).size).toBe(allEmails.length);
    });
  });

  describe("getSuppressedAddress", () => {
    it("returns not_found on NotFoundException", async () => {
      const err = new Error("NotFoundException");
      err.name = "NotFoundException";
      mockSend.mockRejectedValueOnce(err);

      const result = await getSuppressedAddress({
        account: MOCK_ACCOUNT_1,
        email: "nobody@example.com",
      });

      expect(result.status).toBe("not_found");
    });

    it("returns the address with its reason when found", async () => {
      mockSend.mockResolvedValueOnce({
        SuppressedDestination: {
          EmailAddress: "complainer@example.com",
          Reason: "COMPLAINT",
          LastUpdateTime: new Date("2026-01-01T00:00:00Z"),
        },
      });

      const result = await getSuppressedAddress({
        account: MOCK_ACCOUNT_1,
        email: "complainer@example.com",
      });

      expect(result.status).toBe("found");
      if (result.status === "found") {
        expect(result.address.reason).toBe("COMPLAINT");
      }
    });

    it("returns denied on AccessDeniedException, distinct from not_found", async () => {
      const err = new Error("AccessDeniedException");
      err.name = "AccessDeniedException";
      mockSend.mockRejectedValueOnce(err);

      const result = await getSuppressedAddress({
        account: MOCK_ACCOUNT_1,
        email: "someone@example.com",
      });

      expect(result.status).toBe("denied");
    });
  });

  describe("deleteSuppressedAddress", () => {
    it("returns removed on success", async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await deleteSuppressedAddress({
        account: MOCK_ACCOUNT_1,
        email: "gone@example.com",
      });

      expect(result.status).toBe("removed");
    });

    it("returns not_found rather than throwing on NotFoundException, distinguishing 'removed' from 'was not there'", async () => {
      const err = new Error("NotFoundException");
      err.name = "NotFoundException";
      mockSend.mockRejectedValueOnce(err);

      const result = await deleteSuppressedAddress({
        account: MOCK_ACCOUNT_1,
        email: "never-there@example.com",
      });

      expect(result.status).toBe("not_found");
    });

    it("returns denied on AccessDeniedException", async () => {
      const err = new Error("AccessDeniedException");
      err.name = "AccessDeniedException";
      mockSend.mockRejectedValueOnce(err);

      const result = await deleteSuppressedAddress({
        account: MOCK_ACCOUNT_1,
        email: "denied@example.com",
      });

      expect(result.status).toBe("denied");
    });
  });
});
