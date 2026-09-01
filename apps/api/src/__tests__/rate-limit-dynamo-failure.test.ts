/**
 * Rate Limit Middleware — DynamoDB failure path
 *
 * The limiter's counters live in DynamoDB, so an outage there is an outage of
 * the limiter, not of the API. The middleware fails OPEN: it logs and lets the
 * request through rather than 429-ing or 500-ing every caller.
 *
 * This branch had no coverage (`rate-limit.ts` sat at 71% functions, with the
 * catch block among the untested lines) despite being the one path here that
 * genuinely fires in production — a throttled table, a transient network
 * error, expired credentials. A limiter that fails CLOSED would turn a
 * DynamoDB blip into a full API outage, so the direction of that failure is
 * worth pinning.
 *
 * The catch also has to stay narrow: a real 429 is raised by throwing, so it
 * must be re-thrown rather than swallowed as if it were an infrastructure
 * error. Both halves are asserted here.
 *
 * DynamoDB is mocked with a stub class, same pattern as
 * rate-limit-unlimited.test.ts — nothing reaches AWS.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDynamoSend } = vi.hoisted(() => ({
  mockDynamoSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = mockDynamoSend;
  },
  UpdateItemCommand: class {
    constructor(public input: unknown) {}
  },
}));

const mockLogError = vi.fn();
vi.mock("../lib/logger", () => ({
  log: {
    error: (...args: unknown[]) => mockLogError(...args),
    warn: vi.fn(),
    info: vi.fn(),
  },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

import { rateLimitMiddleware } from "../middleware/rate-limit";

/** Mirrors how createAuthenticatedRoutes supplies `auth` to downstream plugins. */
function withAuth(planId: string | null) {
  return new Elysia().derive(() => ({
    auth: {
      organizationId: "org-dynamo-fail",
      apiKeyId: "key-1",
      userId: null,
      planId,
    },
  }));
}

function appFor(planId: string | null) {
  return withAuth(planId)
    .use(rateLimitMiddleware)
    .get("/v1/batch", () => ({ ok: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // WRAPS_LICENSE_KEY in the shell env makes isSelfHosted() return true, which
  // skips rate limiting entirely and would make every case below vacuously pass.
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
});

describe("rate limiter — DynamoDB failure", () => {
  it("fails open and serves the request when the counter write throws", async () => {
    mockDynamoSend.mockRejectedValue(
      new Error("ProvisionedThroughputExceeded")
    );

    const res = await appFor("pro").handle(
      new Request("http://localhost/v1/batch")
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("logs the failure so an outage is visible to ops, not silent", async () => {
    mockDynamoSend.mockRejectedValue(
      new Error("ProvisionedThroughputExceeded")
    );

    await appFor("pro").handle(new Request("http://localhost/v1/batch"));

    expect(mockLogError).toHaveBeenCalledWith(
      "Rate limiter failing open",
      expect.any(Error),
      expect.objectContaining({ organizationId: "org-dynamo-fail" })
    );
  });

  it("fails open for an unrecognised plan too, without falling into the 429 path", async () => {
    // The plan narrowing resolves an unknown id to the Free limits; a
    // DynamoDB error on top of that must still serve, not throttle.
    mockDynamoSend.mockRejectedValue(new Error("network unreachable"));

    const res = await appFor("constructor").handle(
      new Request("http://localhost/v1/batch")
    );

    expect(res.status).toBe(200);
  });

  it("still re-throws a real 429 rather than swallowing it as an outage", async () => {
    // The catch must stay narrow. A genuine over-limit is signalled by
    // throwing, so a catch-all would convert every 429 into a 200 — the exact
    // inverse of the bug the fail-open behaviour exists to prevent.
    let count = 0;
    mockDynamoSend.mockImplementation(() => {
      count += 1;
      return Promise.resolve({ Attributes: { count: { N: String(count) } } });
    });

    const app = appFor("free"); // 50/minute
    let res: Response | undefined;
    for (let i = 0; i < 51; i++) {
      res = await app.handle(new Request("http://localhost/v1/batch"));
    }

    expect(res?.status).toBe(429);
    expect(mockLogError).not.toHaveBeenCalledWith(
      "Rate limiter failing open",
      expect.anything(),
      expect.anything()
    );
  });
});
