import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount, organizationExtension } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
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

    // Get organization extension with onboarding status
    const extension = await db.query.organizationExtension.findFirst({
      where: eq(organizationExtension.organizationId, orgWithMembership.id),
    });

    // Check if AWS account is connected
    const awsAccounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    const hasAwsAccount = awsAccounts.length > 0;

    return NextResponse.json({
      completed: extension?.onboardingCompleted ?? false,
      completedAt: extension?.onboardingCompletedAt,
      hasAwsAccount,
      awsAccountCount: awsAccounts.length,
    });
  } catch (error) {
    console.error("Error fetching onboarding status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
