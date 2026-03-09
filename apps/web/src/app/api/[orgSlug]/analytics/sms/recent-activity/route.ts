import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { querySMSEvents } from "@/lib/aws/sms-voice";
import { createRequestLogger, serializeError } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export type SMSRecentActivityItem = {
  id: string;
  destinationNumber: string;
  eventType: string;
  eventStatus: string;
  timestamp: number;
  segments?: number;
  priceInUsd?: number;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      500,
      Math.max(1, Number.parseInt(searchParams.get("limit") || "20", 10))
    );

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

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json<SMSRecentActivityItem[]>([]);
    }

    // Query last 7 days of activity
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch SMS events from all accounts
    const allEvents = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await querySMSEvents({
            awsAccountId: account.id,
            startTime,
            endTime,
            limit: limit * 2, // Get extra to merge and sort
          });
        } catch {
          return [];
        }
      })
    );

    // Flatten, sort by timestamp (newest first), and limit
    const events = allEvents
      .flat()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    // Map to response format
    const activities: SMSRecentActivityItem[] = events.map((event) => ({
      id: `${event.messageId}-${event.createdAt}`,
      destinationNumber: event.destinationNumber,
      eventType: event.eventType,
      eventStatus: event.eventStatus,
      timestamp: event.createdAt,
      segments: event.segments,
      priceInUsd: event.priceInUsd,
    }));

    return NextResponse.json<SMSRecentActivityItem[]>(activities);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/sms/recent-activity",
      method: "GET",
    });
    log.error(
      { err: serializeError(error) },
      "Error fetching SMS recent activity"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
