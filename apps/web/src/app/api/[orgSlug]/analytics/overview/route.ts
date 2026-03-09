import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { messageSend } from "@wraps/db/schema/batch";
import { and, count, eq, gte, isNotNull, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
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
      Math.max(1, Number.parseInt(searchParams.get("days") || "30", 10))
    );
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    const [overview] = await db
      .select({
        totalSent: count(),
        totalDelivered: count(messageSend.deliveredAt),
        totalBounced: count(messageSend.bouncedAt),
        totalComplaints: count(messageSend.complainedAt),
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
      );

    const totalSent = Number(overview.totalSent);
    const totalDelivered = Number(overview.totalDelivered);
    const totalBounced = Number(overview.totalBounced);
    const totalComplaints = Number(overview.totalComplaints);

    return NextResponse.json({
      totalSent,
      totalDelivered,
      totalBounced,
      totalComplaints,
      deliveryRate:
        totalSent > 0
          ? Number(((totalDelivered / totalSent) * 100).toFixed(2))
          : 0,
      bounceRate:
        totalSent > 0
          ? Number(((totalBounced / totalSent) * 100).toFixed(2))
          : 0,
      complaintRate:
        totalSent > 0
          ? Number(((totalComplaints / totalSent) * 100).toFixed(2))
          : 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
