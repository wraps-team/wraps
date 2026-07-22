import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDynamoSend, mockIsSelfHosted } = vi.hoisted(() => ({
  mockDynamoSend: vi.fn(),
  mockIsSelfHosted: vi.fn(),
}));

// The shared .env.test carries a WRAPS_LICENSE_KEY, so isSelfHosted() is true
// by default under `pnpm test` and every plan/rate gate short-circuits. Pin it
// so these tests exercise the gate itself rather than the ambient env.
vi.mock("../(ee)/lib/license", () => ({ isSelfHosted: mockIsSelfHosted }));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = mockDynamoSend;
  },
  UpdateItemCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { planGateMiddleware } from "../middleware/plan-gate";
import { publicRateLimitMiddleware } from "../middleware/public-rate-limit";
import { rateLimitMiddleware } from "../middleware/rate-limit";

/**
 * Elysia scoping regression guard.
 *
 * A plugin's `derive` defaults to `local` scope: it applies only to routes
 * defined on the plugin instance itself, NOT to routes on the instance that
 * `.use()`s it. Every one of these middlewares is consumed the second way
 * (batch.ts:133-134, tools.ts:275, workflows.ts:45), so without an explicit
 * `{ as: "scoped" }` they are silently no-ops — the guard never runs and the
 * request sails through. Nothing else in the suite covers this: the tools
 * route test mocks the rate limiter out entirely.
 */

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

beforeEach(() => {
  mockDynamoSend.mockReset();
  mockDynamoSend.mockResolvedValue({ Attributes: { count: { N: "1" } } });
  mockIsSelfHosted.mockReset();
  mockIsSelfHosted.mockReturnValue(false);
});

describe("planGateMiddleware applies to the consumer's routes", () => {
  it("blocks a free-plan org from a starter-gated feature", async () => {
    const app = withAuth("free")
      .use(planGateMiddleware("batch"))
      .get("/v1/batch", () => ({ ok: true }));

    const res = await app.handle(new Request("http://localhost/v1/batch"));

    expect(res.status).toBe(403);
  });

  it("skips the gate entirely for licensed self-hosted deployments", async () => {
    mockIsSelfHosted.mockReturnValue(true);
    const app = withAuth("free")
      .use(planGateMiddleware("batch"))
      .get("/v1/batch", () => ({ ok: true }));

    const res = await app.handle(new Request("http://localhost/v1/batch"));

    expect(res.status).toBe(200);
  });

  it("lets a paid org through", async () => {
    const app = withAuth("scale")
      .use(planGateMiddleware("batch"))
      .get("/v1/batch", () => ({ ok: true }));

    const res = await app.handle(new Request("http://localhost/v1/batch"));

    expect(res.status).toBe(200);
  });
});

describe("rateLimitMiddleware applies to the consumer's routes", () => {
  it("counts a request against the org's quota", async () => {
    const app = withAuth("scale")
      .use(rateLimitMiddleware)
      .get("/v1/batch", () => ({ ok: true }));

    await app.handle(new Request("http://localhost/v1/batch"));

    expect(mockDynamoSend).toHaveBeenCalled();
  });
});

describe("publicRateLimitMiddleware applies to the consumer's routes", () => {
  it("counts an unauthenticated request against the IP quota", async () => {
    const app = new Elysia()
      .use(publicRateLimitMiddleware)
      .get("/tools/email-check", () => ({ ok: true }));

    await app.handle(
      new Request("http://localhost/tools/email-check", {
        headers: { "x-source-ip": "1.2.3.4" },
      })
    );

    expect(mockDynamoSend).toHaveBeenCalled();
  });

  it("does not leak onto sibling route groups that never opted in", async () => {
    const guarded = new Elysia({ prefix: "/tools" })
      .use(publicRateLimitMiddleware)
      .get("/email-check", () => ({ ok: true }));
    const open = new Elysia({ prefix: "/health" }).get("/", () => ({
      ok: true,
    }));
    const root = new Elysia().use(guarded).use(open);

    await root.handle(new Request("http://localhost/health/"));

    expect(mockDynamoSend).not.toHaveBeenCalled();
  });
});
