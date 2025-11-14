import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCloudWatchMetrics, SES_METRICS } from "@/lib/aws/cloudwatch";
import { getOrganizationWithMembership } from "@/lib/organization";

interface RouteContext {
  params: Promise<{
    orgSlug: string;
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;

    // Authenticate user
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify organization membership
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get time range from query params
    const { searchParams } = new URL(request.url);
    const days = Number.parseInt(searchParams.get("days") || "90", 10);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    // Determine period based on date range
    const period = days <= 7 ? 3600 : days <= 30 ? 3600 * 6 : 3600 * 24;

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch engagement metrics for all accounts
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
          console.error(
            `Failed to fetch engagement metrics for account ${account.id}:`,
            error
          );
          return null;
        }
      })
    );

    // Aggregate data points by timestamp
    const dataPointsMap = new Map<
      number,
      { sent: number; delivered: number; opens: number; clicks: number }
    >();

    for (const metrics of metricsResults) {
      if (!metrics) continue;

      const timestamps = metrics.sent[0]?.Timestamps || [];
      const sentValues = metrics.sent[0]?.Values || [];
      const deliveredValues = metrics.delivered[0]?.Values || [];
      const opensValues = metrics.opens[0]?.Values || [];
      const clicksValues = metrics.clicks[0]?.Values || [];

      for (let i = 0; i < timestamps.length; i++) {
        const timestamp = timestamps[i].getTime();
        const existing = dataPointsMap.get(timestamp) || {
          sent: 0,
          delivered: 0,
          opens: 0,
          clicks: 0,
        };

        dataPointsMap.set(timestamp, {
          sent: existing.sent + (sentValues[i] || 0),
          delivered: existing.delivered + (deliveredValues[i] || 0),
          opens: existing.opens + (opensValues[i] || 0),
          clicks: existing.clicks + (clicksValues[i] || 0),
        });
      }
    }

    // Convert to array with calculated rates
    const dataPoints = Array.from(dataPointsMap.entries())
      .map(([timestamp, values]) => {
        const openRate =
          values.delivered > 0 ? (values.opens / values.delivered) * 100 : 0;
        const clickRate =
          values.delivered > 0 ? (values.clicks / values.delivered) * 100 : 0;
        const ctr = values.opens > 0 ? (values.clicks / values.opens) * 100 : 0;

        return {
          date: new Date(timestamp).toISOString().split("T")[0],
          timestamp,
          openRate: Number(openRate.toFixed(1)),
          clickRate: Number(clickRate.toFixed(1)),
          ctr: Number(ctr.toFixed(1)),
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    return NextResponse.json(dataPoints);
  } catch (error) {
    console.error("Error fetching engagement analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
