import { randomBytes } from "node:crypto";
import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireRoutePermission } from "@/app/api/shared/route-permission";
import {
  AssumeRoleError,
  type AssumeRoleErrorCode,
  assumeRole,
} from "@/lib/aws/assume-role";
import {
  detectFeaturesFromOutputs,
  findInfrastructureStack,
} from "@/lib/aws/detect-features";
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
      path: "/api/[orgSlug]/aws/validate-infrastructure",
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
    const {
      roleArn,
      externalId,
      region: clientRegion,
      webhookSecret: clientWebhookSecret,
    } = body;

    if (!roleArn) {
      return NextResponse.json(
        { error: "Role ARN is required" },
        { status: 400 }
      );
    }

    if (!externalId) {
      return NextResponse.json(
        { error: "External ID is required" },
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
      // Assume the customer's role using Wraps backend credentials (Vercel OIDC)
      const assumedCredentials = await assumeRole({
        roleArn,
        externalId,
        sessionName: `wraps-infrastructure-validation-${Date.now()}`,
      });

      // Try to find the infrastructure stack and get its outputs
      let detectedFeatures = null;
      let stackOutputs: Record<string, string> = {};

      try {
        const stackInfo = await findInfrastructureStack(roleArn, region, {
          accessKeyId: assumedCredentials.accessKeyId,
          secretAccessKey: assumedCredentials.secretAccessKey,
          sessionToken: assumedCredentials.sessionToken,
        });

        if (stackInfo) {
          stackOutputs = stackInfo.outputs;
          detectedFeatures = detectFeaturesFromOutputs(stackOutputs);
          log.info(
            { stackName: stackInfo.stackName, features: detectedFeatures },
            "Detected infrastructure features"
          );
        }
      } catch (stackError) {
        // Stack detection failed, but role is valid
        log.warn({ err: stackError }, "Could not detect infrastructure stack");
      }

      // Check AWS account limit before creating/updating
      // Look up by accountId (from the role ARN) to handle role name changes
      const existingAccount = await db.query.awsAccount.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.organizationId, orgWithMembership.id),
            eq(table.accountId, accountId)
          ),
      });

      // Use the client-provided webhook secret (from CloudFormation URL) or generate a secure random one
      const webhookSecret =
        clientWebhookSecret || randomBytes(32).toString("hex");

      if (existingAccount) {
        // Update existing account with detected features
        await db
          .update(awsAccount)
          .set({
            roleArn,
            region,
            // Update external ID and webhook secret in case they changed
            externalId,
            webhookSecret,
            isVerified: true,
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
            // Set emailEnabled if config set is detected
            emailEnabled: !!detectedFeatures?.configSetName,
            // Store features in JSON
            features: detectedFeatures
              ? {
                  email: {
                    configSetName: detectedFeatures.configSetName,
                    eventTrackingEnabled: detectedFeatures.eventTracking,
                    eventHistoryEnabled: detectedFeatures.historyStorage,
                    archivingEnabled: detectedFeatures.archiving,
                    archiveArn: detectedFeatures.archiveArn,
                  },
                }
              : existingAccount.features,
          })
          .where(eq(awsAccount.id, existingAccount.id));
      } else {
        // Check account limit for new accounts.
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

        // Create new account with detected features
        await db.insert(awsAccount).values({
          organizationId: orgWithMembership.id,
          name: `AWS Account ${accountId}`,
          accountId,
          region,
          roleArn,
          // Save the actual external ID from the CloudFormation stack
          externalId,
          // Save webhook secret for EventBridge webhook authentication
          webhookSecret,
          isVerified: true,
          lastVerifiedAt: new Date(),
          createdBy: session.user.id,
          // Set emailEnabled if config set is detected
          emailEnabled: !!detectedFeatures?.configSetName,
          // Store features in JSON
          features: detectedFeatures
            ? {
                email: {
                  configSetName: detectedFeatures.configSetName,
                  eventTrackingEnabled: detectedFeatures.eventTracking,
                  eventHistoryEnabled: detectedFeatures.historyStorage,
                  archivingEnabled: detectedFeatures.archiving,
                  archiveArn: detectedFeatures.archiveArn,
                },
              }
            : undefined,
        });
      }

      return NextResponse.json({
        success: true,
        message: "Infrastructure connected successfully",
        accountId,
        region,
        roleName,
        features: detectedFeatures,
        configSetName: stackOutputs.ConfigSetName || "wraps-email-tracking",
        tableName: stackOutputs.TableName,
      });
    } catch (error: unknown) {
      log.error({ err: error }, "Error validating infrastructure");

      const code: AssumeRoleErrorCode =
        error instanceof AssumeRoleError ? error.code : "UNKNOWN";

      const remediationByCode: Record<AssumeRoleErrorCode, string> = {
        ACCESS_DENIED:
          "Open the CloudFormation stack in your AWS Console and confirm it finished with status CREATE_COMPLETE, then copy the ConsoleRoleArn and ExternalId from the Outputs tab again.",
        INVALID_TRUST_POLICY:
          "The IAM role's trust policy is not allowing Wraps to assume it. Re-deploy the CloudFormation stack — do not edit the role's trust policy by hand.",
        INVALID_BACKEND_CREDENTIALS:
          "This is a temporary Wraps-side issue. Wait a moment and click Validate Connection again. If it persists, book a setup call.",
        UNKNOWN:
          "Double-check the Console Role ARN and External ID match the CloudFormation Outputs tab exactly. If the problem continues, book a setup call and we'll connect it with you.",
      };

      const message =
        error instanceof AssumeRoleError
          ? error.message
          : "Failed to validate AWS connection.";

      return NextResponse.json(
        { error: message, code, remediation: remediationByCode[code] },
        { status: 400 }
      );
    }
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/aws/validate-infrastructure",
      method: "POST",
    });
    log.error({ err: error }, "Error validating infrastructure");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
