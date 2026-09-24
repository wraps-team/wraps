/**
 * The route drives the exact adapter lookup a sign-in runs — user by email,
 * joined to accounts — against the real test DB. It fails the moment the
 * adapter and the database disagree, which is how the 2026-09 signup outage
 * presented while a homepage-only uptime monitor stayed green throughout.
 *
 * The probe is read-only: it looks up an address that can never exist and
 * must never create a row or a session.
 */

import { db, user } from "@wraps/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROBE_EMAIL = "health-probe@wraps.invalid";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException }));

type Route = typeof import("../auth/route");

describe("GET /api/health/auth", () => {
  beforeEach(() => {
    captureException.mockClear();
    vi.resetModules();
    vi.doUnmock("@wraps/auth");
  });

  it("returns 200 and { ok: true } against the real adapter, with no report and no rows written", async () => {
    const route: Route = await import("../auth/route");
    const res = await route.GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(captureException).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("no-store");

    // The probe must not create the user it looks up — a session can only
    // belong to a user, so a missing user rules out a written session too.
    const probeUsers = await db
      .select()
      .from(user)
      .where(eq(user.email, PROBE_EMAIL));
    expect(probeUsers.length).toBe(0);
  });

  it("returns 503 and { ok: false } with no leaked error text when the adapter fails", async () => {
    vi.doMock("@wraps/auth", () => ({
      auth: {
        get $context() {
          return Promise.reject(
            new Error('column "issuer" does not exist in relation account')
          );
        },
      },
    }));

    const route: Route = await import("../auth/route");
    const res = await route.GET();
    const body = await res.json();
    const rawBody = JSON.stringify(body);

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(rawBody).not.toContain("issuer");
    expect(rawBody).not.toContain("does not exist");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sets cache-control: no-store on both the healthy and unhealthy response", async () => {
    const healthyRoute: Route = await import("../auth/route");
    const healthyRes = await healthyRoute.GET();
    expect(healthyRes.headers.get("cache-control")).toBe("no-store");

    vi.resetModules();
    vi.doMock("@wraps/auth", () => ({
      auth: {
        get $context() {
          return Promise.reject(new Error("adapter unavailable"));
        },
      },
    }));

    const unhealthyRoute: Route = await import("../auth/route");
    const unhealthyRes = await unhealthyRoute.GET();
    expect(unhealthyRes.headers.get("cache-control")).toBe("no-store");
  });
});
