import { auth } from "@wraps/auth";
import { NextResponse } from "next/server";
import { getBounceMetricsFromPostgres } from "@/lib/analytics-fallback";
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

type BounceDataPoint = {
  date: string;
  timestamp: number;
  permanent: number;
  transient: number;
  undetermined: number;
  total: number;
  sent: number;
  bounceRate: number; // Percentage
};

/**
 * Daily bounce breakdown for the analytics page.
 *
 * Read from Postgres `message_send`, the authoritative store for anything that
 * claims to be this org's email activity. It previously scanned the customer's
 * DynamoDB event table, which is keyed per AWS ACCOUNT and therefore counted
 * SES bounces from mail sent outside Wraps — the same account-wide-source
 * defect the volume chart had. That read was also capped at 10,000 events with
 * no pagination, so a busy account silently lost the older half of its window.
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

    const dataPointsMap = await getBounceMetricsFromPostgres(
      orgWithMembership.id,
      startTime,
      endTime,
      timezone
    );

    const dateRange = generateDateRange(startTime, endTime, timezone);
    const dataPoints: BounceDataPoint[] = gapFillDates(
      dateRange,
      dataPointsMap,
      { permanent: 0, transient: 0, undetermined: 0, sent: 0 }
    ).map((d) => {
      const total = d.permanent + d.transient + d.undetermined;
      const bounceRate = d.sent > 0 ? (total / d.sent) * 100 : 0;
      return {
        ...d,
        total,
        bounceRate: Number.parseFloat(bounceRate.toFixed(2)),
      };
    });

    return NextResponse.json(dataPoints);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/bounces",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching bounce analytics");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
