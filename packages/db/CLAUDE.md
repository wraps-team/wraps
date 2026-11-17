# Wraps Database (packages/db)

Drizzle ORM on Postgres (Neon). Multi-tenant: org-owned data is scoped by `organizationId`.
Read `src/schema/*.ts` for column, ID, timestamp, enum, JSONB, index-naming and relation
conventions; the rules below are the ones a schema file can't explain.

## Critical Rules

### 1. Org-Owned Tables Carry organizationId (cascade) and an Org Index

Give every new org-owned table an `organizationId` FK to `organization.id` with
`onDelete: "cascade"`, so its rows are deleted with their org, and an index on
`organizationId` so org-scoped queries (invariant 4) stay cheap. Copy the column from
`contact` in `src/schema/contacts.ts`.

Real exceptions today:

- **No `organizationId` column**:
  - the better-auth identity tables in `src/schema/auth.ts` (`user`, `session`, `account`,
    `verification`, `passkey`, `two_factor`, `device_code`, `organization`; `subscription`
    keys on `referenceId` instead) and the seven SCIM plugin tables in
    `src/schema/scim-provider.ts:44` (the plugin owns their shape);
  - the notification plugin tables `notification_delivery` and `inbox_presence`
    (comment at `src/schema/auth.ts:224`);
  - `waitlist` (pre-signup, no org yet);
  - child tables that reach their org through a cascading parent FK:
    `aws_account_permission` → `aws_account`, `contact_topic` → `contact`,
    `template_version` → `template`, `workflow_step_execution` → `workflow_execution`.
- **Nullable `organizationId` with `onDelete: "set null"`**: `aws_marketplace_subscription`,
  deliberately, because the row exists before the buyer has an org (comment at
  `src/schema/aws-marketplace.ts:44`).
- **No separate org index**: `organization_extension` and `topic_settings`, whose
  `organizationId` is the primary key; the better-auth `member`, `invitation` and
  `statement` tables.

### 2. Unique Constraints Include organizationId

On an org-owned table, make a unique index per org, e.g.
`uniqueIndex("template_org_slug_idx").on(table.organizationId, table.slug)`, so one org's
values never block another's. Real exceptions today:

- globally unique tokens and external IDs: `api_key_key_hash_idx`, `template_room_id_idx`,
  `message_send_message_id_idx`, `aws_account.external_id`, `sso_provider.provider_id`,
  `aws_marketplace_subscription.license_arn`;
- indexes keyed on a parent FK that is already org-scoped: `message_send_dedup_idx`,
  `message_send_workflow_step_dedup_idx`, `workflow_execution_no_reentry_idx`, and the
  `message_send_diagnostic` primary key (`messageSendId`, `eventType`);
- tables with no `organizationId` (rule 1) key their unique indexes on their parent or
  their own columns instead.

### 3. User FKs: set null for Authorship, cascade for Identity

Authorship and audit FKs (`createdBy`, `lastEditedBy`, `grantedBy`, `decidedBy`, and the
`userId` on `audit_log`, `ai_usage_log`, `sso_provider`, `scim_provider`) use
`onDelete: "set null"` and stay nullable, so content and history outlive the user who made
them. Identity and membership rows cascade with their user: the better-auth tables in
`src/schema/auth.ts`, the SCIM identity tables in `src/schema/scim-provider.ts`, and
`aws_account_permission.userId`.

Two FKs break this today and are an open decision, not a pattern to copy:
`reusable_block.createdBy` (`src/schema/templates.ts:190`) and `ai_conversation.createdBy`
(`src/schema/templates.ts:314`) pair `set null` with `.notNull()`, so deleting a user who authored one
of those rows fails with a not-null violation.

## ⚠️ Production vs Dev Database

Two separate Neon databases exist:
- **`apps/web/.env.local`** → DEV (`ep-autumn-block-*`) — test data only
- **`apps/web/.env.production.local`** → PRODUCTION (`ep-damp-heart-*`) — real customer data

To connect to **production**:

```bash
# Export the production DATABASE_URL
eval "$(scripts/db-prod-url.sh)"

# Confirm you're on prod (endpoint should contain ep-damp-heart)
echo $DATABASE_URL | grep -o 'ep-[^-]*-[^.]*'

# Then query with psql
psql "$DATABASE_URL"
```

**When asked to analyze data or run queries, always use the production database unless explicitly told to use dev.**

## Migration Workflow

Generate migrations with `pnpm --filter @wraps/db db:generate`; the rules for the
generated files are in `src/migrations/CLAUDE.md`.

### CONCURRENT Indexes (out-of-band)

drizzle-kit wraps every migration in a transaction, which rejects
`CREATE INDEX CONCURRENTLY`. For large tables where a blocking index build
is unacceptable, the DDL lives in a manifest and runs out-of-band.

**`scripts/index-manifest.ts` is the source of truth. Adding an index means
adding one entry there — not writing a script.** `migrate-indexes.ts` runs the
whole list; the per-area `create-*.ts` scripts are three-line wrappers around
`runIndexSubset` that exist only because migration `-- NOTE:` comments name
them. Do not hand-roll a connection, and do not put DDL in a script.

1. **Declare the index in `schema/*.ts`.** Drizzle's snapshot will then list it
   as existing. Leave the generated `meta/*_snapshot.json` and `_journal.json`
   exactly as produced — schema and snapshot keep declaring the index while the
   SQL no longer creates it. That asymmetry IS the pattern, not drift;
   `drizzle-kit check` still passes.
2. **Strip the `CREATE INDEX` statements** from the generated migration SQL,
   leaving a `-- NOTE:` pointer. `0070_supreme_nick_fury.sql` is the precedent
   for a NOTE-only migration; `0055` and `0086` show one alongside real DDL.
3. **Add one entry to `CONCURRENT_INDEXES`** in `scripts/index-manifest.ts`
   with `name`, `purpose` (what degrades without it), and `ddl`. The `ddl` must
   be `CONCURRENTLY` + `IF NOT EXISTS` so re-runs are free.
4. **Optionally add a wrapper** under `scripts/` if a migration NOTE names one:
   `runIndexSubset(["<index_name>"])`, nothing else. Mirror
   `create-contact-event-analytics-index.ts`.
5. **Document the deploy order**: `db:migrate` first, then
   `pnpm --filter @wraps/db db:migrate-indexes` (or the named wrapper), then
   ship the code that relies on the index.

**Use `pg`, never `@neondatabase/serverless`.** The Neon serverless driver
speaks only to Neon's WebSocket proxy, so on RDS, Supabase, Docker — any
self-hosted Postgres — every statement dies in the handshake, which surfaced
as a useless `[object ErrorEvent]`. It is also a devDependency, absent from a
production self-hosted install. `baseline/architecture.test.ts` enforces this
on `migrate-indexes.ts` and `run-index-subset.ts`.

Reference: `scripts/index-manifest.ts`, `scripts/run-index-subset.ts`.

#### These scripts need a DIRECT connection

They resolve their connection via `resolveDirectDatabaseUrl()`, which prefers
**`DATABASE_DIRECT_URL`** and falls back to `DATABASE_URL`. Set the direct
variable whenever the database sits behind a transaction-mode pooler
(PlanetScale PSBouncer on `:6432`, PgBouncer generally): such a pooler assigns
a server connection per transaction, while `CREATE INDEX CONCURRENTLY` needs
one session held across several table passes.

The trap is the error text. A pooler rejects it with
`CREATE INDEX CONCURRENTLY cannot run inside a transaction block` — **byte
identical** to what the drizzle migrator produces for a completely different
reason (drizzle wraps all migrations in one transaction). Same message, two
unrelated causes. `resolveDirectDatabaseUrl` warns when the URL looks pooled
so the two are distinguishable.

Applications keep using the pooled `DATABASE_URL`; only DDL needs the direct
endpoint.

#### Verify validity, not just existence

A `CONCURRENTLY` build that fails partway leaves an **invalid** index behind.
`IF NOT EXISTS` then silently skips it on the next run, so a green re-run can
still mean no usable index — the planner ignores invalid ones.

```sql
SELECT c.relname, i.indisvalid
FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
WHERE c.relname = '<index_name>';
```

`indisvalid = false` → `DROP INDEX CONCURRENTLY <name>;` and re-run.

Config in `drizzle.config.ts` reads env from `apps/web/.env.local`.
