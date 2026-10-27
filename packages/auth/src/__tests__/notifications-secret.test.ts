/**
 * The notifications-only instance must construct in production (API Lambdas
 * run with NODE_ENV=production) with no BETTER_AUTH_SECRET. It never signs or
 * verifies anything, so the placeholder secret is safe; see notifications.ts.
 *
 * `@wraps/db` is mocked so the real database is never loaded. `drizzleAdapter`
 * is handed the mock, which is fine: construction does not query.
 *
 * Better-auth reads NODE_ENV once, when @better-auth/core loads, and skips its
 * secret check whenever NODE_ENV=test at call time. So a same-process
 * construction does not exercise the check. The child-process test below
 * does, under NODE_ENV=production.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@wraps/db", () => ({ db: {} }));
vi.mock("@wraps/email", () => ({ getWrapsClient: vi.fn() }));

import {
  createNotificationsAuth,
  NOTIFICATIONS_ONLY_PLACEHOLDER_SECRET,
} from "../notifications";

const BETTER_AUTH_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";
const PACKAGE_DIR = path.resolve(import.meta.dirname, "../..");

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_SECRET", "");
  vi.stubEnv("BETTER_AUTH_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("notifications-only instance secret", () => {
  it("constructs in production with no BETTER_AUTH_SECRET", () => {
    expect(() => createNotificationsAuth()).not.toThrow();
  });

  it("placeholder is long enough and is not better-auth's default", () => {
    expect(NOTIFICATIONS_ONLY_PLACEHOLDER_SECRET.length).toBeGreaterThanOrEqual(
      32
    );
    expect(NOTIFICATIONS_ONLY_PLACEHOLDER_SECRET).not.toBe(
      BETTER_AUTH_DEFAULT_SECRET
    );
  });

  it("uses BETTER_AUTH_SECRET when it is set", async () => {
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "a-real-provisioned-secret-0123456789abcd"
    );
    const auth = createNotificationsAuth() as unknown as {
      $context: Promise<{ secret: string }>;
    };
    expect((await auth.$context).secret).toBe(
      "a-real-provisioned-secret-0123456789abcd"
    );
  });

  it("falls back to the placeholder when BETTER_AUTH_SECRET is unset", async () => {
    const auth = createNotificationsAuth() as unknown as {
      $context: Promise<{ secret: string }>;
    };
    expect((await auth.$context).secret).toBe(
      NOTIFICATIONS_ONLY_PLACEHOLDER_SECRET
    );
  });

  it("passes better-auth's production secret check, and the default secret does not", () => {
    // Fresh process with NODE_ENV=production, so @better-auth/core reads it at load.
    // The secret check runs inside the $context promise, so each attempt awaits it.
    const script = `
      import { betterAuth } from "better-auth";
      import { memoryAdapter } from "better-auth/adapters/memory";
      const attempt = async (secret) => {
        try {
          const auth = betterAuth({ secret, database: memoryAdapter({}) });
          await auth.$context;
          return "ok";
        } catch (error) {
          return error.message;
        }
      };
      console.log(JSON.stringify({
        placeholder: await attempt(process.env.PLACEHOLDER),
        betterAuthDefault: await attempt(undefined),
      }));
    `;
    const stdout = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        cwd: PACKAGE_DIR,
        // minimal env: no inherited TEST or VITEST flags that would skip the check
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          NODE_ENV: "production",
          PLACEHOLDER: NOTIFICATIONS_ONLY_PLACEHOLDER_SECRET,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    const result = JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}");

    expect(result.placeholder).toBe("ok");
    expect(result.betterAuthDefault).toContain("default secret");
  }, 60_000);
});
