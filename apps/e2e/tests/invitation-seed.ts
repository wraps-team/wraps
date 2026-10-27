import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import pg from "pg";

// The dashboard under test runs against the dev database, so the invitation is
// written straight to it rather than through "invite member", which would also
// send a real email.
const databaseUrl = parseEnv(
  readFileSync("../web/.env.local", "utf8")
).DATABASE_URL;

export type SeededInvitation = {
  id: string;
  email: string;
  orgName: string;
  orgSlug: string;
};

/**
 * An org with an owner and one pending admin invitation. `inviteeHasAccount`
 * adds a bare user row for the invitee, which is all `getInvitation` looks at
 * to tell a returning invitee from a new one.
 */
export async function seedInvitation({
  inviteeHasAccount,
}: {
  inviteeHasAccount: boolean;
}) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL missing from apps/web/.env.local");
  }

  const runId = randomUUID().slice(0, 8);
  const ownerId = randomUUID();
  const orgId = randomUUID();
  const invitation: SeededInvitation = {
    id: randomUUID(),
    email: `invitee+${runId}@e2e.wraps.test`,
    orgName: `E2E Invite Org ${runId}`,
    orgSlug: `e2e-invite-${runId}`,
  };
  const ownerEmail = `inviter+${runId}@e2e.wraps.test`;

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `insert into "user" (id, name, email, email_verified, created_at, updated_at)
       values ($1, 'E2E Inviter', $2, true, now(), now())`,
      [ownerId, ownerEmail]
    );
    await client.query(
      `insert into organization (id, name, slug, created_at)
       values ($1, $2, $3, now())`,
      [orgId, invitation.orgName, invitation.orgSlug]
    );
    await client.query(
      `insert into member (id, organization_id, user_id, role, created_at)
       values ($1, $2, $3, 'owner', now())`,
      [randomUUID(), orgId, ownerId]
    );
    await client.query(
      `insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id)
       values ($1, $2, $3, 'admin', 'pending', now() + interval '7 days', $4)`,
      [invitation.id, orgId, invitation.email, ownerId]
    );
    if (inviteeHasAccount) {
      await client.query(
        `insert into "user" (id, name, email, email_verified, created_at, updated_at)
         values ($1, 'E2E Invitee', $2, true, now(), now())`,
        [randomUUID(), invitation.email]
      );
    }
  } finally {
    await client.end();
  }

  return {
    invitation,
    // Deleting the org cascades to members and invitations; the users go by
    // email, which also catches the invitee account a test signs up.
    async cleanup() {
      const db = new pg.Client({ connectionString: databaseUrl });
      await db.connect();
      try {
        await db.query("delete from organization where id = $1", [orgId]);
        await db.query(`delete from "user" where email = any($1)`, [
          [ownerEmail, invitation.email],
        ]);
      } finally {
        await db.end();
      }
    },
  };
}
