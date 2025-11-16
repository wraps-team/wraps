import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCloudWatchMetrics, SES_METRICS } from "@/lib/aws/cloudwatch";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

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
    const period = days <= 7 ? 3600 : days <= 30 ? 3600 * 6 : 3600 * 24; // 1h, 6h, or 24h

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch metrics for all accounts in parallel
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
          console.error(
            `Failed to fetch volume metrics for account ${account.id}:`,
            error
          );
          return null;
        }
      })
    );

    // Aggregate data points by timestamp
    const dataPointsMap = new Map<
      number,
      { sent: number; delivered: number; bounced: number }
    >();

    for (const metrics of metricsResults) {
      if (!metrics) {
        continue;
      }

      const timestamps = metrics.sent[0]?.Timestamps || [];
      const sentValues = metrics.sent[0]?.Values || [];
      const deliveredValues = metrics.delivered[0]?.Values || [];
      const bouncedValues = metrics.bounced[0]?.Values || [];

      for (let i = 0; i < timestamps.length; i++) {
        const timestamp = timestamps[i].getTime();
        const existing = dataPointsMap.get(timestamp) || {
          sent: 0,
          delivered: 0,
          bounced: 0,
        };

        dataPointsMap.set(timestamp, {
          sent: existing.sent + (sentValues[i] || 0),
          delivered: existing.delivered + (deliveredValues[i] || 0),
          bounced: existing.bounced + (bouncedValues[i] || 0),
        });
      }
    }

    // Convert to array and sort by timestamp
    const dataPoints = Array.from(dataPointsMap.entries())
      .map(([timestamp, values]) => ({
        date: new Date(timestamp).toISOString().split("T")[0],
        timestamp,
        sent: Math.round(values.sent),
        delivered: Math.round(values.delivered),
        bounced: Math.round(values.bounced),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    return NextResponse.json(dataPoints);
  } catch (error) {
    console.error("Error fetching volume analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
