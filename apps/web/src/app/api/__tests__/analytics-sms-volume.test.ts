import { beforeEach, describe, expect, it, vi } from "vitest";

const { cacheStore } = vi.hoisted(() => ({
  cacheStore: new Map<string, unknown>(),
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

// Memoizing `unstable_cache` keyed by the cache key, so the second request for
// the same org and window is served from the cache instead of re-running the
// per-account DynamoDB fan-out. That is the behaviour under test.
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keys: unknown[],
    _options: unknown
  ) => {
    const key = JSON.stringify(keys);
    return async () => {
      if (cacheStore.has(key)) {
        return cacheStore.get(key);
      }
      const value = await fn();
      cacheStore.set(key, value);
      return value;
    };
  },
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: "user-1", email: "test@example.com", name: "Test" },
        session: {
          id: "session-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: "user-1",
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "test-token",
        },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async () => ({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
  })),
}));

const mockQuerySMSEvents = vi.fn();
vi.mock("@/lib/aws/sms-voice", () => ({
  querySMSEvents: (...args: unknown[]) => mockQuerySMSEvents(...args),
}));

vi.mock("@wraps/db", () => ({
  db: {
    query: {
      awsAccount: {
        findMany: vi.fn(async () => [
          { id: "acc-1", organizationId: "org-1" },
          { id: "acc-2", organizationId: "org-1" },
        ]),
      },
    },
  },
}));

vi.mock("@wraps/db/schema/app", () => ({
  awsAccount: { organizationId: "organizationId" },
}));

vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  serializeError: (e: unknown) => e,
}));

const TODAY = new Date();
const DAY_KEY = TODAY.toISOString().slice(0, 10);

function callVolume(days = 30) {
  return import("../[orgSlug]/analytics/sms/volume/route").then(({ GET }) =>
    GET(
      new Request(
        `http://localhost/api/test-org/analytics/sms/volume?days=${days}`
      ),
      { params: Promise.resolve({ orgSlug: "test-org" }) } as never
    )
  );
}

describe("SMS volume route caching", () => {
  beforeEach(() => {
    cacheStore.clear();
    vi.clearAllMocks();
    // Two events per account: one delivered, one failed.
    mockQuerySMSEvents.mockResolvedValue([
      { sentAt: TODAY.toISOString(), eventStatus: "DELIVERED" },
      { sentAt: TODAY.toISOString(), eventStatus: "FAILED" },
    ]);
  });

  it("runs the per-account fan-out once across repeated requests for the same window", async () => {
    const first = await callVolume();
    const second = await callVolume();

    // Two connected AWS accounts, so the first request issues two cross-account
    // queries. The second request must issue none: it is served from the cache.
    expect(mockQuerySMSEvents).toHaveBeenCalledTimes(2);

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody).toEqual(firstBody);

    const day = firstBody.find((d: { date: string }) => d.date === DAY_KEY);
    expect(day).toMatchObject({ sent: 4, delivered: 2, failed: 2 });
  });

  it("reports unauthorized without touching AWS", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

    const response = await callVolume();

    expect(response.status).toBe(401);
    expect(mockQuerySMSEvents).not.toHaveBeenCalled();
  });
});
