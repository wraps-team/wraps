/**
 * The server-side safety net added in plan 365: `reportAuthResponse` wraps
 * every exported auth handler and reports any 5xx or `?error=` redirect to
 * Sentry from the response alone, whatever better-auth did or didn't log.
 * This drives the real route (same pattern as signup-route-db.test.ts) to
 * prove the wrapper is transparent on a normal success, and that it reports
 * on an error redirect.
 */

import { db, user } from "@wraps/db";
import { like } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const captureMessage = vi.fn();
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage, captureException }));

const PREFIX = "auth-route-reporting-db-test";
const BASE = "http://localhost:3000/api/auth";
const email = `${PREFIX}-${Date.now()}@example.com`;
const password = "a-long-unbreached-test-passphrase-4b8a";
const PASSING_TOKEN = "turnstile-pass";

type Route = typeof import("../[...all]/route");

function post(route: Route, path: string, body: unknown, token?: string) {
  return route.POST(
    new NextRequest(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        ...(token ? { "x-turnstile-token": token } : {}),
      },
      body: JSON.stringify(body),
    })
  );
}

describe("reportAuthResponse on the real auth route", () => {
  let route: Route;

  beforeAll(async () => {
    // Read once at module load by the route.
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-test-secret");
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.startsWith("https://challenges.cloudflare.com/")) {
          const { response } = JSON.parse(String(init?.body));
          return Response.json({ success: response === PASSING_TOKEN });
        }
        return realFetch(input, init);
      }
    );
    route = await import("../[...all]/route");
    await db.delete(user).where(like(user.email, `${PREFIX}-%`));
  }, 60_000);

  afterAll(async () => {
    await db.delete(user).where(like(user.email, `${PREFIX}-%`));
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    captureMessage.mockClear();
    captureException.mockClear();
  });

  it("is transparent on a normal successful signup: same response, no report", async () => {
    const res = await post(
      route,
      "/sign-up/email",
      { email, password, name: "Route Reporting" },
      PASSING_TOKEN
    );
    const body = await res.json();

    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.user.email).toBe(email);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("reports a redirect that carries an error= code", async () => {
    const res = await route.GET(
      new NextRequest(
        `${BASE}/callback/google?error=server_error&state=nonexistent-state`
      )
    );

    // A redirect either way — assert on whatever code better-auth actually
    // put in the location header (its own state check may intercept first).
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    const code = new URL(location as string, BASE).searchParams.get("error");
    expect(code).toBeTruthy();

    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining(`error=${code}`),
      expect.objectContaining({
        tags: expect.objectContaining({ feature: "better-auth" }),
      })
    );
  });
});
