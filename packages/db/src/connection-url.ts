/**
 * DATABASE_URL handling shared by the app runtime and the self-hosted
 * migration scripts.
 *
 * Managed Postgres providers document libpq connection strings, but we connect
 * with node-postgres, which implements a subset of libpq's parameters. Where
 * the two disagree the failure is opaque — so normalize here, once, instead of
 * letting each caller rediscover it.
 */

const POSTGRES_SCHEMES = ["postgres:", "postgresql:"];

/**
 * libpq resolves `sslrootcert=system` (and its `os` alias) to the platform
 * trust store. node-postgres has no such concept: pg-connection-string passes
 * the value straight to `fs.readFileSync`, so the connection dies with
 * `ENOENT: no such file or directory, open 'system'` before any SQL runs.
 *
 * Dropping the parameter alone is NOT safe. pg-connection-string only creates
 * an `ssl` object when one of sslcert/sslkey/sslrootcert/sslmode is present, so
 * a URL whose only TLS parameter was `sslrootcert` drops to a CLEARTEXT
 * connection once it is removed. And under `uselibpqcompat=true`, `require`
 * verifies only while a CA is configured — remove the CA and it becomes
 * `rejectUnauthorized: false`. Both cases turn a fail-closed ENOENT into a
 * silently weakened session carrying the password, so the strip must re-pin the
 * mode. See `pinVerification` below.
 */
const TRUST_STORE_SENTINELS = new Set(["system", "os"]);

/**
 * sslmode values that deliberately opt out of verification. An ABSENT sslmode
 * is not opting out — it just inherits pg's default, which is no TLS at all.
 */
const TLS_OPT_OUT = new Set(["disable", "no-verify"]);

/**
 * Guarantee the URL still verifies after the CA reference is removed.
 * `verify-full` is the one mode that verifies under both pg-connection-string's
 * current mode aliasing and real libpq semantics, so pin it unless the operator
 * explicitly opted out. Returns a note when this actually changed something.
 */
function pinVerification(parsed: URL): string | undefined {
  // pg-connection-string assigns every query param in iteration order
  // (`config[key] = value`), so on a duplicated key the LAST value wins. Read
  // the same one pg will — reading the first let `?sslmode=no-verify&
  // sslmode=require&uselibpqcompat=true` take the opt-out branch here while pg
  // resolved `require` and connected unverified.
  const modes = parsed.searchParams.getAll("sslmode");
  const effective = modes.at(-1)?.toLowerCase();
  const hadCompat = parsed.searchParams.has("uselibpqcompat");

  // `set` collapses duplicates to a single entry, so both branches below leave
  // exactly one sslmode and no compat flag for pg to reinterpret.
  if (effective && TLS_OPT_OUT.has(effective)) {
    parsed.searchParams.set("sslmode", effective);
    parsed.searchParams.delete("uselibpqcompat");
    return;
  }

  const alreadyVerifying =
    modes.length === 1 && effective === "verify-full" && !hadCompat;
  parsed.searchParams.set("sslmode", "verify-full");
  parsed.searchParams.delete("uselibpqcompat");

  return alreadyVerifying
    ? undefined
    : "Pinned sslmode=verify-full — without the CA reference the original mode would have connected unverified (or in cleartext).";
}

/**
 * sslmode values pg-connection-string v2 treats as aliases for `verify-full`,
 * emitting a SECURITY WARNING the first time it parses one. Neon and most
 * managed providers hand out `sslmode=require`, so every process that connects
 * printed it.
 */
const VERIFY_FULL_ALIASES = new Set(["prefer", "require", "verify-ca"]);

/**
 * pg-connection-string's own test for a string it runs `encodeURI` over before
 * parsing. That pass double-encodes escapes like `%3D`, so pg reads such a URL
 * differently once `URL` has re-serialized it with the space already encoded.
 */
const PG_REENCODES = / |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i;

/**
 * Spell an aliased sslmode as the `verify-full` pg already applies to it.
 * Connections are unchanged today, the warning goes quiet, and the URL keeps
 * verifying once pg's next major gives `require` libpq's encrypt-only meaning.
 * Returns whether it rewrote anything.
 */
function spellOutVerifyFull(raw: string, parsed: URL): boolean {
  // Re-serializing is only lossless for a URL pg parses verbatim. The rest
  // keep the warning rather than risk a changed password or option.
  if (PG_REENCODES.test(raw)) {
    return false;
  }
  // Read the key exactly as pg does: case-sensitive, decoded, last value wins.
  // pg ignores `SSLMODE=`, so matching it here would add a second key that
  // changes the connection.
  const effective = parsed.searchParams.getAll("sslmode").at(-1);
  // `uselibpqcompat=true` opts into libpq semantics, under which `require`
  // really does mean encrypt-only. pg does not warn there; leave it alone.
  const compat = parsed.searchParams.getAll("uselibpqcompat").at(-1);
  if (!(effective && VERIFY_FULL_ALIASES.has(effective)) || compat === "true") {
    return false;
  }
  parsed.searchParams.set("sslmode", "verify-full");
  return true;
}

export type NormalizedDatabaseUrl = {
  url: string;
  /** Human-readable description of each adjustment made, for logging. */
  notes: string[];
};

export function normalizeDatabaseUrl(raw: string): NormalizedDatabaseUrl {
  const url = raw.trim();
  const notes: string[] = [];

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URI (libpq keyword/value form, or malformed) — leave it alone and
    // let assertPostgresUrl or pg produce the error.
    return { url, notes };
  }

  // Match the key the way pg sees it: decoded and case-insensitively. A raw
  // substring test missed `?%73slrootcert=` and `?SSLROOTCERT=`.
  const certKey = [...parsed.searchParams.keys()].find(
    (key) => key.toLowerCase() === "sslrootcert"
  );
  const sslRootCert = certKey ? parsed.searchParams.get(certKey) : undefined;
  if (!(sslRootCert && TRUST_STORE_SENTINELS.has(sslRootCert.toLowerCase()))) {
    // The sslmode rewrite gets no note: it is the mode pg already applies, not
    // an adjustment. When nothing changed, hand back the caller's string
    // byte-for-byte rather than a re-serialized equivalent.
    return spellOutVerifyFull(url, parsed)
      ? { url: parsed.toString(), notes }
      : { url, notes };
  }

  parsed.searchParams.delete(certKey as string);
  notes.push(
    `Dropped sslrootcert=${sslRootCert} — node-postgres would read it as a filename. TLS stays on and the certificate is verified against Node's bundled CA set (set NODE_EXTRA_CA_CERTS for a private CA).`
  );
  // pinVerification leaves either verify-full or an explicit opt-out, so the
  // aliased modes never survive this branch.
  const pinNote = pinVerification(parsed);
  if (pinNote) {
    notes.push(pinNote);
  }
  return { url: parsed.toString(), notes };
}

/**
 * The message of anything thrown, not just an `Error`.
 *
 * Not everything in this path rejects with an Error. A WebSocket driver rejects
 * with a DOM-style `ErrorEvent`, which carries a perfectly good `message` but
 * fails `instanceof Error` — so the old Error-only walk fell through to
 * `String(error)` and printed the literal text `[object ErrorEvent]`.
 */
function messageOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const { message } = value as { message?: unknown };
  return typeof message === "string" && message.length > 0
    ? message
    : undefined;
}

/**
 * The next link in a failure chain. `cause` is the standard one; `error` is
 * where event-style throwables put the underlying failure.
 */
function nextCause(value: unknown): unknown {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const { cause, error } = value as { cause?: unknown; error?: unknown };
  return cause ?? error;
}

/**
 * Flatten an error's `cause` chain into one line.
 *
 * The libraries in the selfhost path bury the actionable reason: Drizzle
 * reports only the SQL it tried to run ("Failed query: CREATE SCHEMA ...")
 * and hangs the real pg error off `cause`. Printing `err.message` alone left
 * operators staring at a statement with no reason it failed.
 */
export function describeMigrationError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current != null && !seen.has(current)) {
    seen.add(current);
    const raw = messageOf(current);
    if (raw !== undefined) {
      const code = (current as { code?: string }).code;
      // DrizzleQueryError's message embeds the whole query plus a `params:`
      // line — keep the statement, drop the rest. Other messages stay intact.
      const message = raw.startsWith("Failed query:")
        ? (raw.split("\n")[0] ?? raw)
        : raw;
      const described = code ? `${message} (${code})` : message;
      if (!parts.includes(described)) {
        parts.push(described);
      }
    }
    current = nextCause(current);
  }

  return parts.length > 0 ? parts.join(" — ") : String(error);
}

/**
 * Postgres/network failures operators can act on, mapped to the fix. Matched
 * against the flattened cause chain, since the pg error code and text are only
 * reachable through Drizzle's `cause`.
 */
const HINTS: Array<{ match: RegExp; hint: string }> = [
  // Filesystem errors first: an unreadable cert file reports "permission
  // denied, open '/path'", which would otherwise collect the GRANT hint below.
  {
    match: /\b(ENOENT|EACCES)\b/,
    // Node reads its own bundled CA set, NOT the OS trust store, so "just drop
    // the parameter" is wrong advice for a privately-signed cert.
    hint: "A file named in DATABASE_URL (usually sslrootcert) is missing or unreadable. Point it at a readable CA file, or set NODE_EXTRA_CA_CERTS if the certificate chains to a private CA.",
  },
  {
    match: /password authentication failed|28P01|28000/i,
    hint: "The credentials in DATABASE_URL were rejected. Check the user and password.",
  },
  {
    // Only the schema-creation case earns the GRANT CREATE advice. A 42501 on a
    // later ALTER is a different missing privilege, and this hint would send the
    // operator after the wrong one.
    match:
      /CREATE SCHEMA|permission denied for database|must be owner of database/i,
    hint: "The database user cannot create schemas. Grant it CREATE on the database (GRANT CREATE ON DATABASE <db> TO <user>), or use an owner role.",
  },
  {
    match: /permission denied|42501/i,
    hint: "The database user lacks a privilege this migration needs. The failing statement above names the object — grant on that, or run migrations as the database owner.",
  },
  {
    match: /database .* does not exist|3D000/i,
    hint: "The database named in DATABASE_URL does not exist. Create it first.",
  },
  {
    match: /no pg_hba\.conf entry|SSL|self[- ]signed|certificate/i,
    // verify-full, not require: pg-connection-string currently aliases require
    // to verify-full but warns it will adopt libpq's weaker semantics (encrypt,
    // do not verify) in its next major.
    hint: "TLS negotiation failed. Most managed Postgres requires ?sslmode=verify-full on DATABASE_URL.",
  },
  {
    match: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i,
    hint: "Could not reach the database host. Check the host and port, and that this machine is allowed through the firewall or IP allowlist.",
  },
];

/** The fix for a failure description, when we have one to offer. */
export function migrationHint(description: string): string | undefined {
  return HINTS.find(({ match }) => match.test(description))?.hint;
}

/**
 * One operator-facing line for a failed migration: the buried pg cause, plus
 * the fix when we recognize it.
 */
export function describeMigrationFailure(error: unknown): string {
  const description = describeMigrationError(error);
  const hint = migrationHint(description);
  return hint
    ? `Database migrations failed: ${description}\n${hint}`
    : `Database migrations failed: ${description}`;
}

/**
 * Fail fast on a connection string we can never connect with. Used by the
 * self-hosted deploy/upgrade path, where an operator is watching and a wrong
 * DATABASE_URL otherwise surfaces ten minutes later as unexplained SQL errors.
 */
export function assertPostgresUrl(raw: string): void {
  const url = raw.trim();
  if (!url) {
    throw new Error("DATABASE_URL is empty.");
  }

  if (!url.includes("://")) {
    // PlanetScale, RDS and others document a libpq keyword/value DSN
    // ("host=... port=... sslmode=require"). node-postgres only parses URIs.
    if (/(^|\s)(host|dbname|user)=/.test(url)) {
      throw new Error(
        "DATABASE_URL is a libpq keyword/value connection string, which node-postgres cannot parse. Use the URI form instead: postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=verify-full"
      );
    }
    throw new Error(
      "DATABASE_URL is not a connection URI. Expected postgresql://USER:PASSWORD@HOST:5432/DATABASE"
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "DATABASE_URL could not be parsed as a URI. If the password contains @ / : or ?, percent-encode it."
    );
  }

  if (POSTGRES_SCHEMES.includes(parsed.protocol)) {
    return;
  }

  if (parsed.protocol === "mysql:" || parsed.protocol === "mysql2:") {
    throw new Error(
      `DATABASE_URL points at MySQL (${parsed.protocol}//). Wraps requires PostgreSQL — its schema uses Postgres types, enums and partial indexes that have no MySQL equivalent.`
    );
  }

  throw new Error(
    `DATABASE_URL has an unsupported scheme (${parsed.protocol}//). Wraps requires PostgreSQL: postgresql://USER:PASSWORD@HOST:5432/DATABASE`
  );
}

/** Ports and hostname markers that indicate a transaction-mode pooler. */
const POOLER_PORTS = new Set(["6432"]);
const POOLER_HOST_MARKERS = ["pgbouncer", "psbouncer", "pooler"];

function looksPooled(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    if (POOLER_PORTS.has(parsed.port)) {
      return true;
    }
    const host = parsed.hostname.toLowerCase();
    return POOLER_HOST_MARKERS.some((marker) => host.includes(marker));
  } catch {
    return false;
  }
}

/**
 * Resolve the connection string for out-of-band DDL — specifically
 * `CREATE INDEX CONCURRENTLY`, which the scripts in `packages/db/scripts/` run.
 *
 * Prefers `DATABASE_DIRECT_URL`, falling back to `DATABASE_URL`.
 *
 * Why a second variable: a transaction-mode pooler (PlanetScale PSBouncer on
 * :6432, PgBouncer generally) cannot run `CREATE INDEX CONCURRENTLY` — it
 * assigns a server connection per transaction, and CONCURRENTLY needs one
 * session held across several table passes. Postgres rejects it with
 * "CREATE INDEX CONCURRENTLY cannot run inside a transaction block", which is
 * byte-identical to what the drizzle migrator produces for an unrelated reason
 * (drizzle wraps all migrations in one transaction). Same message, different
 * cause, very easy to misdiagnose — hence the explicit warning below.
 *
 * Applications should keep using the pooled `DATABASE_URL`; only DDL needs the
 * direct endpoint.
 */
export function resolveDirectDatabaseUrl(
  env: Record<string, string | undefined> = process.env
): NormalizedDatabaseUrl {
  const direct = env.DATABASE_DIRECT_URL?.trim();
  const pooled = env.DATABASE_URL?.trim();

  if (direct) {
    const normalized = normalizeDatabaseUrl(direct);
    if (looksPooled(direct)) {
      normalized.notes.push(
        "DATABASE_DIRECT_URL looks like a pooled endpoint (port 6432 or a pgbouncer/pooler hostname). CREATE INDEX CONCURRENTLY cannot run through a transaction-mode pooler — point this at the direct endpoint, usually port 5432."
      );
    }
    return normalized;
  }

  if (!pooled) {
    throw new Error(
      "Neither DATABASE_DIRECT_URL nor DATABASE_URL is set. Set DATABASE_DIRECT_URL to a DIRECT (non-pooled) Postgres URL — CREATE INDEX CONCURRENTLY cannot run through a transaction-mode pooler."
    );
  }

  const normalized = normalizeDatabaseUrl(pooled);
  if (looksPooled(pooled)) {
    normalized.notes.push(
      "DATABASE_URL looks like a pooled endpoint (port 6432 or a pgbouncer/pooler hostname) and DATABASE_DIRECT_URL is not set. CREATE INDEX CONCURRENTLY will fail through a transaction-mode pooler with 'cannot run inside a transaction block'. Set DATABASE_DIRECT_URL to the direct endpoint (usually the same host on port 5432)."
    );
  }
  return normalized;
}
