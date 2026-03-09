import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSMSMetricsSummary } from "@/lib/aws/sms-voice";
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
      path: "/api/[orgSlug]/analytics/sms/overview",
      method: "GET",
      orgSlug,
    });

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
    const days = Math.min(
      365,
      Math.max(1, Number.parseInt(searchParams.get("days") || "30", 10))
    );
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalQueued: 0,
        deliveryRate: 0,
        failureRate: 0,
      });
    }

    // Fetch SMS metrics for all accounts in parallel
    const metricsResults = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await getSMSMetricsSummary({
            awsAccountId: account.id,
            startTime,
            endTime,
            period: 3600, // 1 hour aggregation
          });
        } catch (error) {
          log.error(
            { err: serializeError(error), accountId: account.id },
            "Failed to fetch SMS metrics for account"
          );
          return null;
        }
      })
    );

    // Aggregate metrics across all accounts
    const calculateTotal = (
      metricName: "successful" | "delivered" | "failed" | "queued"
    ) =>
      metricsResults.reduce((total, metrics) => {
        if (!metrics) {
          return total;
        }
        const values = metrics[metricName]?.[0]?.Values || [];
        return total + values.reduce((sum, val) => sum + (val || 0), 0);
      }, 0);

    const totalSent = calculateTotal("successful");
    const totalDelivered = calculateTotal("delivered");
    const totalFailed = calculateTotal("failed");
    const totalQueued = calculateTotal("queued");

    const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
    const failureRate = totalSent > 0 ? (totalFailed / totalSent) * 100 : 0;

    return NextResponse.json({
      totalSent: Math.round(totalSent),
      totalDelivered: Math.round(totalDelivered),
      totalFailed: Math.round(totalFailed),
      totalQueued: Math.round(totalQueued),
      deliveryRate: Number(deliveryRate.toFixed(2)),
      failureRate: Number(failureRate.toFixed(2)),
    });
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/sms/overview",
      method: "GET",
    });
    log.error(
      { err: serializeError(error) },
      "Error fetching SMS analytics overview"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
