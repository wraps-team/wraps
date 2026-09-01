/**
 * Rate Limit Middleware — Unlimited Daily Cap (plans/227)
 *
 * plans/227 retires the daily request counter: Wraps does not pay for sends,
 * so metering them by request count was the wrong instrument. These tests
 * prove the daily path is genuinely skipped (not incremented-then-ignored)
 * and that the minute limiter — the real burst backstop — is untouched.
 *
 * DynamoDB is mocked with a stub class, same pattern as
 * middleware-scope.test.ts, so nothing here reaches AWS.
 */

import { Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { rateLimitMiddleware } from "../middleware/rate-limit";

/** Mirrors how createAuthenticatedRoutes supplies `auth` to downstream plugins. */
function withAuth(planId: string | null) {
  return new Elysia().derive(() => ({
    auth: {
      organizationId: "org-1",
      apiKeyId: "key-1",
      userId: null,
      planId,
    },
  }));
}

function skOf(command: unknown): string | undefined {
  const c = command as { input?: { Key?: { sk?: { S?: string } } } };
  return c?.input?.Key?.sk?.S;
}

/** A DynamoDB stub that tracks a per-window-type counter from the sk prefix. */
function makeCountingStub() {
  const counts: Record<string, number> = {};
  return (command: unknown) => {
    const sk = skOf(command) ?? "";
    const prefix = sk.startsWith("minute:")
      ? "minute"
      : sk.startsWith("daily:")
        ? "daily"
        : "other";
    counts[prefix] = (counts[prefix] ?? 0) + 1;
    return Promise.resolve({
      Attributes: { count: { N: String(counts[prefix]) } },
    });
  };
}

beforeEach(() => {
  mockDynamoSend.mockReset();
  // isSelfHosted() reads WRAPS_LICENSE_KEY at call time; the shared
  // .env.test carries one, which would short-circuit the limiter entirely
  // and make every assertion here pass for the wrong reason.
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("rate-limit: the daily cap is retired for every plan (plans/227)", () => {
  it("does not 429 a free org sending far more than 1,000 requests in a day", async () => {
    let minuteCount = 0;
    mockDynamoSend.mockImplementation((command: unknown) => {
      const sk = skOf(command) ?? "";
      if (sk.startsWith("minute:")) {
        minuteCount += 1;
        // Simulate the clock moving to a new minute window every 50 requests,
        // so the free plan's minute limit never trips and only the daily
        // path (or lack of it) is under test.
        if (minuteCount > 50) {
          minuteCount = 1;
        }
        return Promise.resolve({
          Attributes: { count: { N: String(minuteCount) } },
        });
      }
      // A daily: key should never be requested for an unlimited plan.
      return Promise.resolve({ Attributes: { count: { N: "1" } } });
    });

    const app = withAuth("free")
      .use(rateLimitMiddleware)
      .get("/v1/batch", () => ({ ok: true }));

    for (let i = 0; i < 1200; i++) {
      const res = await app.handle(new Request("http://localhost/v1/batch"));
      expect(res.status).not.toBe(429);
    }
  });

  it("still 429s the minute limit — the 51st request within one minute on free", async () => {
    let minuteCount = 0;
    mockDynamoSend.mockImplementation((command: unknown) => {
      const sk = skOf(command) ?? "";
      if (sk.startsWith("minute:")) {
        minuteCount += 1;
        return Promise.resolve({
          Attributes: { count: { N: String(minuteCount) } },
        });
      }
      return Promise.resolve({ Attributes: { count: { N: "1" } } });
    });

    const app = withAuth("free")
      .use(rateLimitMiddleware)
      .get("/v1/batch", () => ({ ok: true }));

    let res: Response | undefined;
    for (let i = 0; i < 51; i++) {
      res = await app.handle(new Request("http://localhost/v1/batch"));
    }

    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBeTruthy();
  });

  it("never writes the daily DynamoDB counter — the point of this plan", async () => {
    mockDynamoSend.mockImplementation(makeCountingStub());

    const app = withAuth("free")
      .use(rateLimitMiddleware)
      .get("/v1/batch", () => ({ ok: true }));

    for (let i = 0; i < 10; i++) {
      await app.handle(new Request("http://localhost/v1/batch"));
    }

    const dailyCalls = mockDynamoSend.mock.calls.filter((call) => {
      const sk = skOf(call[0]);
      return typeof sk === "string" && sk.startsWith("daily:");
    });
    expect(dailyCalls).toHaveLength(0);
  });

  it("advertises only the minute policy on a successful response", async () => {
    mockDynamoSend.mockResolvedValue({ Attributes: { count: { N: "1" } } });

    const app = withAuth("free")
      .use(rateLimitMiddleware)
      .get("/v1/batch", () => ({ ok: true }));

    const res = await app.handle(new Request("http://localhost/v1/batch"));

    const policy = res.headers.get("RateLimit-Policy");
    expect(policy).toContain(";w=60");
    expect(policy).not.toContain("w=86400");
    expect(res.headers.get("RateLimit-Limit")).not.toBe("-1");
    expect(res.headers.get("X-RateLimit-Limit")).not.toBe("-1");
  });

  it("does not advertise a -1 daily policy on the minute-429 path", async () => {
    let minuteCount = 0;
    mockDynamoSend.mockImplementation((command: unknown) => {
      const sk = skOf(command) ?? "";
      if (sk.startsWith("minute:")) {
        minuteCount += 1;
        return Promise.resolve({
          Attributes: { count: { N: String(minuteCount) } },
        });
      }
      return Promise.resolve({ Attributes: { count: { N: "1" } } });
    });

    const app = withAuth("free")
      .use(rateLimitMiddleware)
      .get("/v1/batch", () => ({ ok: true }));

    let res: Response | undefined;
    for (let i = 0; i < 51; i++) {
      res = await app.handle(new Request("http://localhost/v1/batch"));
    }

    expect(res?.status).toBe(429);
    const policy = res?.headers.get("RateLimit-Policy");
    expect(policy).not.toContain("-1");
    expect(policy).not.toContain("w=86400");
    expect(res?.headers.get("RateLimit-Limit")).not.toBe("-1");
    expect(res?.headers.get("X-RateLimit-Limit")).not.toBe("-1");
  });
});
