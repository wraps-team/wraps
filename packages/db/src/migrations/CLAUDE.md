# Migrations — Rules for Agents

Everything in this directory is owned by drizzle-kit. Read this before
editing anything here.

## Hard rules

1. **Never hand-edit or hand-create files under `meta/`** (`*_snapshot.json`,
   `_journal.json`). They are machine-generated. Hand-edited snapshots broke
   `db:generate` repo-wide for migrations 0055–0059: index `columns` were
   encoded as strings where drizzle's v7 schema requires objects, and every
   later migration had to be hand-written as a workaround.
2. **Never hand-write migration SQL plus journal entries to bypass a broken
   `db:generate`.** Fix the generator instead (playbook below).
3. **Do not run formatters here.** `meta/` is excluded from Biome
   (`biome.jsonc`); drizzle-kit's raw output is canonical. Snapshots
   0000–0059 predate the exclusion and are Biome-styled — leave them as
   they are.
4. **Snapshot gaps are normal.** 0040 and 0058 have journal+SQL but no
   snapshot; drizzle tolerates gaps. Never backfill a missing snapshot.

## If `db:generate` fails with "data is malformed"

1. Probe (offline, read-only, no DB needed):
   `cd packages/db && npx drizzle-kit check`
   Healthy: `Everything's fine 🐶🔥`. Broken: one `data is malformed` line
   per bad snapshot.
2. The usual cause is hand-edited snapshot JSON that fails drizzle's zod
   schema — e.g. index `columns` entries as `"col"` strings instead of
   `{ "expression": "col", "isExpression": false, "asc": true, "nulls": "last" }`
   objects.
3. Repair the encoding in the named files — change nothing else (not `id`,
   not `prevId`) — and re-run the probe.

## Manual SQL (e.g. CREATE INDEX CONCURRENTLY)

Do not bypass drizzle. Follow the out-of-band pattern in
`packages/db/CLAUDE.md` → "CONCURRENT Indexes": declare the index in
`schema/*.ts` as the source of truth, strip the statement from the generated
migration SQL, and create the index via a script under
`packages/db/scripts/`.

## Normal workflow

Edit `packages/db/src/schema/*.ts` → `pnpm --filter @wraps/db db:generate`
→ review the generated SQL → `node scripts/test-db/ci-branch.mjs push-worktree` so this
worktree's `wt-*` test branch has the new schema (stop if it prompts; never `db:push` or
`db:migrate`, which reach other databases) → run the tests → commit schema + SQL + meta
together. Details: `docs/agents/test-database.md`, "Testing a PR's schema change".
