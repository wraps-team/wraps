import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { queryEmailEvents } from "@/lib/aws/dynamodb";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

type ComplaintDataPoint = {
  date: string;
  timestamp: number;
  complaints: number;
  sent: number;
  complaintRate: number; // Percentage
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;

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

    // Get time range from query params
    const { searchParams } = new URL(request.url);
    const days = Number.parseInt(searchParams.get("days") || "30", 10);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch all events for all accounts (need both Send and Complaint)
    const allEvents = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await queryEmailEvents({
            awsAccountId: account.id,
            startTime,
            endTime,
            limit: 10_000,
          });
        } catch (error) {
          console.error(
            `Failed to fetch events for account ${account.id}:`,
            error
          );
          return [];
        }
      })
    );

    // Flatten all events
    const events = allEvents.flat();
    const complaintEvents = events.filter(
      (event) => event.eventType === "Complaint"
    );
    const sendEvents = events.filter((event) => event.eventType === "Send");

    // Group by date - track both complaints and sends
    const dataPointsMap = new Map<
      string,
      { complaints: number; sent: number }
    >();

    // Count sent emails by date
    for (const event of sendEvents) {
      const date = new Date(event.sentAt).toISOString().split("T")[0];
      const existing = dataPointsMap.get(date) || { complaints: 0, sent: 0 };
      existing.sent++;
      dataPointsMap.set(date, existing);
    }

    // Count complaints by date
    for (const event of complaintEvents) {
      const date = new Date(event.sentAt).toISOString().split("T")[0];
      const existing = dataPointsMap.get(date) || { complaints: 0, sent: 0 };
      existing.complaints++;
      dataPointsMap.set(date, existing);
    }

    // Convert to array and sort by date
    const dataPoints: ComplaintDataPoint[] = Array.from(
      dataPointsMap.entries()
    ).map(([date, values]) => {
      const complaintRate =
        values.sent > 0 ? (values.complaints / values.sent) * 100 : 0;

      return {
        date,
        timestamp: new Date(date).getTime(),
        complaints: values.complaints,
        sent: values.sent,
        complaintRate: Number.parseFloat(complaintRate.toFixed(4)), // 4 decimals for small percentages
      };
    });

    dataPoints.sort((a, b) => a.timestamp - b.timestamp);

    return NextResponse.json(dataPoints);
  } catch (error) {
    console.error("Error fetching complaint analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
