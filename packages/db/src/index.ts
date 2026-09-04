import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { normalizeDatabaseUrl } from "./connection-url";
import * as schema from "./schema";

/**
 * Connections this process may hold.
 *
 * node-postgres defaults to 10, which suits a long-lived server but multiplies
 * badly on Lambda: every warm container carries its own pool, and the
 * self-hosted stack runs the API alongside separate batch and workflow
 * consumers. Ten per container times the concurrency is how a Postgres
 * instance runs out of connection slots — and a transaction-mode pooler in
 * front of it only moves where the ceiling is hit.
 *
 * Defaults to 2 rather than deferring to node-postgres, because every
 * deployment we run is serverless: a container serves one request at a time, so
 * the eight extra connections are never concurrency the app can use — they are
 * only headroom for the handful of queries a single request issues in parallel.
 */
const DEFAULT_POOL_MAX = 2;

function resolvePoolMax(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_POOL_MAX;
  }
  const parsed = Number(raw);
  // Env is a boundary: a typo here must not throw at import time and take
  // every query down with it. Fall back to the default instead.
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_MAX;
}

const pool = new Pool({
  connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL || "").url,
  max: resolvePoolMax(process.env.DATABASE_POOL_MAX),
  // Lambda freeze/thaw leaves sockets the pooler has already closed;
  // recycle aggressively so we rarely pick up a dead connection.
  idleTimeoutMillis: 30_000,
  maxLifetimeSeconds: 300,
});
// Errors on idle clients (e.g., pooler closing a frozen Lambda's socket)
// crash the process if unhandled; the pool discards the client either way.
pool.on("error", () => {});
export const db = drizzle(pool, { schema });

export type DbOrTx =
  | typeof db
  | PgTransaction<
      NodePgQueryResultHKT,
      typeof schema,
      ExtractTablesWithRelations<typeof schema>
    >;

// Re-export commonly used drizzle-orm operators
export { and, desc, eq, or, sql as sqlExpr } from "drizzle-orm";
export { assertPostgresUrl, normalizeDatabaseUrl } from "./connection-url";

/**
 * Escape ILIKE special characters to prevent wildcard injection.
 * Use before interpolating user input into ILIKE patterns.
 */
export function escapeIlike(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}
// Re-export repositories
export * from "./repositories";
// Re-export all schemas for use elsewhere
export * from "./schema";
// Re-export segment condition validation
export {
  MAX_BUCKETS,
  validateBucketValue,
  validateCondition,
} from "./segment-condition";
// Re-export segment evaluator (SQL-based)
export {
  contactIdsMatchingCondition,
  contactMatchesCondition,
  getSegmentsByIds,
} from "./segment-evaluator";
// Re-export segment filter SQL builder
export {
  bucketIndexSQL,
  buildConditionSQL,
  buildFilterSQL,
} from "./segment-filter";
