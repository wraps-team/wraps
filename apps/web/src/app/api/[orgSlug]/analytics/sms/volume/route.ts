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

export type SMSVolumeDataPoint = {
  date: string;
  timestamp: number;
  sent: number;
  delivered: number;
  failed: number;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;
    const { searchParams } = new URL(request.url);
    const days = Math.min(
      365,
      Math.max(1, Number.parseInt(searchParams.get("days") || "30", 10))
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
      return NextResponse.json<SMSVolumeDataPoint[]>([]);
    }

    // Calculate time range
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    // Fetch SMS events from all accounts
    const allEvents = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await querySMSEvents({
            awsAccountId: account.id,
            startTime,
            endTime,
            limit: 10_000,
          });
        } catch {
          return [];
        }
      })
    );

    // Flatten events
    const events = allEvents.flat();

    // Group by day and status
    const volumeByDay = new Map<
      string,
      { sent: number; delivered: number; failed: number }
    >();

    // Initialize all days in the range
    for (let i = 0; i <= days; i++) {
      const date = new Date(startTime.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split("T")[0];
      volumeByDay.set(dateKey, { sent: 0, delivered: 0, failed: 0 });
    }

    // Aggregate events by day
    for (const event of events) {
      const date = new Date(event.sentAt);
      const dateKey = date.toISOString().split("T")[0];

      const existing = volumeByDay.get(dateKey) || {
        sent: 0,
        delivered: 0,
        failed: 0,
      };

      const status = event.eventStatus.toLowerCase();

      // Count as sent
      existing.sent++;

      // Also count delivery status
      if (status === "delivered" || status === "delivery") {
        existing.delivered++;
      } else if (
        status === "failed" ||
        status === "failure" ||
        status === "blocked" ||
        status === "invalid"
      ) {
        existing.failed++;
      }

      volumeByDay.set(dateKey, existing);
    }

    // Convert to array and sort by date
    const volumeData: SMSVolumeDataPoint[] = Array.from(volumeByDay.entries())
      .map(([date, counts]) => ({
        date,
        timestamp: new Date(date).getTime(),
        sent: counts.sent,
        delivered: counts.delivered,
        failed: counts.failed,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    return NextResponse.json<SMSVolumeDataPoint[]>(volumeData);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/sms/volume",
      method: "GET",
    });
    log.error({ err: serializeError(error) }, "Error fetching SMS volume data");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
