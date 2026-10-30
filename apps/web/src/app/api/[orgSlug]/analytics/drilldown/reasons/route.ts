import { auth } from "@wraps/auth";
import {
  describeBounceSubtype,
  describeComplaintFeedbackType,
  translateDiagnosticCode,
} from "@wraps/core/email-diagnostics";
import {
  type BounceReasonRow,
  type ComplaintReasonRow,
  type LegacyReasonRow,
  queryBounceReasonRows,
  queryComplaintReasonRows,
  queryLegacyReasonRows,
  queryLegacyReasonTotals,
  queryReasonsFallbackSince,
  queryReasonsSuppressionCount,
  queryReasonTotals,
  type ReasonsMetric,
  type ReasonsQuery,
} from "@wraps/db";
import { NextResponse } from "next/server";
import type {
  ReasonGroup,
  ReasonsResponse,
} from "@/app/(dashboard)/[orgSlug]/emails/deliverability/components/reason-groups";
import { validateDrilldownParams } from "@/lib/analytics-drilldown-window";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

const ROUTE_PATH = "/api/[orgSlug]/analytics/drilldown/reasons";
const GROUP_CAP = 50;
// A UI label for a recorded complaint with no feedback type. The catalog
// (@wraps/core/email-diagnostics) has no entry for this case.
const NOT_REPORTED_TITLE = "Feedback type not reported by the receiver";
// undefined_table and undefined_column: the migration or the web deploy lags.
const MISSING_SCHEMA_CODES = new Set(["42P01", "42703"]);

/**
 * The Postgres code when the error, or its cause, says the diagnostic table or
 * column is missing. Drizzle may wrap the driver error, so both are checked.
 */
function missingSchemaCode(error: unknown): string | null {
  const candidates = [
    error,
    (error as { cause?: unknown } | null | undefined)?.cause,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      const code = (candidate as { code?: unknown }).code;
      if (typeof code === "string" && MISSING_SCHEMA_CODES.has(code)) {
        return code;
      }
    }
  }
  return null;
}

function shareOf(count: number, totalCount: number): number | null {
  if (totalCount <= 0) {
    return null;
  }
  return Math.round((count / totalCount) * 10_000) / 100;
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function bounceGroup(row: BounceReasonRow, totalCount: number): ReasonGroup {
  // The copy comes from the same catalog the webhook used. The sample is one
  // row's status and code, so the copy matches the reason key of the group.
  const translation = row.hasDetail
    ? translateDiagnosticCode({
        status: row.sampleStatus ?? undefined,
        diagnosticCode: row.sampleCode ?? undefined,
      })
    : null;
  const subtype = describeBounceSubtype({
    bounceType: row.bounceType,
    bounceSubType: row.bounceSubType,
  });

  return {
    receiverDomain: row.receiverDomain,
    bounceType: row.bounceType,
    title: translation?.title ?? subtype.title,
    explanation: translation?.explanation ?? null,
    suggestedAction: translation
      ? (translation.suggestedAction ?? null)
      : (subtype.suggestedAction ?? null),
    provider: translation?.provider ?? null,
    severity: translation?.severity ?? subtype.severity,
    rawCode: row.hasDetail ? row.sampleCode : null,
    feedbackType: null,
    count: row.count,
    share: shareOf(row.count, totalCount),
    distinctRecipients: row.distinctRecipients,
    firstSeen: isoOrNull(row.firstSeen),
    lastSeen: isoOrNull(row.lastSeen),
    hasDetail: row.hasDetail,
  };
}

function complaintGroup(
  row: ComplaintReasonRow,
  totalCount: number
): ReasonGroup {
  const copy = describeComplaintFeedbackType(row.feedbackType);
  const unreported = row.hasDetail && row.feedbackType === null;
  return {
    receiverDomain: row.receiverDomain,
    bounceType: null,
    title: unreported ? NOT_REPORTED_TITLE : copy.title,
    explanation: copy.explanation,
    suggestedAction: copy.suggestedAction,
    provider: null,
    severity: copy.severity,
    rawCode: null,
    feedbackType: row.feedbackType,
    count: row.count,
    share: shareOf(row.count, totalCount),
    distinctRecipients: row.distinctRecipients,
    firstSeen: isoOrNull(row.firstSeen),
    lastSeen: isoOrNull(row.lastSeen),
    hasDetail: row.hasDetail,
  };
}

/** A legacy row has no stored reason, so it gets the subtype or generic copy. */
function legacyGroup(
  row: LegacyReasonRow,
  metric: ReasonsMetric,
  totalCount: number
): ReasonGroup {
  const base = {
    receiverDomain: row.receiverDomain,
    provider: null,
    rawCode: null,
    feedbackType: null,
    count: row.count,
    share: shareOf(row.count, totalCount),
    distinctRecipients: row.distinctRecipients,
    firstSeen: isoOrNull(row.firstSeen),
    lastSeen: isoOrNull(row.lastSeen),
    hasDetail: false,
  };
  if (metric === "bounce") {
    const subtype = describeBounceSubtype({
      bounceType: row.bounceType,
      bounceSubType: row.bounceSubType,
    });
    return {
      ...base,
      bounceType: row.bounceType,
      title: subtype.title,
      explanation: null,
      suggestedAction: subtype.suggestedAction ?? null,
      severity: subtype.severity,
    };
  }
  const copy = describeComplaintFeedbackType(null);
  return {
    ...base,
    bounceType: null,
    title: copy.title,
    explanation: copy.explanation,
    suggestedAction: copy.suggestedAction,
    severity: copy.severity,
  };
}

function toResponse(args: {
  mode: ReasonsResponse["mode"];
  metric: ReasonsMetric;
  totalCount: number;
  fallbackSince: string | null;
  windowHasFallbackRows: boolean;
  groups: ReasonGroup[];
  suppressionReconciliation: number;
}): ReasonsResponse {
  const shown = args.groups.slice(0, GROUP_CAP);
  const shownCount = shown.reduce((sum, group) => sum + group.count, 0);
  return {
    mode: args.mode,
    metric: args.metric,
    totalCount: args.totalCount,
    fallbackSince: args.fallbackSince,
    windowHasFallbackRows: args.windowHasFallbackRows,
    groups: shown,
    otherCount: Math.max(0, args.totalCount - shownCount),
    suppressionReconciliation: args.suppressionReconciliation,
  };
}

async function loadDetailed(
  metric: ReasonsMetric,
  query: ReasonsQuery
): Promise<ReasonsResponse> {
  const [
    totals,
    fallbackSince,
    suppressionReconciliation,
    bounceRows,
    complaintRows,
  ] = await Promise.all([
    queryReasonTotals(query, metric),
    queryReasonsFallbackSince(query.organizationId, metric),
    metric === "bounce" ? queryReasonsSuppressionCount(query) : 0,
    metric === "bounce" ? queryBounceReasonRows(query) : [],
    metric === "complaint" ? queryComplaintReasonRows(query) : [],
  ]);

  const groups =
    metric === "bounce"
      ? bounceRows.map((row) => bounceGroup(row, totals.totalCount))
      : complaintRows.map((row) => complaintGroup(row, totals.totalCount));

  return toResponse({
    mode: "detailed",
    metric,
    totalCount: totals.totalCount,
    fallbackSince: isoOrNull(fallbackSince),
    // From the exact total, so a fallback group past the 500-group SQL cap still counts.
    windowHasFallbackRows: totals.withoutDetail > 0,
    groups,
    suppressionReconciliation,
  });
}

async function loadLegacy(
  metric: ReasonsMetric,
  query: ReasonsQuery
): Promise<ReasonsResponse> {
  const [totalCount, rows, suppressionReconciliation] = await Promise.all([
    queryLegacyReasonTotals(query, metric),
    queryLegacyReasonRows(query, metric),
    metric === "bounce" ? queryReasonsSuppressionCount(query) : 0,
  ]);

  return toResponse({
    mode: "legacy",
    metric,
    totalCount,
    fallbackSince: null,
    windowHasFallbackRows: true,
    groups: rows.map((row) => legacyGroup(row, metric, totalCount)),
    suppressionReconciliation,
  });
}

/** Detailed reasons, or the legacy shape when the diagnostic schema is missing. */
async function loadReasons(
  metric: ReasonsMetric,
  query: ReasonsQuery
): Promise<ReasonsResponse> {
  try {
    return await loadDetailed(metric, query);
  } catch (error) {
    const code = missingSchemaCode(error);
    if (code === null) {
      throw error;
    }
    createRequestLogger({ path: ROUTE_PATH, method: "GET" }).warn(
      { code, metric },
      "Drill-down reasons: diagnostic schema not available, serving legacy mode"
    );
    return loadLegacy(metric, query);
  }
}

/**
 * Bounce or complaint reasons for one window, grouped by receiver domain and
 * the stored reason. Read from Postgres, scoped to the org from membership. It
 * returns counts and distinct-recipient counts only, never an address.
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
    const metric = searchParams.get("metric");
    // Checked here, not by the shared validator: that one also accepts
    // suppression, which has no reasons view.
    if (metric !== "bounce" && metric !== "complaint") {
      return NextResponse.json(
        { error: "metric must be bounce or complaint" },
        { status: 400 }
      );
    }

    const parsed = validateDrilldownParams(
      {
        metric,
        days: searchParams.get("days"),
        day: searchParams.get("day"),
        tz: searchParams.get("tz"),
      },
      new Date()
    );

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { window } = parsed;
    const query: ReasonsQuery = {
      organizationId,
      startTime: window.startTime,
      endTime: window.endTime,
      timezone: window.tz,
      day: window.day,
    };

    const body = await loadReasons(metric, query);
    return NextResponse.json(body);
  } catch (error) {
    const log = createRequestLogger({
      path: ROUTE_PATH,
      method: "GET",
    });
    log.error({ err: error }, "Error fetching drill-down reasons");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
