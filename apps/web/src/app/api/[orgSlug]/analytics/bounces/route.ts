import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { gapFillDates, generateDateRange } from "@/lib/analytics-utils";
import { queryEmailEvents } from "@/lib/aws/dynamodb";
import { createRequestLogger, serializeError } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

type BounceDataPoint = {
  date: string;
  timestamp: number;
  permanent: number;
  transient: number;
  undetermined: number;
  total: number;
  sent: number;
  bounceRate: number; // Percentage
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/bounces",
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

    // Get time range from query params
    const { searchParams } = new URL(request.url);
    const days = Math.min(
      365,
      Math.max(1, Number.parseInt(searchParams.get("days") || "30", 10))
    );
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch all events for all accounts (need both Send and Bounce)
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
          log.error(
            { err: serializeError(error), accountId: account.id },
            "Failed to fetch events for account"
          );
          return [];
        }
      })
    );

    // Flatten all events
    const events = allEvents.flat();
    const bounceEvents = events.filter((event) => event.eventType === "Bounce");
    const sendEvents = events.filter((event) => event.eventType === "Send");

    // Group by date - track both bounces and sends
    const dataPointsMap = new Map<
      string,
      {
        permanent: number;
        transient: number;
        undetermined: number;
        sent: number;
      }
    >();

    // Count sent emails by date
    for (const event of sendEvents) {
      const date = new Date(event.sentAt).toISOString().split("T")[0];
      const existing = dataPointsMap.get(date) || {
        permanent: 0,
        transient: 0,
        undetermined: 0,
        sent: 0,
      };
      existing.sent++;
      dataPointsMap.set(date, existing);
    }

    // Count bounces by type and date
    for (const event of bounceEvents) {
      // Parse additionalData to get bounce type
      let bounceType = "Undetermined";
      if (event.additionalData) {
        try {
          const data = JSON.parse(event.additionalData);
          bounceType = data.bounceType || "Undetermined";
        } catch {
          // Ignore parse errors
        }
      }

      // Get the date (YYYY-MM-DD) from sentAt timestamp
      const date = new Date(event.sentAt).toISOString().split("T")[0];

      const existing = dataPointsMap.get(date) || {
        permanent: 0,
        transient: 0,
        undetermined: 0,
        sent: 0,
      };

      // Increment the appropriate bounce type counter
      if (bounceType === "Permanent") {
        existing.permanent++;
      } else if (bounceType === "Transient") {
        existing.transient++;
      } else {
        existing.undetermined++;
      }

      dataPointsMap.set(date, existing);
    }

    // Gap-fill every day in the range including today, then compute rates
    const dateRange = generateDateRange(startTime, endTime);
    const dataPoints: BounceDataPoint[] = gapFillDates(
      dateRange,
      dataPointsMap,
      { permanent: 0, transient: 0, undetermined: 0, sent: 0 }
    ).map((d) => {
      const total = d.permanent + d.transient + d.undetermined;
      const bounceRate = d.sent > 0 ? (total / d.sent) * 100 : 0;
      return {
        ...d,
        total,
        bounceRate: Number.parseFloat(bounceRate.toFixed(2)),
      };
    });

    return NextResponse.json(dataPoints);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/bounces",
      method: "GET",
    });
    log.error(
      { err: serializeError(error) },
      "Error fetching bounce analytics"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
