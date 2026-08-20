/**
 * Contact timeline and analytics (real DB).
 *
 * Audit findings F12 and F13:
 *  - F12: the timeline never referenced `contact_event.expires_at`, so events
 *    that had aged out were indistinguishable from a contact nothing ever
 *    happened to; and its three sources were capped at 50/20/50 before merging,
 *    so `hasMore` went false around 120 events however chatty the contact was.
 *  - F13: the analytics card never grouped by status, so there was no
 *    list-health number anywhere on the contacts surface.
 */

import {
  contact,
  contactEvent,
  db,
  member,
  organization,
  subscription,
  user,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getContactAnalytics, getContactTimeline } from "../contacts-analytics";

const PREFIX = "contacts-analytics-db";

const testUser = {
  id: `${PREFIX}-user-1`,
  email: `${PREFIX}@example.com`,
  name: "Analytics User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${PREFIX}-org-1`,
  name: "Analytics Org",
  slug: `${PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: `${PREFIX}-member-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testSubscription = {
  id: `${PREFIX}-sub-1`,
  plan: "scale",
  referenceId: testOrg.id,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** One contact per email status, so the breakdown has a distinct shape. */
const contacts = [
  { id: `${PREFIX}-c-active-1`, emailStatus: "active" as const },
  { id: `${PREFIX}-c-active-2`, emailStatus: "active" as const },
  { id: `${PREFIX}-c-active-3`, emailStatus: "active" as const },
  { id: `${PREFIX}-c-unsub`, emailStatus: "unsubscribed" as const },
  { id: `${PREFIX}-c-unsub-2`, emailStatus: "unsubscribed" as const },
  { id: `${PREFIX}-c-bounced`, emailStatus: "bounced" as const },
  { id: `${PREFIX}-c-complained`, emailStatus: "complained" as const },
  { id: `${PREFIX}-c-suppressed`, emailStatus: "suppressed" as const },
];

/** Contact with no email at all — SMS-only. */
const smsOnlyContact = { id: `${PREFIX}-c-smsonly`, emailStatus: null };

/** Contact whose custom events have all aged out past expires_at. */
const agedOutContact = { id: `${PREFIX}-c-agedout`, emailStatus: "active" };

/**
 * Contact with more events than MAX_SOURCE_ROWS, the per-source ceiling in
 * contacts-analytics.ts. This is the case that only the `sourceTruncated` flag
 * catches: deep enough into the history that `offset + limit + 1` clamps to the
 * ceiling, so the merged-length check alone reports "no more" while a row is
 * still unread.
 */
const deepHistoryContact = { id: `${PREFIX}-c-deep`, emailStatus: "active" };
const MAX_SOURCE_ROWS = 500;

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: testUser.id, email: testUser.email, name: testUser.name },
      })),
    },
  },
}));

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(organization)
    .values(testOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrg.name },
    });
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });
  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.insert(subscription).values(testSubscription);

  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));

  await db.insert(contact).values(
    contacts.map((c) => ({
      id: c.id,
      organizationId: testOrg.id,
      email: `${c.id}@example.com`,
      emailHash: c.id,
      emailStatus: c.emailStatus,
    }))
  );

  await db.insert(contact).values({
    id: smsOnlyContact.id,
    organizationId: testOrg.id,
    phone: "+15555550100",
    phoneHash: smsOnlyContact.id,
    smsStatus: "opted_in",
  });

  // Engagement counters say 12 emails went out, but no message_send row
  // survives to show them — the "history exists but can't be shown" case.
  await db.insert(contact).values({
    id: agedOutContact.id,
    organizationId: testOrg.id,
    email: `${agedOutContact.id}@example.com`,
    emailHash: agedOutContact.id,
    emailStatus: "active",
    emailsSent: 12,
  });

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.insert(contactEvent).values([
    {
      id: `${PREFIX}-ev-expired-1`,
      contactId: agedOutContact.id,
      organizationId: testOrg.id,
      eventName: "checkout.completed",
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      expiresAt: yesterday,
    },
    {
      id: `${PREFIX}-ev-expired-2`,
      contactId: agedOutContact.id,
      organizationId: testOrg.id,
      eventName: "checkout.completed",
      createdAt: new Date(Date.now() - 401 * 24 * 60 * 60 * 1000),
      expiresAt: yesterday,
    },
  ]);

  // A chatty contact: more custom events than the old fixed 50-row cap.
  await db.insert(contactEvent).values(
    Array.from({ length: 60 }, (_, i) => ({
      id: `${PREFIX}-ev-live-${i}`,
      contactId: contacts[0].id,
      organizationId: testOrg.id,
      eventName: `page.viewed.${i}`,
      createdAt: new Date(Date.now() - i * 60 * 1000),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }))
  );

  await db.insert(contact).values({
    id: deepHistoryContact.id,
    organizationId: testOrg.id,
    email: `${deepHistoryContact.id}@example.com`,
    emailHash: deepHistoryContact.id,
    emailStatus: "active",
  });

  // One row past the per-source ceiling, so the last page is unreachable
  // unless truncation is actually detected.
  await db.insert(contactEvent).values(
    Array.from({ length: MAX_SOURCE_ROWS + 1 }, (_, i) => ({
      id: `${PREFIX}-ev-deep-${i}`,
      contactId: deepHistoryContact.id,
      organizationId: testOrg.id,
      eventName: `deep.event.${i}`,
      createdAt: new Date(Date.now() - i * 60 * 1000),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }))
  );
});

afterAll(async () => {
  await db
    .delete(contactEvent)
    .where(eq(contactEvent.organizationId, testOrg.id));
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("getContactAnalytics — list health (F13)", () => {
  it("groups contacts by email status", async () => {
    const result = await getContactAnalytics(testOrg.id);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    // 3 seeded active, plus the aged-out and deep-history contacts.
    expect(result.analytics.listHealth).toEqual({
      active: 5,
      unsubscribed: 2,
      bounced: 1,
      complained: 1,
      suppressed: 1,
      noEmailStatus: 1,
    });
  });

  it("accounts for every contact the total reports", async () => {
    const result = await getContactAnalytics(testOrg.id);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    const health = result.analytics.listHealth;
    const summed =
      health.active +
      health.unsubscribed +
      health.bounced +
      health.complained +
      health.suppressed +
      health.noEmailStatus;

    expect(summed).toBe(result.analytics.totalContacts);
  });
});

describe("getContactTimeline — aged-out events (F12)", () => {
  it("counts expired events instead of rendering nothing at all", async () => {
    const result = await getContactTimeline(agedOutContact.id, testOrg.id);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.history.agedOutEvents).toBe(2);
    expect(result.history.hasUnshowableHistory).toBe(true);
    expect(result.history.recordedEmailsSent).toBe(12);

    // The expired events are not presented as live history.
    expect(result.events.filter((e) => e.type === "custom_event")).toHaveLength(
      0
    );
  });

  it("does not claim unshowable history for a genuinely quiet contact", async () => {
    const result = await getContactTimeline(contacts[3].id, testOrg.id);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.history.agedOutEvents).toBe(0);
    expect(result.history.hasUnshowableHistory).toBe(false);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("contact_created");
  });
});

describe("getContactTimeline — pagination past the old ceiling (F12)", () => {
  it("keeps hasMore true while events remain", async () => {
    const result = await getContactTimeline(contacts[0].id, testOrg.id, {
      limit: 20,
      offset: 0,
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.events).toHaveLength(20);
    expect(result.hasMore).toBe(true);
  });

  it("reaches events past the source's old 50-row cap", async () => {
    const result = await getContactTimeline(contacts[0].id, testOrg.id, {
      limit: 20,
      offset: 50,
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    // 60 custom events + 1 contact_created = 61 total; offset 50 leaves 11.
    // Under the old fixed 50-row source cap these rows were unreachable.
    expect(result.events).toHaveLength(11);
    expect(result.hasMore).toBe(false);
    expect(result.events.every((e) => e.type === "custom_event")).toBe(true);
    // The oldest seeded event is page.viewed.59, 59 minutes back.
    expect(result.events.at(-1)?.eventName).toBe("page.viewed.59");
  });

  it("still reports more when a source hit its own ceiling", async () => {
    // 501 events + 1 contact_created. At offset 490 the requested depth
    // (490 + 20 + 1 = 511) clamps to the 500-row source ceiling, so the merged
    // list holds 501 events — which is NOT greater than offset + limit (510).
    // The length comparison alone therefore says "no more" while an event is
    // still unread; only the truncation flag keeps the button alive.
    const result = await getContactTimeline(deepHistoryContact.id, testOrg.id, {
      limit: 20,
      offset: 490,
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.length).toBeLessThan(20);
    expect(result.hasMore).toBe(true);
  });

  it("walks the whole history without a gap or a repeat", async () => {
    const seen: string[] = [];
    for (let offset = 0; offset < 100; offset += 20) {
      const page = await getContactTimeline(contacts[0].id, testOrg.id, {
        limit: 20,
        offset,
      });
      if (!page.success) {
        throw new Error(page.error);
      }
      seen.push(...page.events.map((e) => e.id));
      if (!page.hasMore) {
        break;
      }
    }

    expect(seen).toHaveLength(61);
    expect(new Set(seen).size).toBe(61);
  });
});
