/**
 * One-off backfill: mark contacts whose latest email bounced softly.
 *
 * Contacts that soft-bounced before the `soft_bounced` status existed still read
 * `active`. This finds them and, with --apply, marks them.
 *
 * Conservative on purpose: it never escalates to `bounced`, and it ignores older
 * bounce history, so a contact with several historical soft bounces starts at a
 * count of 1.
 *
 * A contact is a candidate when ALL of these hold:
 *   - email_status is NULL or 'active', and it has an email address;
 *   - its most recent email-channel message_send (same organization, ordered by
 *     sent_at DESC NULLS LAST) has status 'bounced' and bounce_type 'Transient';
 *   - that row's bounce_sub_type is not MessageTooLarge, ContentRejected or
 *     AttachmentRejected (those describe the message, not the recipient).
 *
 * Usage (from packages/db):
 *   tsx scripts/backfill-soft-bounces.ts            # dry run: counts per org
 *   tsx scripts/backfill-soft-bounces.ts --apply    # write the changes
 *
 * Uses `pg`, never the Neon serverless driver (see packages/db/CLAUDE.md).
 * The UPDATE is scoped by organization_id and re-checks the status guard, so a
 * contact that changed since the scan is left alone.
 */

import dotenv from "dotenv";
import { Pool } from "pg";
import { normalizeDatabaseUrl } from "../src/connection-url";

dotenv.config({ path: "../../apps/web/.env.local" });
dotenv.config({ path: "../../.env" });

const APPLY = process.argv.includes("--apply");

/** Bounce sub-types that describe the message, not the recipient's mailbox. */
const MESSAGE_LEVEL_SUB_TYPES = [
  "MessageTooLarge",
  "ContentRejected",
  "AttachmentRejected",
];

type Candidate = {
  contact_id: string;
  organization_id: string;
  bounced_at: Date | null;
};

/**
 * Latest email send per eligible contact, then keep the ones that soft-bounced.
 * DISTINCT ON picks the most recent row first; the bounce filters apply to that
 * row only, never to older ones.
 */
const CANDIDATES_SQL = `
  SELECT contact_id, organization_id, bounced_at
  FROM (
    SELECT DISTINCT ON (c.id)
      c.id AS contact_id,
      c.organization_id AS organization_id,
      ms.status::text AS status,
      ms.bounce_type AS bounce_type,
      ms.bounce_sub_type AS bounce_sub_type,
      ms.bounced_at AS bounced_at
    FROM contact c
    JOIN message_send ms
      ON ms.contact_id = c.id
     AND ms.organization_id = c.organization_id
     AND ms.channel = 'email'
    WHERE (c.email_status IS NULL OR c.email_status = 'active')
      AND c.email IS NOT NULL
    ORDER BY c.id, ms.sent_at DESC NULLS LAST
  ) latest
  WHERE status = 'bounced'
    AND bounce_type = 'Transient'
    AND (bounce_sub_type IS NULL OR bounce_sub_type <> ALL($1::text[]))
`;

const UPDATE_SQL = `
  UPDATE contact
  SET email_status = 'soft_bounced',
      email_soft_bounce_count = 1,
      email_last_soft_bounced_at = $3
  WHERE id = $1
    AND organization_id = $2
    AND (email_status IS NULL OR email_status = 'active')
`;

async function main(): Promise<void> {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    console.error(`
DATABASE_URL not found. Either:
  1. Create apps/web/.env.local with DATABASE_URL
  2. Or run with: DATABASE_URL="..." tsx scripts/backfill-soft-bounces.ts
`);
    process.exit(1);
  }

  const { url } = normalizeDatabaseUrl(raw);

  // Host only. Never print the credentials or the full URL.
  let host = "(unparseable)";
  try {
    host = new URL(url).host;
  } catch {
    // leave the placeholder
  }
  console.log(`Database host: ${host}`);
  console.log(APPLY ? "Mode: --apply (will write)" : "Mode: dry run");

  const pool = new Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<Candidate>(CANDIDATES_SQL, [
      MESSAGE_LEVEL_SUB_TYPES,
    ]);

    const perOrg = new Map<string, number>();
    for (const row of rows) {
      perOrg.set(
        row.organization_id,
        (perOrg.get(row.organization_id) ?? 0) + 1
      );
    }

    // Counts only: no addresses, no names.
    for (const [orgId, n] of [...perOrg.entries()].sort()) {
      console.log(`  ${orgId}: ${n}`);
    }
    console.log(
      `Candidates: ${rows.length} across ${perOrg.size} organizations`
    );

    if (!APPLY) {
      console.log("Dry run only. Re-run with --apply to write.");
      return;
    }

    let updated = 0;
    for (const row of rows) {
      const result = await pool.query(UPDATE_SQL, [
        row.contact_id,
        row.organization_id,
        row.bounced_at,
      ]);
      updated += result.rowCount ?? 0;
    }
    console.log(
      `Updated ${updated} of ${rows.length} candidates (the rest changed since the scan).`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
