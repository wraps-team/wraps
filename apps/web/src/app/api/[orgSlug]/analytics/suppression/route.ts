import { auth } from "@wraps/auth";
import { NextResponse } from "next/server";
import { getSuppressionMetricsFromPostgres } from "@/lib/analytics-fallback";
import {
  gapFillDates,
  generateDateRange,
  validateTimezone,
} from "@/lib/analytics-utils";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

type SuppressionDataPoint = {
  date: string;
  timestamp: number;
  suppressed: number;
  sent: number;
  suppressionRate: number; // Percentage
};

/**
 * Daily suppression rate for the analytics page.
 *
 * Read from Postgres `message_send`. The DynamoDB scan this replaces was per
 * AWS ACCOUNT, so it counted suppressions for mail sent outside Wraps, and it
 * truncated at 10,000 events.
 *
 * The response no longer splits account-level from global suppressions.
 * Postgres records THAT a message was suppressed (`suppressed_at`), never the
 * SES reason, so the old `accountLevel` field was hardcoded to 0 for every day
 * whenever this route fell back to Postgres — a field that always reads zero is
 * worse than an absent one. Nothing rendered the split; the chart plots
 * `suppressionRate` only.
 */
export async function GET(request: Request, context: RouteContext) {
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

    const { searchParams } = new URL(request.url);
    const days = Math.min(
      365,
      Math.max(1, Number.parseInt(searchParams.get("days") || "30", 10))
    );
    const timezone = validateTimezone(searchParams.get("tz"));
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    const dataPointsMap = await getSuppressionMetricsFromPostgres(
      orgWithMembership.id,
      startTime,
      endTime,
      timezone
    );

    const dateRange = generateDateRange(startTime, endTime, timezone);
    const dataPoints: SuppressionDataPoint[] = gapFillDates(
      dateRange,
      dataPointsMap,
      { suppressed: 0, sent: 0 }
    ).map((d) => {
      const suppressionRate = d.sent > 0 ? (d.suppressed / d.sent) * 100 : 0;
      return {
        ...d,
        suppressionRate: Number.parseFloat(suppressionRate.toFixed(2)),
      };
    });

    return NextResponse.json(dataPoints);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/suppression",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching suppression analytics");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
