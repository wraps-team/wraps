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
      path: "/api/[orgSlug]/analytics/engagement",
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
          const [sent, delivered, opens, clicks] = await Promise.all([
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
              metric: SES_METRICS.OPEN,
              period,
              startTime,
              endTime,
            }),
            getCloudWatchMetrics({
              awsAccountId: account.id,
              metric: SES_METRICS.CLICK,
              period,
              startTime,
              endTime,
            }),
          ]);

          return { sent, delivered, opens, clicks };
        } catch (error) {
          log.error(
            { err: serializeError(error), accountId: account.id },
            "Failed to fetch engagement metrics for account"
          );
          return null;
        }
      })
    );

    const keys = ["sent", "delivered", "opens", "clicks"] as const;
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
          metrics.opens[0]?.Values || [],
          metrics.clicks[0]?.Values || [],
        ],
        [...keys]
      );

      for (const [dateStr, values] of perAccount) {
        const existing = dailyMap.get(dateStr) || {
          sent: 0,
          delivered: 0,
          opens: 0,
          clicks: 0,
        };
        dailyMap.set(dateStr, {
          sent: existing.sent + values.sent,
          delivered: existing.delivered + values.delivered,
          opens: existing.opens + values.opens,
          clicks: existing.clicks + values.clicks,
        });
      }
    }

    const dateRange = generateDateRange(startTime, endTime);
    const dataPoints = gapFillDates(dateRange, dailyMap, {
      sent: 0,
      delivered: 0,
      opens: 0,
      clicks: 0,
    }).map((d) => {
      const openRate = d.delivered > 0 ? (d.opens / d.delivered) * 100 : 0;
      const clickRate = d.delivered > 0 ? (d.clicks / d.delivered) * 100 : 0;
      const ctr = d.opens > 0 ? (d.clicks / d.opens) * 100 : 0;

      return {
        date: d.date,
        timestamp: d.timestamp,
        openRate: Number(openRate.toFixed(1)),
        clickRate: Number(clickRate.toFixed(1)),
        ctr: Number(ctr.toFixed(1)),
      };
    });

    return NextResponse.json(dataPoints);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/engagement",
      method: "GET",
    });
    log.error(
      { err: serializeError(error) },
      "Error fetching engagement analytics"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
