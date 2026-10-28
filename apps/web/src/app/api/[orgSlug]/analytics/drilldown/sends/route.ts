import { auth } from "@wraps/auth";
import { MetricsQueryError, queryMessageAttributionRows } from "@wraps/db";
import { NextResponse } from "next/server";
import {
  type AttributionCounts,
  attributionRowToInput,
  eventsFor,
  percentOf,
  rankAttribution,
  sumCounts,
} from "@/lib/analytics-drilldown-rank";
import {
  type DrilldownWindow,
  validateDrilldownParams,
} from "@/lib/analytics-drilldown-window";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkFeatureAccess } from "@/lib/plan-limits";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

const ROW_CAP_MESSAGE =
  "This window has more sending groups than can be broken down. Try a shorter window.";

function windowJson(window: DrilldownWindow) {
  return {
    mode: window.day ? ("day" as const) : ("rolling" as const),
    days: window.days,
    day: window.day,
    from: window.startTime.toISOString(),
    to: window.endTime.toISOString(),
    tz: window.tz,
  };
}

/**
 * Sends behind one window's rate, grouped by one dimension. Read from
 * Postgres `message_send` through the same counting as the analytics charts.
 * Not cached: it reconciles exactly with the uncached /bounces, /complaints and
 * /suppression routes.
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

    // The org id comes from membership above, never from the URL.
    const organizationId = orgWithMembership.id;

    const { searchParams } = new URL(request.url);
    const parsed = validateDrilldownParams(
      {
        metric: searchParams.get("metric"),
        by: searchParams.get("by"),
        days: searchParams.get("days"),
        day: searchParams.get("day"),
        tz: searchParams.get("tz"),
      },
      new Date()
    );

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { metric, by, window } = parsed;

    let rows: Awaited<ReturnType<typeof queryMessageAttributionRows>>;
    try {
      rows = await queryMessageAttributionRows({
        organizationId,
        startTime: window.startTime,
        endTime: window.endTime,
        timezone: window.tz,
        by,
        day: window.day ?? undefined,
      });
    } catch (error) {
      if (
        error instanceof MetricsQueryError &&
        error.code === "row_cap_exceeded"
      ) {
        return NextResponse.json({ error: ROW_CAP_MESSAGE }, { status: 422 });
      }
      throw error;
    }

    const groups = rows.map(attributionRowToInput);
    const totals: AttributionCounts = sumCounts(groups);
    const ranking = rankAttribution(groups, totals, metric);

    const access = await checkFeatureAccess(organizationId, "workflows");

    return NextResponse.json({
      metric,
      by,
      window: windowJson(window),
      floor: ranking.floor,
      workflowLinks: access.allowed,
      totals: {
        ...totals,
        rate: percentOf(eventsFor(totals, metric), totals.sent),
      },
      ranked: ranking.ranked,
      belowFloor: ranking.belowFloor,
      omitted: ranking.omitted,
    });
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/drilldown/sends",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching drill-down sends");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
