import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The production runtime pool. `connection-url.test.ts` covers the normalizer as
 * a pure function; this asserts that `index.ts` actually feeds its output to
 * `pg.Pool`. Without it, dropping `.url` from the call site reintroduces
 * `ENOENT open 'system'` on every self-hosted Lambda cold start and no test
 * fails.
 *
 * vitest.config.ts dotenv-loads apps/web/.env.local, so DATABASE_URL is stubbed
 * explicitly in each case rather than inherited.
 */
const mockPoolCtor = vi.hoisted(() => vi.fn());

vi.mock("pg", () => ({
  Pool: class {
    on = vi.fn();
    constructor(config: unknown) {
      mockPoolCtor(config);
    }
  },
}));

async function connectionStringForDatabaseUrl(
  databaseUrl: string
): Promise<string> {
  vi.stubEnv("DATABASE_URL", databaseUrl);
  vi.resetModules();
  await import("../index");

  expect(mockPoolCtor).toHaveBeenCalled();
  const config = mockPoolCtor.mock.calls[0]?.[0] as {
    connectionString: string;
  };
  return config.connectionString;
}

beforeEach(() => {
  mockPoolCtor.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runtime pool connection string", () => {
  it("strips sslrootcert=system, which pg would read as a filename", async () => {
    const connectionString = await connectionStringForDatabaseUrl(
      "postgresql://u:pw@xyz.horizon.psdb.cloud:5432/db?sslmode=verify-full&sslrootcert=system"
    );

    expect(connectionString).not.toContain("sslrootcert");
    expect(connectionString).toContain("sslmode=verify-full");
  });

  it("keeps TLS verification when sslrootcert was the only TLS parameter", async () => {
    const connectionString = await connectionStringForDatabaseUrl(
      "postgres://u:pw@h/db?sslrootcert=system"
    );

    expect(connectionString).not.toContain("sslrootcert");
    expect(connectionString).toContain("sslmode=verify-full");
  });

  it("passes an ordinary Neon URL through untouched", async () => {
    const neon =
      "postgresql://u:pw@ep-x.us-east-1.aws.neon.tech/neondb?sslmode=require";

    expect(await connectionStringForDatabaseUrl(neon)).toBe(neon);
  });

  it("tolerates an unset DATABASE_URL without throwing at import time", async () => {
    // A throw here would crash every Lambda on cold start.
    expect(await connectionStringForDatabaseUrl("")).toBe("");
  });
});

/**
 * Every warm container holds its own pool, and the self-hosted stack runs six
 * separate functions, so the per-process cap is multiplied twice over against
 * the customer's Postgres. node-postgres' default of 10 is what exhausts a
 * connection-per-process database under ordinary load.
 */
describe("runtime pool size", () => {
  async function poolMaxFor(value?: string): Promise<number | undefined> {
    vi.stubEnv("DATABASE_URL", "postgres://u:pw@h/db");
    vi.stubEnv("DATABASE_POOL_MAX", value ?? "");
    vi.resetModules();
    await import("../index");
    const config = mockPoolCtor.mock.calls[0]?.[0] as { max?: number };
    return config.max;
  }

  it("uses DATABASE_POOL_MAX when set", async () => {
    expect(await poolMaxFor("6")).toBe(6);
  });

  it("caps the pool by default rather than inheriting node-postgres' 10", async () => {
    // The default is the fix. Deferring to the driver is what exhausted a
    // customer's Postgres, so an unset value must not mean "10".
    expect(await poolMaxFor()).toBe(2);
  });

  it("falls back to the default on a non-numeric value, not a crash", async () => {
    expect(await poolMaxFor("lots")).toBe(2);
  });

  it("rejects zero and negatives, which would deadlock or throw", async () => {
    expect(await poolMaxFor("0")).toBe(2);
    mockPoolCtor.mockClear();
    expect(await poolMaxFor("-4")).toBe(2);
  });

  it("rejects a fractional value pg cannot use", async () => {
    expect(await poolMaxFor("2.5")).toBe(2);
  });
});

/**
 * `connectionTimeoutMillis` is unset by default, which node-postgres reads as
 * "wait forever". On Lambda that is paid as handler latency: a stalled pooler
 * (or a full pool whose in-flight queries have stalled) blocks the query until
 * the function's own timeout, holding an account-wide concurrency slot. The
 * bound is deliberate, so an unset value must not slip back in.
 */
describe("runtime pool connection timeout", () => {
  async function connectionTimeout(): Promise<number | undefined> {
    vi.stubEnv("DATABASE_URL", "postgres://u:pw@h/db");
    vi.resetModules();
    await import("../index");
    const config = mockPoolCtor.mock.calls[0]?.[0] as {
      connectionTimeoutMillis?: number;
    };
    return config.connectionTimeoutMillis;
  }

  it("bounds the connection-acquire wait instead of waiting forever", async () => {
    const timeout = await connectionTimeout();
    expect(typeof timeout).toBe("number");
    expect(Number.isFinite(timeout)).toBe(true);
    expect(timeout).toBeGreaterThan(0);
  });
});
