/**
 * Unsubscribing, end to end (real database, real route).
 *
 * Every broadcast to all contacts carries a global one-click unsubscribe (see
 * batch-sender-unsubscribe-topic.test.ts for the payload). This is the other
 * half: using that link actually removes the contact, and the next broadcast to
 * all contacts neither counts nor selects them. Free orgs can now broadcast to
 * all contacts, so this is the guarantee that sending is always opt-out-able.
 *
 * File suffix `-db.test.ts` = real test database.
 */

import { contact, countBroadcastRecipients, db, eq } from "@wraps/db";
import { inArray } from "drizzle-orm";
import { Elysia } from "elysia";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { generateUnsubscribeToken } from "../lib/unsubscribe-token";
import { unsubscribeRoutes } from "../routes/unsubscribe";
import { getContactsChunk } from "../workers/batch-sender";

const PREFIX = `unsub-${crypto.randomUUID().slice(0, 8)}`;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
let aliceId: string;
let bobId: string;

const app = new Elysia().use(unsubscribeRoutes);

async function addContact(name: string) {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(contact).values({
    id,
    organizationId: ids.org,
    email: `${PREFIX}-${name}@example.com`,
    emailHash: `${PREFIX}-${name}-hash`,
    emailStatus: "active",
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function oneClick(token: string) {
  return app.handle(
    new Request(`http://localhost/unsubscribe/${token}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    })
  );
}

async function allContactsAudience() {
  const chunk = await getContactsChunk(ids.org, "email", 1000, {
    audienceType: "all",
  });
  return chunk.map((c) => c.id);
}

async function statusOf(id: string) {
  const [row] = await db
    .select({ status: contact.emailStatus })
    .from(contact)
    .where(eq(contact.id, id));
  return row?.status;
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
});

beforeEach(async () => {
  // This file owns its contacts: clear the fixture's and start from two.
  await db.delete(contact).where(eq(contact.organizationId, ids.org));
  aliceId = await addContact("alice");
  bobId = await addContact("bob");
});

afterAll(async () => {
  await db.delete(contact).where(inArray(contact.id, [aliceId, bobId]));
  await cleanupBaseOrg(PREFIX);
});

describe("one-click unsubscribe from an all-contacts broadcast", () => {
  it("both contacts are in the all-contacts audience to begin with", async () => {
    expect((await allContactsAudience()).sort()).toEqual(
      [aliceId, bobId].sort()
    );
    expect(
      await countBroadcastRecipients(ids.org, "email", { audienceType: "all" })
    ).toBe(2);
  });

  it("the link the sender builds unsubscribes the contact (200, no redirect)", async () => {
    // Same call the sender makes for an all-contacts broadcast: no topic.
    const token = await generateUnsubscribeToken(aliceId, ids.org);

    const res = await oneClick(token);

    expect(res.status).toBe(200);
    expect(await statusOf(aliceId)).toBe("unsubscribed");
    expect(await statusOf(bobId)).toBe("active");
  });

  it("the next all-contacts broadcast neither counts nor selects them", async () => {
    await oneClick(await generateUnsubscribeToken(aliceId, ids.org));

    expect(await allContactsAudience()).toEqual([bobId]);
    expect(
      await countBroadcastRecipients(ids.org, "email", { audienceType: "all" })
    ).toBe(1);
  });

  it("the count a user previews is the number the send selects", async () => {
    await oneClick(await generateUnsubscribeToken(bobId, ids.org));

    const counted = await countBroadcastRecipients(ids.org, "email", {
      audienceType: "all",
    });
    expect(counted).toBe((await allContactsAudience()).length);
  });

  it("unsubscribing twice is harmless", async () => {
    const token = await generateUnsubscribeToken(aliceId, ids.org);

    expect((await oneClick(token)).status).toBe(200);
    expect((await oneClick(token)).status).toBe(200);
    expect(await statusOf(aliceId)).toBe("unsubscribed");
  });

  it("a tampered or invalid token is rejected and changes nothing", async () => {
    const token = await generateUnsubscribeToken(aliceId, ids.org);

    const res = await oneClick(`${token}x`);

    expect(res.status).toBe(400);
    expect(await statusOf(aliceId)).toBe("active");
    expect(await allContactsAudience()).toContain(aliceId);
  });

  it("a token for one org cannot unsubscribe a contact in another", async () => {
    const token = await generateUnsubscribeToken(aliceId, ids.otherOrg);

    await oneClick(token);

    expect(await statusOf(aliceId)).toBe("active");
  });
});
