// DB-backed. NOT RUN in the drill-down worktree: apps/web/.env.test does not
// exist there yet. Covers spec section 8.4's two real-query cases (org
// isolation and identical totals across grouping dimensions). Fixtures are
// namespaced by a per-file suffix.
import {
  awsAccount,
  batchSend,
  db,
  messageSend,
  organization,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const suffix = crypto.randomUUID().slice(0, 8);
const ORG = `drill-db-org-${suffix}`;
const OTHER_ORG = `drill-db-other-${suffix}`;
const ACCOUNT = `drill-db-acct-${suffix}`;
const OTHER_ACCOUNT = `drill-db-other-acct-${suffix}`;
const BROADCAST = `drill-db-batch-${suffix}`;
const OTHER_BROADCAST = `drill-db-other-batch-${suffix}`;

// Fixed window: the route reads `new Date()`, so pin the clock.
const NOW = new Date("2026-10-28T12:00:00.000Z");

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

const mockMembershipOrg = vi.fn();
vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: "user-drill-db",
          email: "drill@example.com",
          name: "Drill",
        },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: (...args: unknown[]) =>
    mockMembershipOrg(...args),
}));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ orgSlug: string }> }
) => Promise<Response>;

async function drilldown(query: string): Promise<Record<string, unknown>> {
  const mod = await import("../[orgSlug]/analytics/drilldown/sends/route");
  const res = await (mod.GET as unknown as RouteHandler)(
    new Request(`https://app.test/api/acme/analytics/drilldown/sends?${query}`),
    { params: Promise.resolve({ orgSlug: "acme" }) }
  );
  return res.json();
}

beforeAll(async () => {
  await db
    .insert(organization)
    .values([
      {
        id: ORG,
        name: "Drill DB Org",
        slug: `drill-db-${suffix}`,
        createdAt: new Date(),
      },
      {
        id: OTHER_ORG,
        name: "Drill DB Other",
        slug: `drill-db-other-${suffix}`,
        createdAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  await db.insert(awsAccount).values([
    {
      id: ACCOUNT,
      organizationId: ORG,
      name: "Drill A",
      accountId: "444444444444",
      region: "us-east-1",
      roleArn: "arn:aws:iam::444444444444:role/wraps",
      externalId: `ext-drill-${suffix}`,
    },
    {
      id: OTHER_ACCOUNT,
      organizationId: OTHER_ORG,
      name: "Drill B",
      accountId: "555555555555",
      region: "us-east-1",
      roleArn: "arn:aws:iam::555555555555:role/wraps",
      externalId: `ext-drill-other-${suffix}`,
    },
  ]);

  await db.insert(batchSend).values([
    { id: BROADCAST, organizationId: ORG, name: "Ours", awsAccountId: ACCOUNT },
    {
      id: OTHER_BROADCAST,
      organizationId: OTHER_ORG,
      name: "Theirs",
      awsAccountId: OTHER_ACCOUNT,
    },
  ]);

  const at = (hoursAgo: number) =>
    new Date(NOW.getTime() - hoursAgo * 3_600_000);
  const rows = [
    // ORG: 4 sends on one broadcast, 1 permanent bounce.
    ...[1, 2, 3].map((h) => ({
      id: `drill-db-ok-${suffix}-${h}`,
      organizationId: ORG,
      awsAccountId: ACCOUNT,
      batchSendId: BROADCAST,
      sourceType: "batch" as const,
      recipient: "reader@example.com",
      status: "sent" as const,
      sentAt: at(h),
      from: "news@ours.example",
    })),
    {
      id: `drill-db-bounce-${suffix}`,
      organizationId: ORG,
      awsAccountId: ACCOUNT,
      batchSendId: BROADCAST,
      sourceType: "batch" as const,
      recipient: "reader@example.com",
      status: "bounced" as const,
      sentAt: at(4),
      bouncedAt: at(3),
      bounceType: "Permanent",
      from: "news@ours.example",
    },
    // OTHER_ORG: a loud broadcast with the same window. Must never appear for ORG.
    ...[1, 2, 3, 4, 5].map((h) => ({
      id: `drill-db-other-${suffix}-${h}`,
      organizationId: OTHER_ORG,
      awsAccountId: OTHER_ACCOUNT,
      batchSendId: OTHER_BROADCAST,
      sourceType: "batch" as const,
      recipient: "reader@example.com",
      status: "complained" as const,
      sentAt: at(h),
      complainedAt: at(h - 0.5),
      from: "news@theirs.example",
    })),
  ];
  await db.insert(messageSend).values(rows);
});

afterAll(async () => {
  await db.delete(messageSend).where(eq(messageSend.organizationId, ORG));
  await db.delete(messageSend).where(eq(messageSend.organizationId, OTHER_ORG));
  await db.delete(batchSend).where(eq(batchSend.organizationId, ORG));
  await db.delete(batchSend).where(eq(batchSend.organizationId, OTHER_ORG));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, OTHER_ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(organization).where(eq(organization.id, OTHER_ORG));
});

describe("drill-down sends, real query", () => {
  it("never returns another organization's sends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      mockMembershipOrg.mockResolvedValue({
        id: ORG,
        name: "Drill DB Org",
        slug: "acme",
      });
      const body = (await drilldown(
        "metric=complaint&by=broadcast&days=7"
      )) as {
        totals: { sent: number; complained: number };
        ranked: { key: string | null; label: string | null }[];
        belowFloor: { key: string | null; label: string | null }[];
      };
      // ORG has 4 sends and no complaints. OTHER_ORG's 5 complained sends are excluded.
      expect(body.totals.sent).toBe(4);
      expect(body.totals.complained).toBe(0);
      const keys = [...body.ranked, ...body.belowFloor].map((g) => g.key);
      expect(keys).not.toContain(OTHER_BROADCAST);
      expect(keys).toContain(BROADCAST);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the same totals for every by value", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      mockMembershipOrg.mockResolvedValue({
        id: ORG,
        name: "Drill DB Org",
        slug: "acme",
      });
      const totals = await Promise.all(
        ["broadcast", "workflow", "template", "from"].map(async (by) => {
          const body = (await drilldown(`metric=bounce&by=${by}&days=7`)) as {
            totals: Record<string, number>;
          };
          return body.totals;
        })
      );
      for (const t of totals) {
        expect(t).toEqual(totals[0]);
      }
      expect(totals[0]).toMatchObject({ sent: 4, bounced: 1, permanent: 1 });
    } finally {
      vi.useRealTimers();
    }
  });
});
