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

type SuppressionDataPoint = {
  date: string;
  timestamp: number;
  accountLevel: number; // OnAccountSuppressionList
  globalLevel: number; // Suppressed (AWS global suppression list)
  total: number;
  sent: number;
  suppressionRate: number; // Percentage
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/suppression",
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

    // Fetch all events for all accounts (need both Send and Suppressed)
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
    const suppressedEvents = events.filter(
      (event) => event.eventType === "Suppressed"
    );
    const sendEvents = events.filter((event) => event.eventType === "Send");

    // Group by date - track both suppressions and sends
    const dataPointsMap = new Map<
      string,
      {
        accountLevel: number;
        globalLevel: number;
        sent: number;
      }
    >();

    // Count sent emails by date
    for (const event of sendEvents) {
      const date = new Date(event.sentAt).toISOString().split("T")[0];
      const existing = dataPointsMap.get(date) || {
        accountLevel: 0,
        globalLevel: 0,
        sent: 0,
      };
      existing.sent++;
      dataPointsMap.set(date, existing);
    }

    // Count suppressions by reason and date
    for (const event of suppressedEvents) {
      // Parse additionalData to get suppression reason
      let reason = "Suppressed";
      if (event.additionalData) {
        try {
          const data = JSON.parse(event.additionalData);
          reason = data.reason || "Suppressed";
        } catch {
          // Ignore parse errors
        }
      }

      // Get the date (YYYY-MM-DD) from sentAt timestamp
      const date = new Date(event.sentAt).toISOString().split("T")[0];

      const existing = dataPointsMap.get(date) || {
        accountLevel: 0,
        globalLevel: 0,
        sent: 0,
      };

      // Categorize by suppression reason
      if (reason === "OnAccountSuppressionList") {
        existing.accountLevel++;
      } else {
        // "Suppressed" or other reasons go to globalLevel
        existing.globalLevel++;
      }

      dataPointsMap.set(date, existing);
    }

    // Gap-fill every day in the range including today, then compute rates
    const dateRange = generateDateRange(startTime, endTime);
    const dataPoints: SuppressionDataPoint[] = gapFillDates(
      dateRange,
      dataPointsMap,
      { accountLevel: 0, globalLevel: 0, sent: 0 }
    ).map((d) => {
      const total = d.accountLevel + d.globalLevel;
      const suppressionRate = d.sent > 0 ? (total / d.sent) * 100 : 0;
      return {
        ...d,
        total,
        suppressionRate: Number.parseFloat(suppressionRate.toFixed(2)),
      };
    });

    return NextResponse.json(dataPoints);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/suppression",
      method: "GET",
    });
    log.error(
      { err: serializeError(error) },
      "Error fetching suppression analytics"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
