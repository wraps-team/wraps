import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getRecentEmailActivity } from "@/lib/aws/dynamodb";
import { createRequestLogger, serializeError } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/recent-activity",
      method: "GET",
      orgSlug,
    });

    // Authenticate user
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify organization membership
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get limit from query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      500,
      Math.max(1, Number.parseInt(searchParams.get("limit") || "20", 10))
    );

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch recent activity from all accounts
    const allActivity = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await getRecentEmailActivity({
            awsAccountId: account.id,
            limit: 50, // Get more initially
          });
        } catch (error) {
          log.error(
            { err: serializeError(error), accountId: account.id },
            "Failed to fetch recent activity for account"
          );
          return [];
        }
      })
    );

    // Flatten, sort by timestamp, and limit
    const recentActivity = allActivity
      .flat()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map((activity) => ({
        id: `${activity.messageId}-${activity.timestamp}`,
        subject: activity.subject,
        eventType: activity.eventType,
        timestamp: activity.timestamp,
        timestampFormatted: new Date(activity.timestamp).toISOString(),
        metadata: activity.metadata,
      }));

    return NextResponse.json(recentActivity);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/recent-activity",
      method: "GET",
    });
    log.error({ err: serializeError(error) }, "Error fetching recent activity");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
