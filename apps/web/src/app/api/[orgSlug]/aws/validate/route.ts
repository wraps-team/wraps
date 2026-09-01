import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRoutePermission } from "@/app/api/shared/route-permission";
import { AssumeRoleError, assumeRole } from "@/lib/aws/assume-role";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";
import { getOrganizationPlan, isSelfHosted } from "@/lib/plan-limits";
import { canAddAwsAccount, getAwsAccountLimitMessage } from "@/lib/plans";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;
    const log = createRequestLogger({
      path: "/api/[orgSlug]/aws/validate",
      method: "POST",
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

    const denied = requireRoutePermission(
      orgWithMembership.userRole,
      "awsAccounts",
      ["write"]
    );
    if (denied) return denied;

    // Parse request body
    const body = await request.json();
    const { roleArn, externalId, region: clientRegion } = body;

    if (!(roleArn && externalId)) {
      return NextResponse.json(
        { error: "Role ARN and External ID are required" },
        { status: 400 }
      );
    }

    // Validate external ID format: wraps_<uuid/hex> or CloudFormation stack ARN
    const isWrapsId = /^wraps[_-][a-f0-9-]{32,36}$/.test(externalId);
    const isCfnStackId =
      /^arn:aws:cloudformation:[a-z0-9-]+:\d{12}:stack\/[a-zA-Z0-9-]+\/[a-f0-9-]+$/.test(
        externalId
      );
    if (!(isWrapsId || isCfnStackId)) {
      return NextResponse.json(
        {
          error:
            "Invalid External ID format. Expected a Wraps ID (wraps_...) or CloudFormation stack ARN.",
        },
        { status: 400 }
      );
    }

    // Extract region from CloudFormation stack ARN if present, fall back to client-provided or default
    const region =
      (isCfnStackId ? externalId.split(":")[3] : null) ||
      clientRegion ||
      "us-east-1";

    // Validate role ARN format
    const roleArnRegex = /^arn:aws:iam::(\d{12}):role\/(.+)$/;
    const match = roleArn.match(roleArnRegex);

    if (!match) {
      return NextResponse.json(
        { error: "Invalid IAM Role ARN format" },
        { status: 400 }
      );
    }

    const accountId = match[1];
    const roleName = match[2];

    try {
      // Test the role assumption using our helper that handles Vercel OIDC correctly
      await assumeRole({
        roleArn,
        externalId,
        sessionName: `wraps-onboarding-validation-${Date.now()}`,
      });

      // Role assumption successful - save the connection
      // Look up by accountId (from the role ARN) to handle multiple AWS accounts per org
      const existingAccount = await db.query.awsAccount.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.organizationId, orgWithMembership.id),
            eq(table.accountId, accountId)
          ),
      });

      if (existingAccount) {
        // Update existing account
        await db
          .update(awsAccount)
          .set({
            roleArn,
            externalId,
            region,
            isVerified: true,
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(awsAccount.id, existingAccount.id));
      } else {
        // Check AWS account limit before creating a new account.
        // `getOrganizationPlan` honours a self-host licence, requires an
        // active/trialing subscription on a real paid plan, and defaults to
        // "free". The hand-rolled query this replaced defaulted to legacy
        // "starter" (maxAwsAccounts: 3), handing unsubscribed orgs a paid
        // tier's limit.
        const existingAccountCount = await db.query.awsAccount.findMany({
          where: (table, { eq }) =>
            eq(table.organizationId, orgWithMembership.id),
        });

        const planId = await getOrganizationPlan(orgWithMembership.id);
        if (
          !(
            isSelfHosted() ||
            canAddAwsAccount(planId, existingAccountCount.length)
          )
        ) {
          return NextResponse.json(
            {
              error: "AWS account limit reached",
              message: getAwsAccountLimitMessage(planId),
              limitReached: true,
            },
            { status: 403 }
          );
        }

        // Create new account
        await db.insert(awsAccount).values({
          organizationId: orgWithMembership.id,
          name: `AWS Account ${accountId}`,
          accountId,
          region,
          roleArn,
          externalId,
          isVerified: true,
          lastVerifiedAt: new Date(),
          createdBy: session.user.id,
        });
      }

      return NextResponse.json({
        success: true,
        message: "AWS account connected successfully",
        accountId,
        roleName,
      });
    } catch (error: unknown) {
      log.error({ err: error }, "Error assuming role");

      let errorMessage = "Failed to validate AWS connection";
      if (error instanceof AssumeRoleError) {
        errorMessage =
          error.code === "ACCESS_DENIED"
            ? "Access denied. Please verify the External ID matches the CloudFormation stack output."
            : error.code === "INVALID_TRUST_POLICY"
              ? "The role does not have permission to be assumed. Please check the trust policy."
              : error.code === "INVALID_BACKEND_CREDENTIALS"
                ? "We could not validate your connection right now. Please try again shortly."
                : error.message;
      }

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/aws/validate",
      method: "POST",
    });
    log.error({ err: error }, "Error validating AWS connection");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
