import {
  ListConfigurationSetsCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRoutePermission } from "@/app/api/shared/route-permission";
import { trackAwsConnected } from "@/lib/activation-tracking";
import { assumeRole } from "@/lib/aws/assume-role";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

async function detectConfigSetName(
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  },
  region: string
): Promise<string | null> {
  try {
    const ses = new SESv2Client({ region, credentials });
    const { ConfigurationSets } = await ses.send(
      new ListConfigurationSetsCommand({})
    );
    const names = (ConfigurationSets ?? []).filter((n) =>
      n.startsWith("wraps-email-")
    );
    // Prefer per-domain sets (wraps-email-<domain>) over legacy wraps-email-tracking
    return names.find((n) => n !== "wraps-email-tracking") ?? names[0] ?? null;
  } catch {
    return null;
  }
}

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;
    const body = await request.json();
    const { roleArn, externalId, region: clientRegion } = body;

    if (!(roleArn && externalId)) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    // Validate role ARN format and extract account ID
    const roleArnRegex = /^arn:aws:iam::(\d{12}):role\/(.+)$/;
    const match = roleArn.match(roleArnRegex);

    if (!match) {
      return NextResponse.json(
        { error: "Invalid IAM Role ARN format" },
        { status: 400 }
      );
    }

    const accountId = match[1];

    try {
      // Validate AWS Credentials by assuming the role
      // Uses our helper that handles Vercel OIDC correctly
      const credentials = await assumeRole({
        roleArn,
        externalId,
        sessionName: "WrapsOnboardingValidation",
      });

      // Detect config set name from SES while we have fresh credentials
      const configSetName = await detectConfigSetName(credentials, region);

      // Save to database
      // Check if this AWS account already exists for this org (by AWS account ID)
      const existingAccount = await db.query.awsAccount.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.organizationId, orgWithMembership.id),
            eq(table.accountId, accountId)
          ),
      });

      const featuresUpdate = configSetName
        ? {
            ...existingAccount?.features,
            email: {
              ...(existingAccount?.features?.email ?? {}),
              configSetName,
            },
          }
        : undefined;

      if (existingAccount) {
        await db
          .update(awsAccount)
          .set({
            name: `AWS Account (${accountId})`,
            accountId,
            roleArn,
            externalId,
            region,
            isVerified: true,
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
            ...(featuresUpdate && { features: featuresUpdate }),
          })
          .where(eq(awsAccount.id, existingAccount.id));
      } else {
        await db.insert(awsAccount).values({
          organizationId: orgWithMembership.id,
          name: `AWS Account (${accountId})`,
          accountId,
          roleArn,
          externalId,
          region,
          isVerified: true,
          lastVerifiedAt: new Date(),
          createdBy: session.user.id,
          ...(featuresUpdate && { features: featuresUpdate }),
        });
      }

      // Activation tracking (awaited to ensure events emit before response)
      await trackAwsConnected(session.user.email, orgWithMembership.id, {
        region,
        accountId,
      });

      return NextResponse.json({
        success: true,
        accountId,
      });
    } catch (awsError: any) {
      const log = createRequestLogger({
        path: "/api/[orgSlug]/onboarding/aws/validate",
        method: "POST",
        orgSlug,
      });
      log.error({ err: awsError }, "AWS validation error");
      return NextResponse.json(
        { error: `Failed to validate AWS connection: ${awsError.message}` },
        { status: 400 }
      );
    }
  } catch (error) {
    const orgSlug = (await context.params).orgSlug;
    const log = createRequestLogger({
      path: "/api/[orgSlug]/onboarding/aws/validate",
      method: "POST",
      orgSlug,
    });
    log.error({ err: error }, "Error in AWS validation route");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
