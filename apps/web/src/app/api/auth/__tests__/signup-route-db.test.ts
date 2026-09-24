/**
 * Email/password signup through the real `/api/auth/[...all]` route: the
 * Turnstile gate, better-auth, the drizzle adapter and the test database.
 * Together with sign-up-form.test.tsx (the form sends these exact calls, then
 * routes to /onboarding) this is the signup path end to end, minus a browser.
 *
 * better-auth 1.7.1 broke every signup for nine days while every test stayed
 * green, because nothing drove a real signup through the route. Only the
 * Cloudflare siteverify call is stubbed; the gate's logic is real.
 */

import { db, user } from "@wraps/db";
import { eq, like } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const PREFIX = "signup-route-db-test";
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

describe("email/password signup through the auth route", () => {
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

  it("refuses a signup with no Turnstile token", async () => {
    const res = await post(route, "/sign-up/email", {
      email,
      password,
      name: "No Token",
    });
    expect(res.status).toBe(400);
  });

  it("refuses a signup whose Turnstile token fails verification", async () => {
    const res = await post(
      route,
      "/sign-up/email",
      { email, password, name: "Bad Token" },
      "turnstile-fail"
    );
    expect(res.status).toBe(403);
  });

  it("creates the user and their credential account", async () => {
    const res = await post(
      route,
      "/sign-up/email",
      { email, password, name: "Route Signup" },
      PASSING_TOKEN
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.user.email).toBe(email);

    const [row] = await db.select().from(user).where(eq(user.email, email));
    expect(row?.name).toBe("Route Signup");
  });

  it("signs the new user in and returns a working session", async () => {
    const res = await post(route, "/sign-in/email", { email, password });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("session_token");

    const session = await route.GET(
      new NextRequest(`${BASE}/get-session`, {
        headers: { cookie: cookie ?? "" },
      })
    );
    const body = await session.json();
    expect(body?.user?.email).toBe(email);
  });
});
