import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

type SesHealthRollupStatus = "healthy" | "at_risk" | "in_danger" | "unknown";

// Mirrors rollUpSesHealth() in apps/api/src/lib/ses-health.ts, which is the
// source of truth for this ordering. apps/web cannot import from apps/api;
// if the ranking changes there, change it here. The route test below pins
// `unknown` above `healthy` so a divergence fails loudly.
const SES_STATUS_RANK: Record<SesHealthRollupStatus, number> = {
  in_danger: 3,
  at_risk: 2,
  unknown: 1,
  healthy: 0,
};

function rollUp(statuses: SesHealthRollupStatus[]): SesHealthRollupStatus {
  let worst: SesHealthRollupStatus = "healthy";
  for (const status of statuses) {
    if (SES_STATUS_RANK[status] > SES_STATUS_RANK[worst]) {
      worst = status;
    }
  }
  return worst;
}

/**
 * Read-only view of the SES health verdict the hourly account-health sweep
 * (apps/api/src/workers/account-health.ts) already persists. No AWS calls
 * here — Postgres only, since the sweep already paid for the AWS reads.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;

    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
      columns: {
        id: true,
        name: true,
        accountId: true,
        region: true,
        healthStatus: true,
        healthCheckedAt: true,
        healthDetail: true,
      },
    });

    const accountViews = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      accountId: account.accountId,
      region: account.region,
      status: (account.healthStatus ?? "unknown") as SesHealthRollupStatus,
      checkedAt: account.healthCheckedAt?.getTime() ?? null,
      reasons: account.healthDetail?.reasons ?? [],
    }));

    const status =
      accountViews.length === 0
        ? "unknown"
        : rollUp(accountViews.map((a) => a.status));

    // Oldest of the present timestamps, so the freshness claim on the badge is
    // true of every account represented — not just the most recently checked.
    const checkedAt = accountViews.reduce<number | null>((oldest, a) => {
      if (a.checkedAt === null) {
        return oldest;
      }
      return oldest === null ? a.checkedAt : Math.min(oldest, a.checkedAt);
    }, null);

    return NextResponse.json({
      status,
      checkedAt,
      accounts: accountViews,
    });
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/health",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching SES health");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
