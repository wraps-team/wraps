import { auth } from "@wraps/auth";
import { NextResponse } from "next/server";
import { getComplaintMetricsFromPostgres } from "@/lib/analytics-fallback";
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

type ComplaintDataPoint = {
  date: string;
  timestamp: number;
  complaints: number;
  sent: number;
  complaintRate: number; // Percentage
};

/**
 * Daily complaint rate for the analytics page.
 *
 * Read from Postgres `message_send` for the same reason as the bounce route:
 * the DynamoDB event table this used to scan is per AWS ACCOUNT, so it counted
 * complaints against mail Wraps never sent, and its 10,000-event cap truncated
 * long windows without saying so.
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

    const dataPointsMap = await getComplaintMetricsFromPostgres(
      orgWithMembership.id,
      startTime,
      endTime,
      timezone
    );

    const dateRange = generateDateRange(startTime, endTime, timezone);
    const dataPoints: ComplaintDataPoint[] = gapFillDates(
      dateRange,
      dataPointsMap,
      { complaints: 0, sent: 0 }
    ).map((d) => {
      const complaintRate = d.sent > 0 ? (d.complaints / d.sent) * 100 : 0;
      return {
        ...d,
        complaintRate: Number.parseFloat(complaintRate.toFixed(4)),
      };
    });

    return NextResponse.json(dataPoints);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/complaints",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching complaint analytics");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
