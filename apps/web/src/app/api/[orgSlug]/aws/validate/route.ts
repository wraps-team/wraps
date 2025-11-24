import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
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

    // Parse request body
    const body = await request.json();
    const { roleArn, externalId } = body;

    if (!(roleArn && externalId)) {
      return NextResponse.json(
        { error: "Role ARN and External ID are required" },
        { status: 400 }
      );
    }

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

    // Extract region from role ARN or use default
    // For cross-account roles, region is typically us-east-1 for STS
    const stsClient = new STSClient({ region: "us-east-1" });

    try {
      // Test the role assumption
      const assumeRoleCommand = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `wraps-onboarding-validation-${Date.now()}`,
        ExternalId: externalId,
        DurationSeconds: 900, // 15 minutes (minimum)
      });

      await stsClient.send(assumeRoleCommand);

      // Role assumption successful - save the connection
      const existingAccount = await db.query.awsAccount.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.organizationId, orgWithMembership.id),
            eq(table.externalId, externalId)
          ),
      });

      if (existingAccount) {
        // Update existing account
        await db
          .update(awsAccount)
          .set({
            roleArn,
            accountId,
            isVerified: true,
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(awsAccount.id, existingAccount.id));
      } else {
        // Create new account
        await db.insert(awsAccount).values({
          organizationId: orgWithMembership.id,
          name: `AWS Account ${accountId}`,
          accountId,
          region: "us-east-1", // Default region
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
    } catch (error: any) {
      console.error("Error assuming role:", error);

      // Provide user-friendly error messages
      let errorMessage = "Failed to validate AWS connection";

      if (error.name === "AccessDenied") {
        errorMessage =
          "Access denied. Please verify the External ID matches the CloudFormation stack output.";
      } else if (error.name === "InvalidClientTokenId") {
        errorMessage =
          "Invalid credentials. Please check your AWS configuration.";
      } else if (error.message?.includes("not authorized to perform")) {
        errorMessage =
          "The role does not have permission to be assumed. Please check the trust policy.";
      }

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
  } catch (error) {
    console.error("Error validating AWS connection:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
