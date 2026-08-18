import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { getEmailMetricsFromPostgres } from "@/lib/analytics-fallback";
import type { EmailChartMeta } from "@/lib/analytics-scope";
import {
  gapFillDates,
  generateDateRange,
  validateTimezone,
} from "@/lib/analytics-utils";
import {
  type CloudWatchErrorKind,
  getCloudWatchErrorKind,
  getSESReputationMetrics,
} from "@/lib/aws/cloudwatch";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

function resolveReputationScope(
  hasReputation: boolean,
  effectiveSent: number
): EmailChartMeta["reputationScope"] {
  if (hasReputation) {
    return "ses-account";
  }
  return effectiveSent > 0 ? "window" : "none";
}

/**
 * Chart data for the emails page.
 *
 * Volume comes from Postgres `message_send` and nothing else. It previously came
 * from undimensioned `AWS/SES` CloudWatch metrics, which are account-wide: they
 * counted SES traffic sent outside Wraps entirely, traffic that can never appear
 * in the table below the chart. That is the documented "graph shows data but the
 * table is empty" complaint. `getEmailMetricsFromPostgres` filters on the same
 * predicate the table's query uses — organization, `channel = 'email'`, a
 * non-null `sentAt` inside the window — so the two agree by construction rather
 * than by coincidence.
 *
 * CloudWatch is still read for one thing: account-level SES reputation, which is
 * account-scoped by nature and is labelled as such in the UI.
 */
function buildEmailChartData(orgId: string, days: number, timezone: string) {
  return unstable_cache(
    async () => {
      const endTime = new Date();
      const startTime = new Date(
        endTime.getTime() - days * 24 * 60 * 60 * 1000
      );

      const log = createRequestLogger({
        path: "/api/[orgSlug]/analytics/email-chart",
        method: "GET",
        organizationId: orgId,
      });

      const accounts = await db.query.awsAccount.findMany({
        where: eq(awsAccount.organizationId, orgId),
      });

      // Reputation is the only reason left to talk to CloudWatch. A per-account
      // failure must not be silently rendered as a healthy 0% — classify it,
      // log it, and count it so the tile can admit the figure is incomplete.
      const reputationResults = await Promise.all(
        accounts.map(async (account) => {
          try {
            return await getSESReputationMetrics(account.id);
          } catch (error) {
            const kind: CloudWatchErrorKind = getCloudWatchErrorKind(error);
            log.warn(
              { awsAccountId: account.id, kind, err: error },
              "SES reputation read failed for one AWS account"
            );
            return null;
          }
        })
      );
      const awsAccountsUnavailable = reputationResults.filter(
        (r) => r === null
      ).length;

      const dailyMap = await getEmailMetricsFromPostgres(
        orgId,
        startTime,
        endTime,
        timezone
      );

      let totalSent = 0;
      let totalDelivered = 0;
      let totalBounced = 0;
      let totalComplaints = 0;
      let totalRenderingFailures = 0;
      for (const day of dailyMap.values()) {
        totalSent += day.sent;
        totalDelivered += day.delivered;
        totalBounced += day.bounced;
        totalComplaints += day.complaints;
        totalRenderingFailures += day.renderingFailures;
      }

      // `message_send` counts `sent` as status != 'failed' and `renderingFailures`
      // as status = 'failed' — disjoint sets. Unlike CloudWatch's `Send`, the
      // total already excludes failures, so subtracting them again (as this did
      // when CloudWatch was the source) would deflate the denominator and
      // overstate every rate below.
      const effectiveSent = totalSent;

      const deliveryRate =
        effectiveSent > 0 ? (totalDelivered / effectiveSent) * 100 : 0;

      const reputationBounceRate = reputationResults.reduce<number | null>(
        (worst, r) => {
          if (r?.bounceRate == null) {
            return worst;
          }
          const pct = r.bounceRate * 100;
          return worst === null ? pct : Math.max(worst, pct);
        },
        null
      );
      const reputationComplaintRate = reputationResults.reduce<number | null>(
        (worst, r) => {
          if (r?.complaintRate == null) {
            return worst;
          }
          const pct = r.complaintRate * 100;
          return worst === null ? pct : Math.max(worst, pct);
        },
        null
      );

      const windowBounceRate =
        effectiveSent > 0 ? (totalBounced / effectiveSent) * 100 : 0;
      const windowComplaintRate =
        effectiveSent > 0 ? (totalComplaints / effectiveSent) * 100 : 0;

      const bounceRate = reputationBounceRate ?? windowBounceRate;
      const complaintRate = reputationComplaintRate ?? windowComplaintRate;

      const dateRange = generateDateRange(startTime, endTime, timezone);
      const defaults = {
        sent: 0,
        delivered: 0,
        bounced: 0,
        complaints: 0,
        opens: 0,
        clicks: 0,
        renderingFailures: 0,
      };
      const filled = gapFillDates(dateRange, dailyMap, defaults);

      const volume = filled.map((d) => ({
        date: d.date,
        timestamp: d.timestamp,
        sent: Math.round(d.sent),
        delivered: Math.round(d.delivered),
        bounced: Math.round(d.bounced),
        opens: Math.round(d.opens),
        clicks: Math.round(d.clicks),
      }));

      const engagement = filled.map((d) => {
        const openRate = d.delivered > 0 ? (d.opens / d.delivered) * 100 : 0;
        const clickRate = d.delivered > 0 ? (d.clicks / d.delivered) * 100 : 0;
        return {
          date: d.date,
          timestamp: d.timestamp,
          openRate: Number(openRate.toFixed(1)),
          clickRate: Number(clickRate.toFixed(1)),
        };
      });

      const hasReputation =
        reputationBounceRate !== null || reputationComplaintRate !== null;
      const meta: EmailChartMeta = {
        reputationScope: resolveReputationScope(hasReputation, effectiveSent),
        awsAccountCount: accounts.length,
        awsAccountsUnavailable,
        generatedAt: Date.now(),
      };

      return {
        overview: {
          totalSent: Math.round(totalSent),
          totalDelivered: Math.round(totalDelivered),
          totalBounced: Math.round(totalBounced),
          totalComplaints: Math.round(totalComplaints),
          totalRenderingFailures: Math.round(totalRenderingFailures),
          deliveryRate: Number(deliveryRate.toFixed(2)),
          bounceRate: Number(bounceRate.toFixed(2)),
          complaintRate: Number(complaintRate.toFixed(2)),
        },
        volume,
        engagement,
        meta,
      };
    },
    ["email-chart", orgId, String(days), timezone],
    { revalidate: 300, tags: [`email-chart-${orgId}`] }
  );
}

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
    // Default 7, matching the emails table's default window. The chart used to
    // default to 30 over a 7-day table, which made them disagree by design.
    const days = Math.min(
      365,
      Math.max(1, Number.parseInt(searchParams.get("days") || "7", 10))
    );
    const timezone = validateTimezone(searchParams.get("tz"));

    const getCachedData = buildEmailChartData(
      orgWithMembership.id,
      days,
      timezone
    );
    const result = await getCachedData();
    return NextResponse.json(result);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/email-chart",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching email chart data");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
