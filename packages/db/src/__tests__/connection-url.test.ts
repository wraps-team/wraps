import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  assertPostgresUrl,
  describeMigrationError,
  describeMigrationFailure,
  migrationHint,
  normalizeDatabaseUrl,
  resolveDirectDatabaseUrl,
} from "../connection-url";

// The parser pg itself runs on a connection string. Only a transitive
// dependency under pnpm's strict layout, so resolve it from pg.
const parsePgConnectionString: (url: string) => Record<string, unknown> =
  createRequire(createRequire(import.meta.url).resolve("pg"))(
    "pg-connection-string"
  ).parse;

// PlanetScale documents this exact shape for Postgres, and pg cannot use it
// verbatim: sslrootcert=system is read as a filename.
const PLANETSCALE_URL =
  "postgresql://postgres.abc123:pscale_pw_secret@xyz-useast1-1.horizon.psdb.cloud:5432/my_database?sslmode=verify-full&sslrootcert=system";

describe("normalizeDatabaseUrl", () => {
  it("drops sslrootcert=system so pg does not read it as a filename", () => {
    const { url, notes } = normalizeDatabaseUrl(PLANETSCALE_URL);

    expect(url).not.toContain("sslrootcert");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/sslrootcert=system/);
  });

  it("keeps sslmode so TLS and certificate verification stay on", () => {
    const { url } = normalizeDatabaseUrl(PLANETSCALE_URL);

    expect(url).toContain("sslmode=verify-full");
  });

  it("preserves credentials, host, port and database", () => {
    const { url } = normalizeDatabaseUrl(PLANETSCALE_URL);
    const parsed = new URL(url);

    expect(parsed.username).toBe("postgres.abc123");
    expect(parsed.password).toBe("pscale_pw_secret");
    expect(parsed.hostname).toBe("xyz-useast1-1.horizon.psdb.cloud");
    expect(parsed.port).toBe("5432");
    expect(parsed.pathname).toBe("/my_database");
  });

  it("drops the os alias too", () => {
    const { url } = normalizeDatabaseUrl(
      "postgresql://u:p@h:5432/db?sslmode=require&sslrootcert=OS"
    );

    expect(url).not.toContain("sslrootcert");
  });

  describe("TLS must not weaken when the CA reference is removed", () => {
    // Each of these parsed to a verifying config ONLY because sslrootcert was
    // present. Removing it without re-pinning the mode silently downgraded the
    // connection — from a fail-closed ENOENT to cleartext or unverified TLS.
    it("pins verify-full when sslrootcert was the only TLS parameter", () => {
      const { url, notes } = normalizeDatabaseUrl(
        "postgres://u:p@h/db?sslrootcert=system"
      );

      expect(url).toContain("sslmode=verify-full");
      expect(notes.join(" ")).toMatch(/verify-full/);
    });

    it("drops uselibpqcompat, under which require stops verifying without a CA", () => {
      const { url } = normalizeDatabaseUrl(
        "postgres://u:p@h/db?uselibpqcompat=true&sslmode=require&sslrootcert=system"
      );

      expect(url).not.toContain("uselibpqcompat");
      expect(url).toContain("sslmode=verify-full");
    });

    it("leaves an already-verifying URL unannotated", () => {
      const { url, notes } = normalizeDatabaseUrl(PLANETSCALE_URL);

      expect(url).toContain("sslmode=verify-full");
      // Only the sslrootcert note — nothing was re-pinned.
      expect(notes).toHaveLength(1);
    });

    it("respects an explicit opt-out rather than forcing TLS on", () => {
      const { url } = normalizeDatabaseUrl(
        "postgres://u:p@h/db?sslmode=disable&sslrootcert=system"
      );

      expect(url).toContain("sslmode=disable");
      expect(url).not.toContain("verify-full");
    });

    it("resolves a duplicated sslmode to the value pg honors — the last", () => {
      // Reading the FIRST value took the opt-out branch here while pg resolved
      // `require` under uselibpqcompat and connected with
      // rejectUnauthorized:false.
      const { url } = normalizeDatabaseUrl(
        "postgres://u:p@h/db?sslmode=no-verify&sslmode=require&uselibpqcompat=true&sslrootcert=system"
      );

      expect(url).toContain("sslmode=verify-full");
      expect(url).not.toContain("uselibpqcompat");
      expect(url).not.toContain("no-verify");
    });

    it("collapses duplicates on the opt-out branch too", () => {
      const { url } = normalizeDatabaseUrl(
        "postgres://u:p@h/db?sslmode=require&sslmode=disable&uselibpqcompat=true&sslrootcert=system"
      );

      expect(url.match(/sslmode=/g)).toHaveLength(1);
      expect(url).toContain("sslmode=disable");
      expect(url).not.toContain("uselibpqcompat");
    });

    it("matches the parameter case-insensitively, as pg does", () => {
      const { url } = normalizeDatabaseUrl(
        "postgres://u:p@h/db?SSLROOTCERT=system"
      );

      expect(url.toLowerCase()).not.toContain("sslrootcert");
      expect(url).toContain("sslmode=verify-full");
    });

    it("matches a percent-encoded parameter name", () => {
      const { url } = normalizeDatabaseUrl(
        "postgres://u:p@h/db?%73slrootcert=system"
      );

      expect(url.toLowerCase()).not.toContain("slrootcert");
      expect(url).toContain("sslmode=verify-full");
    });
  });

  it("leaves a real CA file path alone", () => {
    const { url, notes } = normalizeDatabaseUrl(
      "postgresql://u:p@h:5432/db?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca.pem"
    );

    expect(url).toContain("sslrootcert=/etc/ssl/certs/ca.pem");
    expect(notes).toHaveLength(0);
  });

  describe("sslmodes pg aliases to verify-full", () => {
    // pg-connection-string v2 already connects `prefer`/`require`/`verify-ca`
    // as verify-full, but prints a SECURITY WARNING the first time it parses
    // one. Spelling the mode out keeps the connection identical and quiet.
    const NEON =
      "postgresql://user:pw@ep-damp-heart-123.us-east-1.aws.neon.tech/neondb?sslmode=require";

    it("rewrites a Neon sslmode=require and changes nothing else", () => {
      const { url, notes } = normalizeDatabaseUrl(NEON);

      expect(url).toBe(NEON.replace("sslmode=require", "sslmode=verify-full"));
      // Not an adjustment worth logging — pg already applied this mode.
      expect(notes).toHaveLength(0);
    });

    it.each(["prefer", "verify-ca"])("rewrites sslmode=%s too", (mode) => {
      const { url } = normalizeDatabaseUrl(
        `postgres://u:p@h/db?sslmode=${mode}`
      );

      expect(url).toBe("postgres://u:p@h/db?sslmode=verify-full");
    });

    it("collapses duplicates to the value pg honors — the last", () => {
      const { url } = normalizeDatabaseUrl(
        "postgres://u:p@h/db?sslmode=disable&sslmode=require"
      );

      expect(url).toBe("postgres://u:p@h/db?sslmode=verify-full");
    });

    it("leaves uselibpqcompat=true alone, where require means encrypt-only", () => {
      const compat = "postgres://u:p@h/db?uselibpqcompat=true&sslmode=require";

      expect(normalizeDatabaseUrl(compat).url).toBe(compat);
    });

    it("leaves a key pg would not read alone", () => {
      // pg reads `sslmode` case-sensitively; it ignores `SSLMODE=require`, so
      // adding a real `sslmode` beside it would change the connection.
      const upper = "postgres://u:p@h/db?SSLMODE=require";

      expect(normalizeDatabaseUrl(upper).url).toBe(upper);
    });

    it.each(["disable", "no-verify", "verify-full"])(
      "leaves sslmode=%s untouched",
      (mode) => {
        const raw = `postgres://u:p@h/db?sslmode=${mode}`;

        expect(normalizeDatabaseUrl(raw).url).toBe(raw);
      }
    );

    it("parses to the same pg config apart from sslmode", () => {
      // The rewrite re-serializes the whole URL, so prove pg's own parser reads
      // the credentials, host and every other parameter back unchanged.
      const raw =
        "postgresql://neondb_owner:p+w%25d%20@s@ep-x-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require&options=-c%20search_path%3Dx";
      const before = parsePgConnectionString(raw);
      const after = parsePgConnectionString(normalizeDatabaseUrl(raw).url);

      expect(after.sslmode).toBe("verify-full");
      expect({ ...after, sslmode: undefined }).toEqual({
        ...before,
        sslmode: undefined,
      });
    });

    it("leaves a URL pg re-encodes before parsing alone", () => {
      // A raw space sends pg through encodeURI, which turns this `%3D` into a
      // literal "%3D". Re-serialized, the same URL would parse it as "=".
      const raw =
        "postgresql://u:p s@h/db?sslmode=require&options=-c%20search_path%3Dx";

      expect(normalizeDatabaseUrl(raw).url).toBe(raw);
    });
  });

  it("passes an empty value through instead of throwing", () => {
    expect(normalizeDatabaseUrl("").url).toBe("");
  });

  it("passes a non-URI through for the caller to reject", () => {
    const dsn = "host=x.psdb.cloud port=5432 dbname=db sslmode=require";

    expect(normalizeDatabaseUrl(dsn).url).toBe(dsn);
  });
});

describe("assertPostgresUrl", () => {
  it("accepts postgres:// and postgresql://", () => {
    expect(() => assertPostgresUrl("postgres://u:p@h:5432/db")).not.toThrow();
    expect(() =>
      assertPostgresUrl("postgresql://u:p@h:5432/db?sslmode=require")
    ).not.toThrow();
  });

  it("accepts the PlanetScale Postgres URI", () => {
    expect(() => assertPostgresUrl(PLANETSCALE_URL)).not.toThrow();
  });

  it("names the libpq keyword/value format when given one", () => {
    // What you get if you copy PlanetScale's psql example into DATABASE_URL.
    expect(() =>
      assertPostgresUrl(
        "host=xyz.horizon.psdb.cloud port=5432 user=postgres.abc dbname=db sslmode=verify-full"
      )
    ).toThrow(/keyword\/value/);
  });

  it("rejects a MySQL URL as unsupported, not as a credentials problem", () => {
    expect(() => assertPostgresUrl("mysql://u:p@h:3306/db")).toThrow(
      /requires PostgreSQL/
    );
  });

  it("rejects an empty value", () => {
    expect(() => assertPostgresUrl("   ")).toThrow(/empty/);
  });

  it("suggests percent-encoding when the URI will not parse", () => {
    expect(() => assertPostgresUrl("postgresql://u:p@[nope:5432/db")).toThrow(
      /percent-encode/
    );
  });

  it("tolerates an unencoded @ in the password, as WHATWG parsing does", () => {
    // The last @ delimits the host, so this is unambiguous and pg accepts it.
    expect(() =>
      assertPostgresUrl("postgresql://u:p@ss@h:5432/db")
    ).not.toThrow();
  });
});

describe("describeMigrationError", () => {
  it("unwraps the pg error Drizzle hides behind 'Failed query'", () => {
    // Exactly what a self-hosted operator saw: a bare SQL statement, no reason.
    const pgError = Object.assign(
      new Error('permission denied for database "wraps"'),
      { code: "42501" }
    );
    const drizzleError = new Error(
      'Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"\nparams: '
    );
    drizzleError.cause = pgError;

    const described = describeMigrationError(drizzleError);

    expect(described).toContain('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    expect(described).toContain('permission denied for database "wraps"');
    expect(described).toContain("42501");
    // The `params:` line is noise, not a reason.
    expect(described).not.toContain("params:");
  });

  it("keeps multi-line messages intact for non-Drizzle errors", () => {
    const error = new Error("something broke\nhere is how to fix it");

    expect(describeMigrationError(error)).toBe(
      "something broke\nhere is how to fix it"
    );
  });

  it("walks a multi-level cause chain", () => {
    const root = new Error("ECONNREFUSED 10.0.0.1:5432");
    const middle = new Error("connection failed");
    middle.cause = root;
    const outer = new Error("migration aborted");
    outer.cause = middle;

    expect(describeMigrationError(outer)).toBe(
      "migration aborted — connection failed — ECONNREFUSED 10.0.0.1:5432"
    );
  });

  it("survives a self-referential cause instead of looping forever", () => {
    const error = new Error("loop");
    error.cause = error;

    expect(describeMigrationError(error)).toBe("loop");
  });

  it("stringifies non-Error throws", () => {
    expect(describeMigrationError("plain string")).toBe("plain string");
  });

  it("reads the message off an event-style throwable", () => {
    // A WebSocket driver rejects with a DOM-style ErrorEvent, which carries a
    // message but is not an Error. A self-hosted operator saw every index
    // failure reported as the literal text "[object ErrorEvent]".
    const errorEvent = {
      type: "error",
      message: "Unexpected server response: 404",
    };

    expect(describeMigrationError(errorEvent)).toBe(
      "Unexpected server response: 404"
    );
  });

  it("follows the `error` property an event-style throwable wraps", () => {
    const errorEvent = {
      type: "error",
      message: "connection failed",
      error: Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), {
        code: "ECONNREFUSED",
      }),
    };

    expect(describeMigrationError(errorEvent)).toBe(
      "connection failed — connect ECONNREFUSED 10.0.0.1:5432 (ECONNREFUSED)"
    );
  });

  it("keeps walking past a link that carries no message", () => {
    // The outer wrapper is messageless; the reason underneath still has to
    // reach the operator rather than being swallowed with it.
    const outer = { cause: new Error("relation does not exist") };

    expect(describeMigrationError(outer)).toBe("relation does not exist");
  });
});

describe("migrationHint", () => {
  it.each([
    ["password authentication failed (28P01)", /credentials in DATABASE_URL/],
    ["permission denied for database (42501)", /GRANT CREATE ON DATABASE/],
    ['database "wraps" does not exist (3D000)', /does not exist. Create it/],
    ["no pg_hba.conf entry for host", /sslmode=verify-full/],
    ["connect ECONNREFUSED 10.0.0.1:5432", /reach the database host/],
  ])("maps %s to an actionable fix", (description, expected) => {
    expect(migrationHint(description)).toMatch(expected);
  });

  it("maps a missing sslrootcert file to the trust-store fix", () => {
    expect(
      migrationHint("ENOENT: no such file or directory, open 'system'")
    ).toMatch(/sslrootcert/);
  });

  it("prefers the file hint over the GRANT hint when both patterns match", () => {
    // An unreadable CA file reports "permission denied", which must not be
    // diagnosed as a missing CREATE privilege on the database. This asserts the
    // HINTS ordering, not just the patterns.
    const description =
      "EACCES: permission denied, open '/etc/ssl/certs/ca.pem' (EACCES)";

    expect(migrationHint(description)).toMatch(/sslrootcert/);
    expect(migrationHint(description)).not.toMatch(/GRANT CREATE ON DATABASE/);
  });

  it("does not blame schema creation for an unrelated privilege error", () => {
    const hint = migrationHint('permission denied for table "user" (42501)');

    expect(hint).toMatch(/lacks a privilege/);
    expect(hint).not.toMatch(/GRANT CREATE ON DATABASE/);
  });

  it("returns nothing for failures it cannot advise on", () => {
    expect(migrationHint("syntax error at or near FOO")).toBeUndefined();
  });
});

describe("describeMigrationFailure", () => {
  // Both selfhost entry points (the CLI command and the repo script) report
  // through this, so an operator gets the same cause AND the same fix either way.
  it("reports the buried cause and the fix together", () => {
    const pgError = Object.assign(
      new Error('permission denied for database "wraps"'),
      { code: "42501" }
    );
    const drizzleError = new Error(
      'Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"\nparams: '
    );
    drizzleError.cause = pgError;

    const message = describeMigrationFailure(drizzleError);

    expect(message).toContain("Database migrations failed:");
    expect(message).toContain('permission denied for database "wraps"');
    expect(message).toContain("GRANT CREATE ON DATABASE");
  });

  it("omits the hint line when nothing matches", () => {
    const message = describeMigrationFailure(
      new Error("syntax error at or near FOO")
    );

    expect(message).toBe(
      "Database migrations failed: syntax error at or near FOO"
    );
  });
});

describe("resolveDirectDatabaseUrl", () => {
  const DIRECT = "postgresql://u:p@host.example:5432/wraps?sslmode=require";
  const POOLED = "postgresql://u:p@host.example:6432/wraps?sslmode=require";

  it("prefers DATABASE_DIRECT_URL over DATABASE_URL", () => {
    const { url } = resolveDirectDatabaseUrl({
      DATABASE_DIRECT_URL: DIRECT,
      DATABASE_URL: POOLED,
    });

    expect(url).toContain(":5432");
    expect(url).not.toContain(":6432");
  });

  it("warns when falling back to a pooled DATABASE_URL", () => {
    // The failure this prevents: PSBouncer rejects CREATE INDEX CONCURRENTLY
    // with the SAME message the drizzle migrator produces for an unrelated
    // reason, so without this note the operator misdiagnoses it.
    const { url, notes } = resolveDirectDatabaseUrl({ DATABASE_URL: POOLED });

    expect(url).toContain(":6432");
    expect(notes.join(" ")).toMatch(/DATABASE_DIRECT_URL is not set/);
    expect(notes.join(" ")).toMatch(/cannot run inside a transaction block/);
  });

  it("stays silent when DATABASE_URL is already a direct endpoint", () => {
    const { notes } = resolveDirectDatabaseUrl({ DATABASE_URL: DIRECT });

    expect(notes.join(" ")).not.toMatch(/pooled endpoint/);
  });

  it("detects a pooler by hostname, not only by port", () => {
    const { notes } = resolveDirectDatabaseUrl({
      DATABASE_URL: "postgresql://u:p@ep-1-pooler.example:5432/wraps",
    });

    expect(notes.join(" ")).toMatch(/pooled endpoint/);
  });

  it("warns when DATABASE_DIRECT_URL is itself pooled", () => {
    const { notes } = resolveDirectDatabaseUrl({
      DATABASE_DIRECT_URL: POOLED,
    });

    expect(notes.join(" ")).toMatch(/DATABASE_DIRECT_URL looks like a pooled/);
  });

  it("still strips sslrootcert=system from the direct URL", () => {
    // PlanetScale's documented URL shape — node-postgres reads `system` as a
    // filename and dies with ENOENT before any SQL runs.
    const { url } = resolveDirectDatabaseUrl({
      DATABASE_DIRECT_URL: `${DIRECT}&sslrootcert=system`,
    });

    expect(url).not.toContain("sslrootcert");
  });

  it("throws a directional error when neither variable is set", () => {
    expect(() => resolveDirectDatabaseUrl({})).toThrow(
      /DATABASE_DIRECT_URL.*DATABASE_URL/s
    );
  });
});
