/**
 * The Cloudflare credential gate.
 *
 * The bug these pin: validation asked `/user/tokens/verify`, which requires the
 * token to carry `User → API Tokens → Read`. A zone-scoped token holding only
 * `Zone → DNS → Edit` — the correct least-privilege token for everything this
 * CLI does — is refused there with `1000 Invalid API Token` while being able to
 * create every record we ask of it. Gating on that endpoint alone rejected
 * working tokens, and the degradation was near-silent: callers printed the
 * record for manual entry, and the ACM validation push dropped its record with
 * no message, leaving HTTPS pending forever with no visible cause.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDNSCredentials } from "../credentials.js";

const VERIFY = "https://api.cloudflare.com/client/v4/user/tokens/verify";
const ZONES = "https://api.cloudflare.com/client/v4/zones";

const json = (body: unknown) =>
  ({ json: () => Promise.resolve(body) }) as Response;

/** `/user/tokens/verify` refuses a DNS-only token exactly this way. */
const INVALID_TOKEN = {
  success: false,
  errors: [{ code: 1000, message: "Invalid API Token" }],
};

function mockCloudflare(handlers: {
  verify: unknown;
  zones: unknown;
}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith(VERIFY)) {
      return Promise.resolve(json(handlers.verify));
    }
    if (url.startsWith(ZONES)) {
      return Promise.resolve(json(handlers.zones));
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

describe("getDNSCredentials — cloudflare", () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_API_TOKEN = "zone-scoped-dns-edit-token";
    delete process.env.CLOUDFLARE_ZONE_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CLOUDFLARE_API_TOKEN;
  });

  it("accepts a zone-scoped DNS token that /user/tokens/verify refuses", async () => {
    // The exact shape that broke: verify says no, zones says yes.
    mockCloudflare({
      verify: INVALID_TOKEN,
      zones: { success: true, result: [{ id: "zone-abc", name: "wraps.dev" }] },
    });

    const result = await getDNSCredentials(
      "cloudflare",
      "wraps.dev",
      "us-east-1"
    );

    expect(result.valid).toBe(true);
    expect(result.credentials).toMatchObject({
      provider: "cloudflare",
      zoneId: "zone-abc",
    });
  });

  it("accepts a token that /user/tokens/verify approves", async () => {
    const fetchMock = mockCloudflare({
      verify: { success: true, result: { status: "active" } },
      zones: { success: true, result: [{ id: "zone-abc", name: "wraps.dev" }] },
    });

    const result = await getDNSCredentials(
      "cloudflare",
      "wraps.dev",
      "us-east-1"
    );

    expect(result.valid).toBe(true);
    // The zone-list fallback is a fallback: it must not fire when verify passes.
    const zoneListProbes = fetchMock.mock.calls.filter(([u]: [string]) =>
      (u as string).includes("per_page=1")
    );
    expect(zoneListProbes).toHaveLength(0);
  });

  it("still rejects a token that can do neither", async () => {
    // The fallback must widen what counts as valid, not remove the gate.
    mockCloudflare({ verify: INVALID_TOKEN, zones: INVALID_TOKEN });

    const result = await getDNSCredentials(
      "cloudflare",
      "wraps.dev",
      "us-east-1"
    );

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/authentication failed/i);
  });

  it("reports a usable token that has no zone for the domain", async () => {
    // Distinct from an auth failure, and the message has to say so — this is
    // the case where CLOUDFLARE_ZONE_ID is the fix.
    mockCloudflare({
      verify: { success: true },
      zones: { success: true, result: [] },
    });

    const result = await getDNSCredentials(
      "cloudflare",
      "notmine.com",
      "us-east-1"
    );

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Could not find Cloudflare zone/);
    expect(result.error).toMatch(/CLOUDFLARE_ZONE_ID/);
  });
});
