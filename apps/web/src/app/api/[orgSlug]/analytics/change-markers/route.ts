import { auth } from "@wraps/auth";
import { listChangeMarkerRows, queryMessageMetricBuckets } from "@wraps/db";
import { NextResponse } from "next/server";
import {
  DRILLDOWN_DEFAULT_DAYS,
  DRILLDOWN_MAX_DAYS,
} from "@/lib/analytics-drilldown-window";
import { validateTimezone } from "@/lib/analytics-utils";
import {
  attachDeltas,
  buildChangeMarkers,
  type ChangeMarkersResponse,
  capMarkers,
  clusterMarkers,
  deltaQueryWindow,
} from "@/lib/change-markers";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";
import { getOrganizationPlan } from "@/lib/plan-limits";
import { getHistoryRetentionDays } from "@/lib/plans";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DIGITS_ONLY = /^\d+$/;
const DAYS_ERROR = `days must be between 1 and ${DRILLDOWN_MAX_DAYS}`;

/** Absent means the default. Anything that is not 1..90 is rejected. */
function parseDays(raw: string | null): number | null {
  if (!raw) {
    return DRILLDOWN_DEFAULT_DAYS;
  }
  if (!DIGITS_ONLY.test(raw)) {
    return null;
  }
  const days = Number(raw);
  return days >= 1 && days <= DRILLDOWN_MAX_DAYS ? days : null;
}

/**
 * Change markers for the analytics charts (deltas=0) and the timeline tab
 * (deltas=1). Org-scoped by membership, never by a URL value. Audit-derived
 * rows older than the plan's retention are excluded.
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
    const days = parseDays(searchParams.get("days"));
    if (days === null) {
      return NextResponse.json({ error: DAYS_ERROR }, { status: 400 });
    }
    const timezone = validateTimezone(searchParams.get("tz"));
    const withDeltas = searchParams.get("deltas") !== "0";

    const now = new Date();
    const startTime = new Date(now.getTime() - days * DAY_MS);
    const endTime = now;

    const plan = await getOrganizationPlan(organizationId);
    const auditFloor = new Date(
      now.getTime() - getHistoryRetentionDays(plan) * DAY_MS
    );

    const rows = await listChangeMarkerRows({
      organizationId,
      startTime,
      endTime,
      auditFloor,
    });

    const built = buildChangeMarkers(rows, {
      orgSlug,
      timezone,
      window: { startMs: startTime.getTime(), endMs: endTime.getTime() },
    });
    const capped = capMarkers(clusterMarkers(built, { orgSlug }), {
      truncatedSource: rows.truncated,
    });

    let markers = capped.markers;
    if (withDeltas) {
      // Deltas are computed for the markers returned only. Groups have none.
      const queryWindow = deltaQueryWindow(markers);
      const buckets = queryWindow
        ? await queryMessageMetricBuckets({
            organizationId,
            startTime: queryWindow.startTime,
            endTime: queryWindow.endTime,
            timezone: "UTC",
            granularity: "hourly",
            dimensions: ["period"],
          })
        : [];
      markers = attachDeltas(markers, buckets, now);
    }

    const body: ChangeMarkersResponse = {
      generatedAt: now.getTime(),
      window: {
        startMs: startTime.getTime(),
        endMs: endTime.getTime(),
        timezone,
      },
      markers,
      totalMarkers: capped.totalMarkers,
      truncated: capped.truncated,
      deltasIncluded: withDeltas,
    };
    return NextResponse.json(body);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/change-markers",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching change markers");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
