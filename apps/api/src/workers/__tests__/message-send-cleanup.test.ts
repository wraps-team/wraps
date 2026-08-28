/**
 * Message Send / Contact Event Retention Worker Tests
 *
 * Integration tests using a real database (this worktree's per-branch Neon
 * test DB — see scripts/test-db/resolve-branch.mjs). Verifies plan-based
 * retention windows for message_send, the grace-month warning notification,
 * expired contact_event cleanup, and the DRY_RUN safety guard.
 *
 * DRY_RUN is a module-level constant read once at import time, so it cannot
 * be toggled per test the way a normal argument could. Tests that need a
 * specific value reset the module registry and dynamically re-import the
 * handler with RETENTION_DRY_RUN set first — the same pattern used in
 * apps/api/src/services/__tests__/workflow-queue.test.ts.
 */

import {
  awsAccount,
  contact,
  contactEvent,
  db,
  member,
  messageSend,
  notification,
  organization,
  subscription,
  user,
} from "@wraps/db";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_PREFIX = `msg-cleanup-${Date.now()}`;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ─── Tracked ids for teardown ──────────────────────────────────────────────

const orgIds: string[] = [];
const userIds: string[] = [];
const memberIds: string[] = [];
const awsAccountIds: string[] = [];
const subscriptionIds: string[] = [];
const messageSendIds: string[] = [];
const contactIds: string[] = [];
const contactEventIds: string[] = [];

// ─── Fixture builders ───────────────────────────────────────────────────────

async function createUser(key: string): Promise<string> {
  const id = `${TEST_PREFIX}-user-${key}`;
  await db
    .insert(user)
    .values({
      id,
      email: `${id}@example.com`,
      name: `Retention Test User ${key}`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      twoFactorEnabled: false,
      stripeCustomerId: null,
    } as typeof user.$inferInsert)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  userIds.push(id);
  return id;
}

type OrgSpec = {
  key: string;
  plan?: string;
  status?: string;
  periodEnd?: Date | null;
  skipSubscription?: boolean;
  /** Extra members (userId, role) beyond the default owner. */
  extraMembers?: { userId: string; role: string }[];
};

async function createOrg(
  spec: OrgSpec
): Promise<{ orgId: string; awsAccountId: string; ownerUserId: string }> {
  const orgId = `${TEST_PREFIX}-org-${spec.key}`;
  const accountId = `${TEST_PREFIX}-aws-${spec.key}`;
  const ownerUserId = await createUser(`${spec.key}-owner`);

  await db
    .insert(organization)
    .values({
      id: orgId,
      name: `Retention Org ${spec.key}`,
      slug: orgId,
      createdAt: new Date(),
      logo: null,
      metadata: null,
    } as typeof organization.$inferInsert)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: `Retention Org ${spec.key}` },
    });
  orgIds.push(orgId);

  const ownerMemberId = `${TEST_PREFIX}-member-${spec.key}-owner`;
  await db
    .insert(member)
    .values({
      id: ownerMemberId,
      organizationId: orgId,
      userId: ownerUserId,
      role: "owner",
      createdAt: new Date(),
    } as typeof member.$inferInsert)
    .onConflictDoUpdate({ target: member.id, set: { role: "owner" } });
  memberIds.push(ownerMemberId);

  for (const extra of spec.extraMembers ?? []) {
    const extraMemberId = `${TEST_PREFIX}-member-${spec.key}-${extra.userId}`;
    await db
      .insert(member)
      .values({
        id: extraMemberId,
        organizationId: orgId,
        userId: extra.userId,
        role: extra.role,
        createdAt: new Date(),
      } as typeof member.$inferInsert)
      .onConflictDoUpdate({ target: member.id, set: { role: extra.role } });
    memberIds.push(extraMemberId);
  }

  const accountNumber = accountId
    .split("")
    .reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_000_000_000, 7)
    .toString()
    .padStart(12, "0");

  await db
    .insert(awsAccount)
    .values({
      id: accountId,
      organizationId: orgId,
      name: "Retention Test AWS",
      accountId: accountNumber,
      region: "us-east-1",
      roleArn: `arn:aws:iam::${accountNumber}:role/wraps`,
      externalId: `${TEST_PREFIX}-ext-${spec.key}`,
      webhookSecret: "secret",
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as typeof awsAccount.$inferInsert)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { name: "Retention Test AWS" },
    });
  awsAccountIds.push(accountId);

  if (!spec.skipSubscription) {
    const subId = `${TEST_PREFIX}-sub-${spec.key}`;
    await db
      .insert(subscription)
      .values({
        id: subId,
        plan: spec.plan ?? "free",
        referenceId: orgId,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        status: spec.status ?? "active",
        periodStart: null,
        periodEnd: spec.periodEnd ?? null,
        cancelAtPeriodEnd: null,
        seats: null,
        trialStart: null,
        trialEnd: null,
        annual: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as typeof subscription.$inferInsert)
      .onConflictDoUpdate({
        target: subscription.id,
        set: {
          plan: spec.plan ?? "free",
          status: spec.status ?? "active",
          periodEnd: spec.periodEnd ?? null,
        },
      });
    subscriptionIds.push(subId);
  }

  return { orgId, awsAccountId: accountId, ownerUserId };
}

let sendCounter = 0;

async function insertSend(
  orgId: string,
  awsAccountId: string,
  createdAt: Date
): Promise<string> {
  sendCounter += 1;
  const id = `${TEST_PREFIX}-send-${sendCounter}`;
  await db.insert(messageSend).values({
    id,
    organizationId: orgId,
    awsAccountId,
    contactId: null,
    channel: "email",
    sourceType: "workflow",
    recipient: "test@example.com",
    messageId: `${id}-msg`,
    status: "sent",
    sentAt: createdAt,
    createdAt,
  } as typeof messageSend.$inferInsert);
  messageSendIds.push(id);
  return id;
}

async function insertContact(orgId: string, key: string): Promise<string> {
  const id = `${TEST_PREFIX}-contact-${key}`;
  await db
    .insert(contact)
    .values({
      id,
      organizationId: orgId,
      email: `${id}@example.com`,
      emailStatus: "active",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as typeof contact.$inferInsert)
    .onConflictDoUpdate({ target: contact.id, set: { updatedAt: new Date() } });
  contactIds.push(id);
  return id;
}

async function insertContactEvent(
  orgId: string,
  contactId: string,
  key: string,
  expiresAt: Date | null
): Promise<string> {
  const id = `${TEST_PREFIX}-event-${key}`;
  await db.insert(contactEvent).values({
    id,
    contactId,
    organizationId: orgId,
    eventName: "test.event",
    createdAt: new Date(),
    expiresAt,
  } as typeof contactEvent.$inferInsert);
  contactEventIds.push(id);
  return id;
}

async function messageSendExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: messageSend.id })
    .from(messageSend)
    .where(eq(messageSend.id, id));
  return rows.length > 0;
}

async function contactEventExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: contactEvent.id })
    .from(contactEvent)
    .where(eq(contactEvent.id, id));
  return rows.length > 0;
}

async function notificationsForOrg(
  organizationId: string,
  type: string
): Promise<(typeof notification.$inferSelect)[]> {
  return db
    .select()
    .from(notification)
    .where(
      and(
        eq(notification.organizationId, organizationId),
        eq(notification.type, type)
      )
    );
}

/**
 * Import the handler with a specific RETENTION_DRY_RUN value. DRY_RUN is
 * computed once at module load, so each distinct value needs a fresh module
 * registry.
 */
async function importHandler(dryRun: boolean) {
  vi.resetModules();
  if (dryRun) {
    process.env.RETENTION_DRY_RUN = "true";
  } else {
    process.env.RETENTION_DRY_RUN = "false";
  }
  const mod = await import("../message-send-cleanup");
  return mod.handler;
}

// ─── Teardown ────────────────────────────────────────────────────────────────

afterAll(async () => {
  delete process.env.RETENTION_DRY_RUN;

  if (contactEventIds.length > 0) {
    await db
      .delete(contactEvent)
      .where(inArray(contactEvent.id, contactEventIds));
  }
  if (messageSendIds.length > 0) {
    await db.delete(messageSend).where(inArray(messageSend.id, messageSendIds));
  }
  if (contactIds.length > 0) {
    await db.delete(contact).where(inArray(contact.id, contactIds));
  }
  if (orgIds.length > 0) {
    await db
      .delete(notification)
      .where(inArray(notification.organizationId, orgIds));
  }
  if (subscriptionIds.length > 0) {
    await db
      .delete(subscription)
      .where(inArray(subscription.id, subscriptionIds));
  }
  if (awsAccountIds.length > 0) {
    await db.delete(awsAccount).where(inArray(awsAccount.id, awsAccountIds));
  }
  if (memberIds.length > 0) {
    await db.delete(member).where(inArray(member.id, memberIds));
  }
  if (orgIds.length > 0) {
    await db.delete(organization).where(inArray(organization.id, orgIds));
  }
  if (userIds.length > 0) {
    await db.delete(user).where(inArray(user.id, userIds));
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("message-send-cleanup handler — deletion (RETENTION_DRY_RUN=false)", () => {
  let handler: Awaited<ReturnType<typeof importHandler>>;

  beforeAll(async () => {
    // One reset+import for the whole describe block — DRY_RUN is a
    // module-level constant, and re-importing per test would open a fresh
    // @wraps/db connection pool for every single case.
    handler = await importHandler(false);
  });

  it("free org: deletes rows older than 60 days, keeps rows at 45 days", async () => {
    const { orgId, awsAccountId } = await createOrg({
      key: "free",
      plan: "free",
      status: "active",
    });
    const oldId = await insertSend(orgId, awsAccountId, daysAgo(70));
    const graceId = await insertSend(orgId, awsAccountId, daysAgo(45));

    await handler({} as never, {} as never, () => {});

    expect(await messageSendExists(oldId)).toBe(false);
    expect(await messageSendExists(graceId)).toBe(true);
  });

  it("pro org: deletes rows older than 120 days, keeps a row at 100 days", async () => {
    const { orgId, awsAccountId } = await createOrg({
      key: "pro",
      plan: "pro",
      status: "active",
    });
    const oldId = await insertSend(orgId, awsAccountId, daysAgo(130));
    const keptId = await insertSend(orgId, awsAccountId, daysAgo(100));

    await handler({} as never, {} as never, () => {});

    expect(await messageSendExists(oldId)).toBe(false);
    expect(await messageSendExists(keptId)).toBe(true);
  });

  it("business org: deletes rows older than 395 days, keeps a row at 300 days", async () => {
    const { orgId, awsAccountId } = await createOrg({
      key: "business",
      plan: "business",
      status: "active",
    });
    const oldId = await insertSend(orgId, awsAccountId, daysAgo(400));
    const keptId = await insertSend(orgId, awsAccountId, daysAgo(300));

    await handler({} as never, {} as never, () => {});

    expect(await messageSendExists(oldId)).toBe(false);
    expect(await messageSendExists(keptId)).toBe(true);
  });

  it("legacy starter maps to the pro window (120 days)", async () => {
    const { orgId, awsAccountId } = await createOrg({
      key: "starter",
      plan: "starter",
      status: "active",
    });
    const oldId = await insertSend(orgId, awsAccountId, daysAgo(130));
    const keptId = await insertSend(orgId, awsAccountId, daysAgo(100));

    await handler({} as never, {} as never, () => {});

    expect(await messageSendExists(oldId)).toBe(false);
    expect(await messageSendExists(keptId)).toBe(true);
  });

  it("legacy growth and scale map to the business window (395 days)", async () => {
    const growth = await createOrg({
      key: "growth",
      plan: "growth",
      status: "active",
    });
    const scale = await createOrg({
      key: "scale",
      plan: "scale",
      status: "active",
    });
    const growthOld = await insertSend(
      growth.orgId,
      growth.awsAccountId,
      daysAgo(400)
    );
    const growthKept = await insertSend(
      growth.orgId,
      growth.awsAccountId,
      daysAgo(300)
    );
    const scaleOld = await insertSend(
      scale.orgId,
      scale.awsAccountId,
      daysAgo(400)
    );
    const scaleKept = await insertSend(
      scale.orgId,
      scale.awsAccountId,
      daysAgo(300)
    );

    await handler({} as never, {} as never, () => {});

    expect(await messageSendExists(growthOld)).toBe(false);
    expect(await messageSendExists(growthKept)).toBe(true);
    expect(await messageSendExists(scaleOld)).toBe(false);
    expect(await messageSendExists(scaleKept)).toBe(true);
  });

  it("canceled 10 days ago keeps its old plan window, not free's", async () => {
    const { orgId, awsAccountId } = await createOrg({
      key: "canceled-recent",
      plan: "pro",
      status: "canceled",
      periodEnd: daysAgo(10),
    });
    // 70 days old: outside free's 60-day cutoff, inside pro's 120-day cutoff.
    // If the worker incorrectly dropped this org to free immediately on
    // cancellation, this row would be deleted.
    const keptId = await insertSend(orgId, awsAccountId, daysAgo(70));

    await handler({} as never, {} as never, () => {});

    expect(await messageSendExists(keptId)).toBe(true);
  });

  it("canceled 45 days ago drops to the free window", async () => {
    const { orgId, awsAccountId } = await createOrg({
      key: "canceled-old",
      plan: "pro",
      status: "canceled",
      periodEnd: daysAgo(45),
    });
    // 70 days old: inside pro's 120-day cutoff, outside free's 60-day cutoff.
    // Past the cancellation grace period, this org should behave like free.
    const deletedId = await insertSend(orgId, awsAccountId, daysAgo(70));

    await handler({} as never, {} as never, () => {});

    expect(await messageSendExists(deletedId)).toBe(false);
  });

  it("no subscription row is treated as free", async () => {
    const { orgId, awsAccountId } = await createOrg({
      key: "no-sub",
      skipSubscription: true,
    });
    const oldId = await insertSend(orgId, awsAccountId, daysAgo(70));
    const keptId = await insertSend(orgId, awsAccountId, daysAgo(45));

    await handler({} as never, {} as never, () => {});

    expect(await messageSendExists(oldId)).toBe(false);
    expect(await messageSendExists(keptId)).toBe(true);
  });

  it("batches deletion: 2,500 eligible rows delete in multiple paced batches, not one statement", async () => {
    const { orgId, awsAccountId } = await createOrg({
      key: "batching",
      plan: "free",
      status: "active",
    });

    // Bulk-insert in one round trip — 2,500 sequential single-row inserts
    // would blow the test timeout on a networked Neon branch.
    const ids: string[] = [];
    const rows: (typeof messageSend.$inferInsert)[] = [];
    for (let i = 0; i < 2500; i++) {
      sendCounter += 1;
      const id = `${TEST_PREFIX}-send-${sendCounter}`;
      ids.push(id);
      rows.push({
        id,
        organizationId: orgId,
        awsAccountId,
        contactId: null,
        channel: "email",
        sourceType: "workflow",
        recipient: "test@example.com",
        messageId: `${id}-msg`,
        status: "sent",
        sentAt: daysAgo(200 + i),
        createdAt: daysAgo(200 + i),
      } as typeof messageSend.$inferInsert);
    }
    await db.insert(messageSend).values(rows);
    messageSendIds.push(...ids);

    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    await handler({} as never, {} as never, () => {});
    const pauseCalls = setTimeoutSpy.mock.calls.filter(([, ms]) => ms === 100);
    setTimeoutSpy.mockRestore();

    // 2,500 rows at BATCH_SIZE=1000 is 3 batches (1000, 1000, 500), with a
    // BATCH_PAUSE_MS sleep after each non-final batch — 2 pauses. A single
    // unbatched DELETE would produce zero.
    expect(pauseCalls.length).toBeGreaterThanOrEqual(2);

    // One bulk existence check instead of 2,500 sequential round trips.
    const remaining = await db
      .select({ id: messageSend.id })
      .from(messageSend)
      .where(inArray(messageSend.id, ids));
    expect(remaining).toHaveLength(0);
  }, 60_000);

  it("contact_event: deletes rows past expires_at, keeps rows with a NULL expires_at", async () => {
    const { orgId } = await createOrg({
      key: "events",
      plan: "free",
      status: "active",
    });
    const contactId = await insertContact(orgId, "events");
    const expiredId = await insertContactEvent(
      orgId,
      contactId,
      "expired",
      daysAgo(1)
    );
    const futureId = await insertContactEvent(
      orgId,
      contactId,
      "future",
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
    );
    const nullExpiryId = await insertContactEvent(
      orgId,
      contactId,
      "null-expiry",
      null
    );

    await handler({} as never, {} as never, () => {});

    expect(await contactEventExists(expiredId)).toBe(false);
    expect(await contactEventExists(futureId)).toBe(true);
    expect(await contactEventExists(nullExpiryId)).toBe(true);
  });

  it("warns owner and admin roles, not member, and never claims 'your plan keeps'", async () => {
    const adminUserId = await createUser("warn-admin");
    const memberUserId = await createUser("warn-member");
    const { orgId, awsAccountId, ownerUserId } = await createOrg({
      key: "warn",
      plan: "free",
      status: "active",
      extraMembers: [
        { userId: adminUserId, role: "admin" },
        { userId: memberUserId, role: "member" },
      ],
    });
    // Inside the grace window: older than free's 30-day visible window, but
    // newer than the 60-day delete cutoff.
    await insertSend(orgId, awsAccountId, daysAgo(45));

    await handler({} as never, {} as never, () => {});

    const warnings = await notificationsForOrg(orgId, "retention.warning");
    const recipients = warnings.map((w) => w.userId).sort();
    expect(recipients).toEqual([adminUserId, ownerUserId].sort());
    expect(recipients).not.toContain(memberUserId);

    for (const w of warnings) {
      expect(w.body).not.toMatch(/your plan keeps/i);
    }
  });

  it("does not re-send a warning within 30 days of an existing one", async () => {
    const { orgId, awsAccountId, ownerUserId } = await createOrg({
      key: "warn-dedupe",
      plan: "free",
      status: "active",
    });
    await insertSend(orgId, awsAccountId, daysAgo(45));

    // Pre-seed a recent warning notification for this org.
    await db.insert(notification).values({
      id: `${TEST_PREFIX}-preexisting-warning`,
      userId: ownerUserId,
      organizationId: orgId,
      type: "retention.warning",
      title: "Some of your email history will be removed soon",
      body: "pre-existing warning",
      href: "/settings/billing",
      data: null,
      read: false,
      createdAt: daysAgo(5),
    } as typeof notification.$inferInsert);

    await handler({} as never, {} as never, () => {});

    const warnings = await notificationsForOrg(orgId, "retention.warning");
    // Only the pre-seeded one — the handler should have skipped sending another.
    expect(warnings).toHaveLength(1);
    expect(warnings[0].body).toBe("pre-existing warning");
  });
});

describe("message-send-cleanup handler — DRY_RUN safety guard", () => {
  let handler: Awaited<ReturnType<typeof importHandler>>;

  beforeAll(async () => {
    handler = await importHandler(true);
  });

  it("RETENTION_DRY_RUN=true deletes nothing, even for rows well past the cutoff", async () => {
    const { orgId, awsAccountId } = await createOrg({
      key: "dry-run",
      plan: "free",
      status: "active",
    });
    const wouldDeleteId = await insertSend(orgId, awsAccountId, daysAgo(200));

    await handler({} as never, {} as never, () => {});

    expect(await messageSendExists(wouldDeleteId)).toBe(true);
  });
});
