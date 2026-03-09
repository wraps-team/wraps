import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { messageSend } from "@wraps/db/schema/batch";
import { and, count, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { gapFillDates, generateDateRange } from "@/lib/analytics-utils";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

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
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    const pgData = await db
      .select({
        date: sql<string>`to_char(${messageSend.sentAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        delivered: count(messageSend.deliveredAt),
        opens: count(messageSend.openedAt),
        clicks: count(messageSend.clickedAt),
      })
      .from(messageSend)
      .where(
        and(
          eq(messageSend.organizationId, orgWithMembership.id),
          eq(messageSend.channel, "email"),
          isNotNull(messageSend.sentAt),
          gte(messageSend.sentAt, startTime),
          lte(messageSend.sentAt, endTime)
        )
      )
      .groupBy(
        sql`to_char(${messageSend.sentAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
      )
      .orderBy(
        sql`to_char(${messageSend.sentAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
      );

    const dateRange = generateDateRange(startTime, endTime);
    const pgMap = new Map(
      pgData.map((d) => {
        const delivered = Number(d.delivered);
        const opens = Number(d.opens);
        const clicks = Number(d.clicks);
        const openRate = delivered > 0 ? (opens / delivered) * 100 : 0;
        const clickRate = delivered > 0 ? (clicks / delivered) * 100 : 0;
        const ctr = opens > 0 ? (clicks / opens) * 100 : 0;
        return [
          d.date,
          {
            openRate: Number(openRate.toFixed(1)),
            clickRate: Number(clickRate.toFixed(1)),
            ctr: Number(ctr.toFixed(1)),
          },
        ] as const;
      })
    );

    return NextResponse.json(
      gapFillDates(
        dateRange,
        pgMap as Map<
          string,
          { openRate: number; clickRate: number; ctr: number }
        >,
        { openRate: 0, clickRate: 0, ctr: 0 }
      )
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
