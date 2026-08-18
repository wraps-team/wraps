import { auth } from "@wraps/auth";
import { NextResponse } from "next/server";
import { getRecentActivityFromPostgres } from "@/lib/analytics-fallback";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

/**
 * Recent email activity feed for the analytics page.
 *
 * Read from Postgres `message_send`. The DynamoDB read this replaces was per
 * AWS ACCOUNT, so the feed could show activity for mail Wraps never sent, whose
 * rows then 404'd when clicked because no message existed to open.
 *
 * Each item carries an explicit `messageId` for the detail link. The client used
 * to reconstruct one by splitting the composite DynamoDB id on "-" and dropping
 * the last segment, which mangles a Postgres UUID into a dead link.
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
    const limit = Math.min(
      500,
      Math.max(1, Number.parseInt(searchParams.get("limit") || "20", 10))
    );

    const recentActivity = await getRecentActivityFromPostgres(
      orgWithMembership.id,
      limit
    );

    return NextResponse.json(recentActivity);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/recent-activity",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching recent activity");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
