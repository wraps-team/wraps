// DB-backed. NOT RUN in the drill-down worktree: apps/web/.env.test does not
// exist there yet. Spec section 8.5. The clock is pinned so every route's
// `new Date()` agrees. Expected values are counted independently from the
// seeded rows, not read back from the routes under test.
import {
  awsAccount,
  batchSend,
  db,
  messageSend,
  organization,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as bouncesRoute from "../[orgSlug]/analytics/bounces/route";
import * as complaintsRoute from "../[orgSlug]/analytics/complaints/route";
import * as sendsRoute from "../[orgSlug]/analytics/drilldown/sends/route";
import * as suppressionRoute from "../[orgSlug]/analytics/suppression/route";

const suffix = crypto.randomUUID().slice(0, 8);
const ORG = `recon-db-org-${suffix}`;
const ACCOUNT = `recon-db-acct-${suffix}`;
const BROADCAST_A = `recon-db-batch-a-${suffix}`;
const BROADCAST_B = `recon-db-batch-b-${suffix}`;

const NOW = new Date("2026-10-28T12:00:00.000Z");
const TZ = "America/New_York";
const DAYS = 14;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: "user-recon-db",
          email: "recon@example.com",
          name: "Recon",
        },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async () => ({
    id: ORG,
    name: "Recon DB Org",
    slug: "recon",
  })),
}));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

type Seeded = typeof messageSend.$inferInsert;
const seeded: Seeded[] = [];

// Seed: 14 days, one cluster per day. Each cluster mixes every outcome so each
// count is non-trivial: sent, failed, permanent, transient, undetermined,
// complained, and Suppressed-subtype rows.
function seedSpread() {
  for (let i = 0; i < DAYS; i += 1) {
    const base = new Date(NOW.getTime() - i * DAY - 3 * HOUR);
    const batchSendId = i % 2 === 0 ? BROADCAST_A : BROADCAST_B;
    const common = {
      organizationId: ORG,
      awsAccountId: ACCOUNT,
      batchSendId,
      sourceType: "batch" as const,
      channel: "email" as const,
      recipient: "reader@example.com",
      from: i % 2 === 0 ? "news@a.example" : "news@b.example",
    };
    for (let k = 0; k < 5; k += 1) {
      seeded.push({
        ...common,
        id: `recon-${suffix}-${i}-ok-${k}`,
        status: "delivered",
        sentAt: new Date(base.getTime() - k * 10 * 60_000),
      });
    }
    if (i % 2 === 0) {
      seeded.push({
        ...common,
        id: `recon-${suffix}-${i}-failed`,
        status: "failed",
        sentAt: new Date(base.getTime() - 50 * 60_000),
      });
    }
    if (i % 3 === 0) {
      seeded.push({
        ...common,
        id: `recon-${suffix}-${i}-permanent`,
        status: "bounced",
        sentAt: base,
        bouncedAt: new Date(base.getTime() + HOUR),
        bounceType: "Permanent",
      });
    }
    if (i % 4 === 1) {
      seeded.push({
        ...common,
        id: `recon-${suffix}-${i}-transient`,
        status: "bounced",
        sentAt: base,
        bouncedAt: new Date(base.getTime() + HOUR),
        bounceType: "Transient",
      });
    }
    if (i % 5 === 2) {
      seeded.push({
        ...common,
        id: `recon-${suffix}-${i}-undetermined`,
        status: "bounced",
        sentAt: base,
        bouncedAt: new Date(base.getTime() + HOUR),
        bounceType: null,
      });
    }
    if (i % 6 === 3) {
      seeded.push({
        ...common,
        id: `recon-${suffix}-${i}-complaint`,
        status: "complained",
        sentAt: base,
        complainedAt: new Date(base.getTime() + HOUR),
      });
    }
    if (i % 7 === 4) {
      // Suppressed-subtype: a suppression, not a bounce (bounced_at stays null).
      seeded.push({
        ...common,
        id: `recon-${suffix}-${i}-suppressed`,
        status: "suppressed",
        sentAt: base,
        suppressedAt: new Date(base.getTime() + HOUR),
        bounceSubType: "Suppressed",
      });
    }
  }
}

// Independent oracle: counts from the seed, using the chart definitions.
function oracle(rows: Seeded[]) {
  const counted = rows.filter((r) => r.status !== "failed" && r.sentAt);
  return {
    sent: counted.length,
    bounced: counted.filter((r) => r.bouncedAt).length,
    complained: counted.filter((r) => r.complainedAt).length,
    suppressed: counted.filter((r) => r.suppressedAt).length,
  };
}

beforeAll(async () => {
  await db
    .insert(organization)
    .values({
      id: ORG,
      name: "Recon DB Org",
      slug: `recon-db-${suffix}`,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  await db.insert(awsAccount).values({
    id: ACCOUNT,
    organizationId: ORG,
    name: "Recon Acct",
    accountId: "666666666666",
    region: "us-east-1",
    roleArn: "arn:aws:iam::666666666666:role/wraps",
    externalId: `ext-recon-${suffix}`,
  });
  await db.insert(batchSend).values([
    { id: BROADCAST_A, organizationId: ORG, name: "A", awsAccountId: ACCOUNT },
    { id: BROADCAST_B, organizationId: ORG, name: "B", awsAccountId: ACCOUNT },
  ]);
  seedSpread();
  await db.insert(messageSend).values(seeded);
});

afterAll(async () => {
  await db.delete(messageSend).where(eq(messageSend.organizationId, ORG));
  await db.delete(batchSend).where(eq(batchSend.organizationId, ORG));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
});

type Handler = (
  request: Request,
  context: { params: Promise<{ orgSlug: string }> }
) => Promise<Response>;

async function callRoute(handler: Handler, query: string): Promise<unknown> {
  const res = await handler(
    new Request(`https://app.test/api/recon/analytics?${query}`),
    { params: Promise.resolve({ orgSlug: "recon" }) }
  );
  return res.json();
}

type BounceRow = { date: string; total: number; sent: number };
type ComplaintRow = { date: string; complaints: number; sent: number };
type SuppressionRow = { date: string; suppressed: number; sent: number };
type DrilldownBody = {
  totals: {
    sent: number;
    bounced: number;
    complained: number;
    suppressed: number;
  };
  ranked: Record<string, number>[];
  belowFloor: Record<string, number>[];
  omitted: Record<string, number>;
};

const bounces = async (q: string) =>
  (await callRoute(bouncesRoute.GET as Handler, q)) as BounceRow[];
const complaints = async (q: string) =>
  (await callRoute(complaintsRoute.GET as Handler, q)) as ComplaintRow[];
const suppression = async (q: string) =>
  (await callRoute(suppressionRoute.GET as Handler, q)) as SuppressionRow[];
const drilldown = async (q: string) =>
  (await callRoute(sendsRoute.GET as Handler, q)) as DrilldownBody;

// The shared window for every case: 14 rolling days in New York time.
const WINDOW = `days=${DAYS}&tz=${encodeURIComponent(TZ)}`;

function withClock<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  return fn().finally(() => vi.useRealTimers());
}

function localDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

describe("drill-down reconciles with the analytics charts", () => {
  it("rolling totals equal the summed /bounces, /complaints and /suppression rows for the same days and tz", async () => {
    await withClock(async () => {
      const [b, c, s, d] = await Promise.all([
        bounces(WINDOW),
        complaints(WINDOW),
        suppression(WINDOW),
        drilldown(`metric=bounce&by=broadcast&${WINDOW}`),
      ]);
      const expected = oracle(seeded);
      const total = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

      expect(total(b.map((r) => r.sent))).toBe(expected.sent);
      expect(d.totals.sent).toBe(expected.sent);
      expect(total(b.map((r) => r.total))).toBe(expected.bounced);
      expect(d.totals.bounced).toBe(expected.bounced);
      expect(total(c.map((r) => r.complaints))).toBe(expected.complained);
      expect(d.totals.complained).toBe(expected.complained);
      expect(total(s.map((r) => r.suppressed))).toBe(expected.suppressed);
      expect(d.totals.suppressed).toBe(expected.suppressed);
    });
  });

  it("a clicked day equals that day's /analytics/bounces row", async () => {
    await withClock(async () => {
      // Day 3 back is fully inside the window, so it is a complete bucket.
      const instant = new Date(NOW.getTime() - 3 * DAY - 3 * HOUR);
      const day = localDate(instant);
      const [rows, s, d] = await Promise.all([
        bounces(WINDOW),
        suppression(WINDOW),
        drilldown(`metric=bounce&by=broadcast&day=${day}&${WINDOW}`),
      ]);
      const row = rows.find((r) => r.date === day);
      expect(row).toBeDefined();
      expect(d.totals.sent).toBe(row?.sent ?? 0);
      expect(d.totals.bounced).toBe(row?.total ?? 0);
      const suppressedRow = s.find((r) => r.date === day);
      const dSuppressed = await drilldown(
        `metric=suppression&by=broadcast&day=${day}&${WINDOW}`
      );
      expect(dSuppressed.totals.suppressed).toBe(
        suppressedRow?.suppressed ?? 0
      );
    });
  });

  it("a Suppressed-subtype event is counted as suppressed and not as bounced in both the drill-down and /bounces", async () => {
    await withClock(async () => {
      const [b, s, d] = await Promise.all([
        bounces(WINDOW),
        suppression(WINDOW),
        drilldown(`metric=suppression&by=broadcast&${WINDOW}`),
      ]);
      const suppressedSeeded = seeded.filter(
        (r) => r.bounceSubType === "Suppressed"
      ).length;
      expect(suppressedSeeded).toBeGreaterThan(0);
      const bouncedFromRoute = b.reduce((acc, r) => acc + r.total, 0);
      // The suppression rows have no bounced_at, so /bounces must not count them.
      expect(bouncedFromRoute).toBe(oracle(seeded).bounced);
      expect(d.totals.suppressed).toBe(
        s.reduce((acc, r) => acc + r.suppressed, 0)
      );
      expect(d.totals.suppressed).toBeGreaterThanOrEqual(suppressedSeeded);
    });
  });

  it("group rows sum to the totals for every grouping dimension", async () => {
    await withClock(async () => {
      for (const by of ["broadcast", "workflow", "template", "from"]) {
        const d = await drilldown(`metric=bounce&by=${by}&${WINDOW}`);
        const all = [...d.ranked, ...d.belowFloor];
        const sum = (field: string) =>
          all.reduce((acc, g) => acc + (g[field] ?? 0), 0) +
          (d.omitted[field] ?? 0);
        expect(sum("sent")).toBe(d.totals.sent);
        expect(sum("bounced")).toBe(d.totals.bounced);
        expect(sum("complained")).toBe(d.totals.complained);
        expect(sum("suppressed")).toBe(d.totals.suppressed);
      }
    });
  });
});
