import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getEmailMetricsFromPostgres } from "@/lib/analytics-fallback";
import {
  type EmailChartMeta,
  resolveReputationScope,
} from "@/lib/analytics-scope";
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

/**
 * Headline totals for the analytics page.
 *
 * Totals come from Postgres `message_send`. They previously came from
 * `getSESMetricsSummary`, which reads undimensioned `AWS/SES` metrics — those
 * are account-wide and include SES traffic sent outside Wraps, so the tiles
 * could report thousands of sends for an org whose emails list was empty.
 *
 * CloudWatch is still read for one thing: SES account-level reputation. That
 * figure is account-scoped by nature and is labelled as such via `meta`, rather
 * than being blended silently into window-scoped arithmetic.
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

    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/overview",
      method: "GET",
      organizationId: orgWithMembership.id,
    });

    const { searchParams } = new URL(request.url);
    const days = Math.min(
      365,
      Math.max(1, Number.parseInt(searchParams.get("days") || "30", 10))
    );
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    // A per-account reputation failure must not render as a healthy 0%.
    // Classify it, log it, and count it so the UI can admit the figure is
    // incomplete. AWS SDK v3 error names are unreliable, so the classifier
    // checks name AND message.
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

    const pgData = await getEmailMetricsFromPostgres(
      orgWithMembership.id,
      startTime,
      endTime
    );

    let totalSent = 0;
    let totalDelivered = 0;
    let totalBounced = 0;
    let totalComplaints = 0;
    let totalOpens = 0;
    let totalClicks = 0;
    let totalRenderingFailures = 0;
    for (const m of pgData.values()) {
      totalSent += m.sent;
      totalDelivered += m.delivered;
      totalBounced += m.bounced;
      totalComplaints += m.complaints;
      totalOpens += m.opens;
      totalClicks += m.clicks;
      totalRenderingFailures += m.renderingFailures;
    }

    // `message_send` counts `sent` as status != 'failed' and `renderingFailures`
    // as status = 'failed' — disjoint sets. Unlike CloudWatch's `Send`, the
    // total already excludes failures, so subtracting them again (as this did
    // when CloudWatch was the source) would deflate the denominator and
    // overstate every rate below.
    const effectiveSent = totalSent;

    const deliveryRate =
      effectiveSent > 0 ? (totalDelivered / effectiveSent) * 100 : 0;

    // Open and click rates are new here. SES publishes no Open/Click metrics to
    // CloudWatch unless the configuration set has a CloudWatch event
    // destination, and Wraps deploys an EventBridge one, so while this route
    // read CloudWatch these tiles could only ever show a dash. Postgres records
    // both, bot-filtered. Rates are of delivered mail, matching the emails
    // chart, because an undelivered message cannot be opened.
    const openRate =
      totalDelivered > 0 ? (totalOpens / totalDelivered) * 100 : 0;
    const clickRate =
      totalDelivered > 0 ? (totalClicks / totalDelivered) * 100 : 0;

    // SES computes reputation over its own rolling window covering the whole
    // account history, which is what the SES console shows. Take the worst rate
    // across accounts: each account's reputation is independent and any bad
    // actor affects the org's standing. Rates are decimals (0-1).
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

    const hasReputation =
      reputationBounceRate !== null || reputationComplaintRate !== null;
    // Which publish time to quote when several AWS accounts contribute: the
    // OLDEST, so the freshness claim on the tile is true of every number
    // shown - including the worst-of-N rate, which may well come from the
    // account that stopped sending first.
    const reputationAsOf = reputationResults.reduce<number | null>(
      (oldest, r) => {
        if (!r || r.asOf == null) {
          return oldest;
        }
        if (r.bounceRate == null && r.complaintRate == null) {
          return oldest;
        }
        const publishedAt = r.asOf.getTime();
        return oldest === null ? publishedAt : Math.min(oldest, publishedAt);
      },
      null
    );
    const meta: EmailChartMeta = {
      reputationScope: resolveReputationScope(hasReputation, effectiveSent),
      awsAccountCount: accounts.length,
      awsAccountsUnavailable,
      reputationAsOf,
      generatedAt: Date.now(),
    };

    return NextResponse.json({
      totalSent: Math.round(totalSent),
      totalDelivered: Math.round(totalDelivered),
      totalBounced: Math.round(totalBounced),
      totalComplaints: Math.round(totalComplaints),
      totalOpens: Math.round(totalOpens),
      totalClicks: Math.round(totalClicks),
      totalRenderingFailures: Math.round(totalRenderingFailures),
      deliveryRate: Number(deliveryRate.toFixed(2)),
      openRate: Number(openRate.toFixed(2)),
      clickRate: Number(clickRate.toFixed(2)),
      bounceRate: Number(bounceRate.toFixed(2)),
      complaintRate: Number(complaintRate.toFixed(2)),
      meta,
    });
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/overview",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching analytics overview");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
