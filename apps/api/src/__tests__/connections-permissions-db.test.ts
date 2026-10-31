/**
 * POST /v1/connections and DELETE /v1/connections/:id on the real route stack:
 * real DB, real permission gate.
 *
 * Sessions need awsAccounts write. API keys are deliberately not scope-checked
 * (`keyScopes: []`), because `wraps platform connect` / `disconnect` in CI
 * authenticate with WRAPS_API_KEY. The key tests below document that exception.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 */

import { awsAccount, db, eq, member, user } from "@wraps/db";
import { and } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { READ_ONLY_PERMISSIONS } from "../services/api-keys";
import { createErrorHarness } from "./error-handler-harness";

const { connectionsRoutes } = await import("../routes/connections");

const PREFIX = "connections-perm";
const READ_ONLY_USER = `${PREFIX}-ro-user`;
const READ_ONLY_MEMBER = `${PREFIX}-ro-member`;
const READ_ONLY_EMAIL = `${PREFIX}-ro@example.com`;
// A 12-digit account that is NOT seeded, so a POST for it is a create.
const NEW_ACCOUNT_ID = "210987654321";

const PERMISSION_DENIED = "You don't have permission to perform this action";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
let accountNumber: string;
let secret: string;

type Auth = {
  apiKeyId: string | null;
  organizationId: string;
  userId: string | null;
  planId: string;
  apiKeyScopes?: string[];
};

function appFor(auth: Auth) {
  const { app } = createErrorHarness();
  return app.derive(() => ({ auth })).use(connectionsRoutes);
}

const asOwner = () =>
  appFor({
    apiKeyId: null,
    organizationId: ids.org,
    userId: ids.user,
    planId: "pro",
  });

const asReadOnly = () =>
  appFor({
    apiKeyId: null,
    organizationId: ids.org,
    userId: READ_ONLY_USER,
    planId: "pro",
  });

// Mirrors a key created with the read-only preset. Keys are NOT scope-checked
// on these routes, so this key is expected to pass.
const asReadOnlyKey = () =>
  appFor({
    apiKeyId: "key-connections-ro",
    organizationId: ids.org,
    userId: ids.user,
    planId: "pro",
    apiKeyScopes: READ_ONLY_PERMISSIONS,
  });

async function postConnection(
  app: { handle: (r: Request) => Promise<Response> },
  accountId: string
) {
  const res = await app.handle(
    new Request("http://localhost/v1/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, region: "us-east-1" }),
    })
  );
  return { status: res.status, body: await res.json() };
}

async function deleteConnection(
  app: { handle: (r: Request) => Promise<Response> },
  id: string
) {
  const res = await app.handle(
    new Request(`http://localhost/v1/connections/${id}`, { method: "DELETE" })
  );
  return { status: res.status, body: await res.json() };
}

async function readAccount(id: string) {
  return db.query.awsAccount.findFirst({
    where: eq(awsAccount.id, id),
    columns: { webhookSecret: true },
  });
}

async function accountsWithNumber(accountId: string) {
  return db
    .select({ id: awsAccount.id })
    .from(awsAccount)
    .where(
      and(
        eq(awsAccount.organizationId, ids.org),
        eq(awsAccount.accountId, accountId)
      )
    );
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
  accountNumber = fixture.accountNumber;
  secret = fixture.secret;

  await db
    .insert(user)
    .values({
      id: READ_ONLY_USER,
      email: READ_ONLY_EMAIL,
      name: "Read Only Connections Tester",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    } as typeof user.$inferInsert)
    .onConflictDoNothing();
  await db.insert(member).values({
    id: READ_ONLY_MEMBER,
    organizationId: ids.org,
    userId: READ_ONLY_USER,
    role: "read-only",
    createdAt: new Date(),
  });
});

beforeEach(async () => {
  // Each test starts from the seeded secret and without any created account.
  await db
    .update(awsAccount)
    .set({ webhookSecret: secret })
    .where(eq(awsAccount.id, ids.awsAccount));
  await db.delete(awsAccount).where(eq(awsAccount.accountId, NEW_ACCOUNT_ID));
});

afterAll(async () => {
  await db.delete(awsAccount).where(eq(awsAccount.accountId, NEW_ACCOUNT_ID));
  await db.delete(member).where(eq(member.id, READ_ONLY_MEMBER));
  await db.delete(user).where(eq(user.id, READ_ONLY_USER));
  await cleanupBaseOrg(PREFIX);
});

describe("POST /v1/connections — awsAccounts write gate", () => {
  it("a read-only member is 403 and no account row is created", async () => {
    const res = await postConnection(asReadOnly(), NEW_ACCOUNT_ID);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    expect(await accountsWithNumber(NEW_ACCOUNT_ID)).toHaveLength(0);
  });

  it("an owner passes the gate (upsert of the seeded account)", async () => {
    const res = await postConnection(asOwner(), accountNumber);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it("a read-only-scoped API key passes the gate (deliberate exception)", async () => {
    // CI runs `wraps platform connect` with WRAPS_API_KEY. Keys are not
    // scope-checked here (keyScopes: []); a dedicated scope is a follow-up.
    const res = await postConnection(asReadOnlyKey(), accountNumber);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe("DELETE /v1/connections/:id — awsAccounts write gate", () => {
  it("a read-only member is 403 and the webhook secret survives", async () => {
    const res = await deleteConnection(asReadOnly(), ids.awsAccount);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: PERMISSION_DENIED });
    const row = await readAccount(ids.awsAccount);
    expect(row?.webhookSecret).toBe(secret);
  });

  it("an owner passes the gate and the webhook secret is cleared", async () => {
    const res = await deleteConnection(asOwner(), ids.awsAccount);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const row = await readAccount(ids.awsAccount);
    expect(row?.webhookSecret).toBeNull();
  });

  it("a read-only-scoped API key passes the gate (deliberate exception)", async () => {
    // `wraps platform disconnect` in CI with WRAPS_API_KEY keeps working.
    const res = await deleteConnection(asReadOnlyKey(), ids.awsAccount);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const row = await readAccount(ids.awsAccount);
    expect(row?.webhookSecret).toBeNull();
  });
});
