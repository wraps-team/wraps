import { auth } from "@wraps/auth";
import { NextResponse } from "next/server";
import { getTopPerformersFromPostgres } from "@/lib/analytics-fallback";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

/**
 * Best-performing subjects for the analytics page.
 *
 * Read from Postgres `message_send`, grouped by subject. The DynamoDB read this
 * replaces was per AWS ACCOUNT — it ranked subjects from mail sent outside
 * Wraps alongside the org's own — and it sampled only the newest 1,000 events
 * per account, so the "top" list was really "top of an arbitrary recent slice".
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
    const days = Math.min(
      365,
      Math.max(1, Number.parseInt(searchParams.get("days") || "30", 10))
    );
    const limit = Math.min(
      500,
      Math.max(1, Number.parseInt(searchParams.get("limit") || "10", 10))
    );
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

    const topPerformers = await getTopPerformersFromPostgres(
      orgWithMembership.id,
      startTime,
      endTime,
      limit
    );

    return NextResponse.json(topPerformers);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/top-performers",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching top performers");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
