/**
 * getContactAnalytics — period window boundaries (real DB).
 *
 * Audit finding H7: `startStr` was `today - days` while both the
 * `newContactsThisPeriod` count and the `dailyGrowth` gap-fill walk are
 * inclusive of both endpoints, so `days = 30` produced a 31-day current window
 * and a chart with 31 points. The previous-period query is half-open and stayed
 * exactly 30 days, so `growthPercent` divided a 31-day count by a 30-day one
 * and overstated growth by roughly one day of signups.
 *
 * The fixture seeds exactly one contact per day for 60 consecutive days, which
 * makes the mismatch arithmetic instead of a judgement call: with equal windows
 * growth is exactly 0%, and with a 31-vs-30 window it is +3.3%.
 */

import {
  contact,
  db,
  member,
  organization,
  subscription,
  user,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getContactAnalytics } from "../contacts-analytics";

const PREFIX = "analytics-window-db";

/** Days of history seeded, one contact each: covers two 30-day windows. */
const SEEDED_DAYS = 60;

const testUser = {
  id: `${PREFIX}-user-1`,
  email: `${PREFIX}@example.com`,
  name: "Window User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${PREFIX}-org-1`,
  name: "Window Org",
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

/** UTC midday `n` days back — the analytics run below is asked for UTC. */
function daysAgoUtc(n: number): Date {
  const today = new Date();
  return new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - n,
      12
    )
  );
}

/** The YYYY-MM-DD label the chart uses for the day `n` days back. */
function dayLabel(n: number): string {
  return daysAgoUtc(n).toISOString().split("T")[0];
}

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

  // Exactly one contact per day, today (day 0) back through day 59.
  await db.insert(contact).values(
    Array.from({ length: SEEDED_DAYS }, (_, i) => ({
      id: `${PREFIX}-c-${i}`,
      organizationId: testOrg.id,
      email: `${PREFIX}-c-${i}@example.com`,
      emailHash: `${PREFIX}-c-${i}`,
      emailStatus: "active" as const,
      createdAt: daysAgoUtc(i),
    }))
  );
});

afterAll(async () => {
  await db.delete(contact).where(eq(contact.organizationId, testOrg.id));
  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("getContactAnalytics — window length (H7)", () => {
  for (const days of [7, 30] as const) {
    it(`returns exactly ${days} chart points for days=${days}`, async () => {
      const result = await getContactAnalytics(testOrg.id, days, "UTC");
      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }

      const { dailyGrowth } = result.analytics;

      // The defect: `today - days` through today inclusive is days + 1 points.
      expect(dailyGrowth).toHaveLength(days);
      expect(dailyGrowth.at(0)?.date).toBe(dayLabel(days - 1));
      expect(dailyGrowth.at(-1)?.date).toBe(dayLabel(0));

      // One seeded contact per day, so every point in the window is 1 — no
      // leading zero-day smuggled in by an off-by-one start boundary.
      expect(dailyGrowth.map((p) => p.count)).toEqual(
        Array.from({ length: days }, () => 1)
      );
    });

    it(`counts ${days} new contacts and matches the chart for days=${days}`, async () => {
      const result = await getContactAnalytics(testOrg.id, days, "UTC");
      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }

      const { newContactsThisPeriod, dailyGrowth } = result.analytics;

      // With one signup per day, the count IS the window length.
      expect(newContactsThisPeriod).toBe(days);
      expect(dailyGrowth.reduce((sum, p) => sum + p.count, 0)).toBe(
        newContactsThisPeriod
      );
    });

    it(`compares equal spans for days=${days}`, async () => {
      const result = await getContactAnalytics(testOrg.id, days, "UTC");
      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }

      // One signup per day across both windows: equal spans mean equal counts
      // mean 0% growth. A days+1 current window against a days previous one
      // reports +3.3% (30d) or +14.3% (7d) from an entirely flat trend.
      expect(result.analytics.growthPercent).toBe(0);
    });
  }

  it("excludes the day immediately before the window", async () => {
    const result = await getContactAnalytics(testOrg.id, 30, "UTC");
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    const dates = result.analytics.dailyGrowth.map((p) => p.date);
    // day 30 back is the old (broken) start boundary — it belongs to the
    // previous period now, and to it alone.
    expect(dates).not.toContain(dayLabel(30));
    expect(dates).toContain(dayLabel(29));
  });
});
