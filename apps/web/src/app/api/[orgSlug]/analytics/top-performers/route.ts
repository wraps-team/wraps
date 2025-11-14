import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getEmailEngagementMetrics } from "@/lib/aws/dynamodb";
import { getOrganizationWithMembership } from "@/lib/organization";

interface RouteContext {
  params: Promise<{
    orgSlug: string;
  }>;
}

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
    const limit = Number.parseInt(searchParams.get("limit") || "10", 10);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch engagement metrics from all accounts
    const allEmailMetrics = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await getEmailEngagementMetrics({
            awsAccountId: account.id,
            startTime,
            endTime,
            limit: 1000, // Get more initially, will filter later
          });
        } catch (error) {
          console.error(
            `Failed to fetch email metrics for account ${account.id}:`,
            error
          );
          return [];
        }
      })
    );

    // Flatten and filter for delivered emails only
    const deliveredEmails = allEmailMetrics
      .flat()
      .filter((email) => email.hasDelivered);

    // Calculate engagement rates
    const emailsWithRates = deliveredEmails.map((email) => {
      const recipientCount = email.to.length;
      const openRate =
        recipientCount > 0 ? (email.opens / recipientCount) * 100 : 0;
      const clickRate =
        recipientCount > 0 ? (email.clicks / recipientCount) * 100 : 0;

      return {
        subject: email.subject,
        openRate: Number(openRate.toFixed(1)),
        clickRate: Number(clickRate.toFixed(1)),
        sent: recipientCount,
        opens: email.opens,
        clicks: email.clicks,
        sentAt: email.sentAt,
      };
    });

    // Sort by engagement score (clicks weighted higher than opens)
    const topPerformers = emailsWithRates
      .sort((a, b) => {
        const scoreA = a.clicks * 2 + a.opens;
        const scoreB = b.clicks * 2 + b.opens;
        return scoreB - scoreA;
      })
      .slice(0, limit);

    return NextResponse.json(topPerformers);
  } catch (error) {
    console.error("Error fetching top performers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
