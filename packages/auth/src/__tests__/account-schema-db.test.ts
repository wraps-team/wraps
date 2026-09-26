/**
 * Account writes and lookups through the real drizzle adapter and schema.
 *
 * better-auth 1.7.0–1.7.2 made `account.issuer` a required field and queried
 * OAuth accounts by (issuer, accountId). Our Drizzle `account` table never had
 * that column, so every account insert threw "The field issuer does not exist"
 * and every OAuth callback redirected to `/auth?error=internal_server_error`.
 * Signups on app.wraps.dev stopped on 2026-09-14 and self-hosted operators
 * could not log in after upgrading. Config-shape tests all stayed green; only
 * a round trip through the adapter catches this.
 */

import { db, user } from "@wraps/db";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@wraps/email", () => ({
  getWrapsClient: vi.fn(),
}));

const { PostHogCtor } = vi.hoisted(() => ({ PostHogCtor: vi.fn() }));
vi.mock("posthog-node", () => ({ PostHog: PostHogCtor }));

const PREFIX = "account-schema-test";
const email = `${PREFIX}-${Date.now()}@example.com`;
const password = "a-long-unbreached-test-passphrase-9f2c";

describe("account table vs better-auth", () => {
  let auth: typeof import("../index").auth;

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
    ({ auth } = await import("../index"));
    await db.delete(user).where(like(user.email, `${PREFIX}-%`));
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await db.delete(user).where(like(user.email, `${PREFIX}-%`));
  });

  it("signs up and back in with email and password", async () => {
    const signUp = await auth.api.signUpEmail({
      body: { email, password, name: "Account Schema Test" },
    });
    expect(signUp.user.email).toBe(email);

    const signIn = await auth.api.signInEmail({ body: { email, password } });
    expect(signIn.user.id).toBe(signUp.user.id);
  });

  it("does not send the signup to PostHog outside production", () => {
    expect(PostHogCtor).not.toHaveBeenCalled();
  });

  it("links and finds an OAuth account the way the callback does", async () => {
    const [row] = await db.select().from(user).where(eq(user.email, email));
    if (!row) {
      throw new Error("signup test did not leave a user row");
    }
    const ctx = await auth.$context;

    await ctx.internalAdapter.linkAccount({
      userId: row.id,
      providerId: "github",
      accountId: `${PREFIX}-gh-1`,
    });

    const owner = await ctx.internalAdapter.findAccountOwnerByKey({
      providerId: "github",
      accountId: `${PREFIX}-gh-1`,
    });
    expect(owner?.kind).toBe("owned");
    expect(owner?.account.userId).toBe(row.id);
  });
});
