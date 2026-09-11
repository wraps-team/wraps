/**
 * Every index this schema declares but no migration creates.
 *
 * drizzle-kit wraps all migrations in a single transaction, and Postgres
 * refuses `CREATE INDEX CONCURRENTLY` inside a transaction block. So for tables
 * large enough that a blocking build is unacceptable, the migration ships with
 * the CREATE INDEX stripped (leaving a `-- NOTE:` pointer) and the index is
 * created out-of-band from here.
 *
 * This is the source of truth. `migrate-indexes.ts` runs the whole list; the
 * individual `create-*.ts` scripts run their own subset for targeted re-runs.
 * Adding an index means adding one entry here — not editing a script.
 */

export type ConcurrentIndex = {
  /** Index name, used for the post-create validity check. */
  name: string;
  /** Why it exists and what degrades without it. */
  purpose: string;
  /** DDL. Must be CONCURRENTLY + IF NOT EXISTS so re-runs are free. */
  ddl: string;
};

/**
 * Prerequisites that must run before the indexes. Not CONCURRENTLY, and not
 * always permitted: some managed providers restrict extension creation. A
 * failure here should skip the dependent indexes, not abort the whole run.
 */
export const INDEX_PREREQUISITES = [
  {
    name: "pg_trgm",
    ddl: "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    /** Indexes that cannot be built if this prerequisite fails. */
    dependents: [
      "message_send_search_recipient_trgm_idx",
      "message_send_search_subject_trgm_idx",
      "message_send_search_from_trgm_idx",
    ],
  },
] as const;

export const CONCURRENT_INDEXES: ConcurrentIndex[] = [
  {
    name: "message_send_dedup_idx",
    purpose:
      "Send deduplication: UNIQUE on (batchSendId, contactId). This is what stops a redelivered chunk from sending the same contact twice — the claim INSERT relies on it conflicting. Losing it does not degrade performance, it duplicates mail.",
    ddl: 'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "message_send_dedup_idx" ON "message_send" ("batch_send_id", "contact_id") WHERE contact_id IS NOT NULL',
  },
  {
    name: "contact_keyset_idx",
    purpose:
      "Batch-sender resume: keyset pagination over (organizationId, createdAt, id).",
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "contact_keyset_idx" ON "contact" ("organization_id", "created_at", "id")',
  },
  {
    name: "contact_org_id_idx",
    purpose:
      "Broadcast chunking: getContactsChunk pages with `organization_id = ? AND id > ? ORDER BY id`. Without it Postgres falls back to a contact_pkey scan filtered by org, reading other tenants' rows on every one of ~16k chunk queries in a large send.",
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "contact_org_id_idx" ON "contact" ("organization_id", "id")',
  },
  {
    name: "message_send_org_created_idx",
    purpose: "Email log listing, ordered by creation time within an org.",
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_send_org_created_idx" ON "message_send" ("organization_id", "created_at")',
  },
  {
    name: "message_send_org_channel_sent_at_idx",
    purpose: "Per-channel send history and sent-at ordering.",
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_send_org_channel_sent_at_idx" ON "message_send" ("organization_id", "channel", "sent_at")',
  },
  {
    name: "message_send_search_recipient_trgm_idx",
    purpose: "Email search: fuzzy recipient match. Requires pg_trgm.",
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_send_search_recipient_trgm_idx" ON "message_send" USING gin (recipient gin_trgm_ops)',
  },
  {
    name: "message_send_search_subject_trgm_idx",
    purpose: "Email search: fuzzy subject match. Requires pg_trgm.",
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_send_search_subject_trgm_idx" ON "message_send" USING gin (subject gin_trgm_ops) WHERE subject IS NOT NULL',
  },
  {
    name: "message_send_search_from_trgm_idx",
    purpose: "Email search: fuzzy sender match. Requires pg_trgm.",
    ddl: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_send_search_from_trgm_idx" ON "message_send" USING gin ("from" gin_trgm_ops) WHERE "from" IS NOT NULL',
  },
  {
    name: "message_send_workflow_step_dedup_idx",
    purpose:
      "Workflow send deduplication (plan 034): UNIQUE on (workflowExecutionId, stepId), partial on both being non-null so historical rows (step_id added after the fact) and non-workflow rows (no workflowExecutionId) never collide. This is what the workflow claim-before-send INSERT relies on to close the send-then-record duplicate-send window. Losing it does not degrade performance, it duplicates mail.",
    ddl: 'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "message_send_workflow_step_dedup_idx" ON "message_send" ("workflow_execution_id", "step_id") WHERE workflow_execution_id IS NOT NULL AND step_id IS NOT NULL',
  },
];
