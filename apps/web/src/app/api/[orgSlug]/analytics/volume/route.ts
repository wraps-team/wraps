import { auth } from "@wraps/auth";
import { NextResponse } from "next/server";
import { getEmailMetricsFromPostgres } from "@/lib/analytics-fallback";
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

/**
 * Daily email volume for the analytics page.
 *
 * Counts come from Postgres `message_send` and nothing else. This route used to
 * read undimensioned `AWS/SES` CloudWatch metrics, which are ACCOUNT-WIDE: they
 * count every send made from the customer's AWS account, including mail sent
 * outside Wraps entirely, which can never appear in the emails list. Postgres
 * cannot be scoped wrong — `getEmailMetricsFromPostgres` filters on the same
 * predicate the list uses (organization, `channel = 'email'`, non-null `sentAt`
 * inside the window) — so the chart and the list describe one population.
 *
 * Orgs with foreign SES traffic will see these numbers drop. That is the point.
 *
 * No AWS call is made here, so there is no AWS account gate: an org that has
 * sends recorded but whose event pipeline never came up (the `fsi-language-courses`
 * case) still gets its real volume instead of an empty chart.
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
      Math.max(1, Number.parseInt(searchParams.get("days") || "90", 10))
    );
    const timezone = validateTimezone(searchParams.get("tz"));
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    const pgData = await getEmailMetricsFromPostgres(
      orgWithMembership.id,
      startTime,
      endTime,
      timezone
    );

    const dailyMap = new Map<
      string,
      {
        sent: number;
        delivered: number;
        bounced: number;
        renderingFailures: number;
      }
    >();
    for (const [dateStr, m] of pgData) {
      dailyMap.set(dateStr, {
        sent: m.sent,
        delivered: m.delivered,
        bounced: m.bounced,
        renderingFailures: m.renderingFailures,
      });
    }

    const dateRange = generateDateRange(startTime, endTime, timezone);
    const dataPoints = gapFillDates(dateRange, dailyMap, {
      sent: 0,
      delivered: 0,
      bounced: 0,
      renderingFailures: 0,
    });

    return NextResponse.json(dataPoints);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/volume",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching volume analytics");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
