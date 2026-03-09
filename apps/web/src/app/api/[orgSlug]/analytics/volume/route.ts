import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  aggregateByDate,
  gapFillDates,
  generateDateRange,
} from "@/lib/analytics-utils";
import { getCloudWatchMetrics, SES_METRICS } from "@/lib/aws/cloudwatch";
import { createRequestLogger, serializeError } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/volume",
      method: "GET",
      orgSlug,
    });

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

    const { searchParams } = new URL(request.url);
    const days = Math.min(
      365,
      Math.max(1, Number.parseInt(searchParams.get("days") || "90", 10))
    );
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    const period = days <= 7 ? 3600 : days <= 30 ? 3600 * 6 : 3600 * 24;

    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json([]);
    }

    const metricsResults = await Promise.all(
      accounts.map(async (account) => {
        try {
          const [sent, delivered, bounced] = await Promise.all([
            getCloudWatchMetrics({
              awsAccountId: account.id,
              metric: SES_METRICS.SEND,
              period,
              startTime,
              endTime,
            }),
            getCloudWatchMetrics({
              awsAccountId: account.id,
              metric: SES_METRICS.DELIVERY,
              period,
              startTime,
              endTime,
            }),
            getCloudWatchMetrics({
              awsAccountId: account.id,
              metric: SES_METRICS.BOUNCE,
              period,
              startTime,
              endTime,
            }),
          ]);

          return { sent, delivered, bounced };
        } catch (error) {
          log.error(
            { err: serializeError(error), accountId: account.id },
            "Failed to fetch volume metrics for account"
          );
          return null;
        }
      })
    );

    const keys = ["sent", "delivered", "bounced"] as const;
    const dailyMap = new Map<string, Record<(typeof keys)[number], number>>();

    for (const metrics of metricsResults) {
      if (!metrics) {
        continue;
      }

      const timestamps = metrics.sent[0]?.Timestamps || [];
      const perAccount = aggregateByDate(
        timestamps,
        [
          metrics.sent[0]?.Values || [],
          metrics.delivered[0]?.Values || [],
          metrics.bounced[0]?.Values || [],
        ],
        [...keys]
      );

      for (const [dateStr, values] of perAccount) {
        const existing = dailyMap.get(dateStr) || {
          sent: 0,
          delivered: 0,
          bounced: 0,
        };
        dailyMap.set(dateStr, {
          sent: existing.sent + values.sent,
          delivered: existing.delivered + values.delivered,
          bounced: existing.bounced + values.bounced,
        });
      }
    }

    const dateRange = generateDateRange(startTime, endTime);
    const dataPoints = gapFillDates(dateRange, dailyMap, {
      sent: 0,
      delivered: 0,
      bounced: 0,
    }).map((d) => ({
      ...d,
      sent: Math.round(d.sent),
      delivered: Math.round(d.delivered),
      bounced: Math.round(d.bounced),
    }));

    return NextResponse.json(dataPoints);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/volume",
      method: "GET",
    });
    log.error(
      { err: serializeError(error) },
      "Error fetching volume analytics"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
