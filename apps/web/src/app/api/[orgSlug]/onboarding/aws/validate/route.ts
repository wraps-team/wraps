import {
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  STSClient,
} from "@aws-sdk/client-sts";
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
    const body = await request.json();
    const { roleArn, externalId } = body;

    if (!(roleArn && externalId)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

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

    // Validate AWS Credentials by assuming the role
    const sts = new STSClient({ region: "us-east-1" });

    try {
      const assumeRoleCommand = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "WrapsOnboardingValidation",
        ExternalId: externalId,
      });

      const assumedRole = await sts.send(assumeRoleCommand);

      if (!assumedRole.Credentials) {
        throw new Error("Failed to retrieve credentials from AssumeRole");
      }

      // Verify we can use the credentials and get the Account ID
      const tempSts = new STSClient({
        region: "us-east-1",
        credentials: {
          accessKeyId: assumedRole.Credentials.AccessKeyId!,
          secretAccessKey: assumedRole.Credentials.SecretAccessKey!,
          sessionToken: assumedRole.Credentials.SessionToken,
        },
      });

      const identity = await tempSts.send(new GetCallerIdentityCommand({}));
      const accountId = identity.Account;

      if (!accountId) {
        throw new Error("Failed to retrieve Account ID");
      }

      // Save to database
      // Check if account already exists for this org
      const existingAccount = await db.query.awsAccount.findFirst({
        where: eq(awsAccount.organizationId, orgWithMembership.id),
      });

      if (existingAccount) {
        await db
          .update(awsAccount)
          .set({
            name: `AWS Account (${accountId})`,
            accountId,
            roleArn,
            externalId,
            region: "us-east-1", // Defaulting to us-east-1 for now
            isVerified: true,
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(awsAccount.id, existingAccount.id));
      } else {
        await db.insert(awsAccount).values({
          organizationId: orgWithMembership.id,
          name: `AWS Account (${accountId})`,
          accountId,
          roleArn,
          externalId,
          region: "us-east-1",
          isVerified: true,
          lastVerifiedAt: new Date(),
          createdBy: session.user.id,
        });
      }

      return NextResponse.json({
        success: true,
        accountId,
      });
    } catch (awsError: any) {
      console.error("AWS Validation Error:", awsError);
      return NextResponse.json(
        { error: `Failed to validate AWS connection: ${awsError.message}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error in AWS validation route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
