"use server";

import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetConfigurationSetCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { createServerValidate } from "@tanstack/react-form/nextjs";
import { auth } from "@wraps/auth";
import { awsAccount, db } from "@wraps/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCredentials } from "@/lib/aws/assume-role";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import { findWrapsArchive } from "@/lib/aws/mailmanager";
import {
  connectAWSAccountFormOpts,
  connectAWSAccountSchema,
} from "@/lib/forms/connect-aws-account";
import { grantAWSAccountAccess } from "@/lib/permissions/grant-access";

// Create server validator
const serverValidate = createServerValidate({
  ...connectAWSAccountFormOpts,
  onServerValidate: ({ value }) => {
    // Additional server-side validation
    const result = connectAWSAccountSchema.safeParse(value);
    if (!result.success) {
      return result.error.issues[0]?.message || "Validation failed";
    }
  },
});

export type ConnectAWSAccountResult =
  | {
      success: true;
      account: { id: string; name: string; region: string };
    }
  | { error: string; details?: string };

export type AWSAccountWithCreator = {
  id: string;
  name: string;
  accountId: string;
  region: string;
  roleArn: string;
  isVerified: boolean;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export type ListAWSAccountsResult =
  | {
      success: true;
      accounts: AWSAccountWithCreator[];
    }
  | {
      success: false;
      error: string;
    };

/**
 * List all AWS accounts for an organization
 */
export async function listAWSAccounts(
  organizationId: string
): Promise<ListAWSAccountsResult> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in",
      };
    }

    // Verify user is a member of this organization
    const userMembership = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.organizationId, organizationId),
          eq(m.userId, session.user.id)
        ),
    });

    if (!userMembership) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Fetch all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: (a, { eq }) => eq(a.organizationId, organizationId),
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: (accs, { desc }) => [desc(accs.createdAt)],
    });

    return {
      success: true,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        accountId: account.accountId,
        region: account.region,
        roleArn: account.roleArn,
        isVerified: account.isVerified,
        lastVerifiedAt: account.lastVerifiedAt,
        createdAt: account.createdAt,
        createdBy: account.createdByUser,
      })),
    };
  } catch (error) {
    console.error("Error listing AWS accounts:", error);
    return {
      success: false,
      error: "Failed to fetch AWS accounts",
    };
  }
}

export async function connectAWSAccountAction(
  _prev: unknown,
  formData: FormData
) {
  try {
    // 1. Validate form data
    const validatedData = await serverValidate(formData);

    // 2. Get session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { error: "Unauthorized" };
    }

    // 3. Check org membership
    const membership = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.userId, session.user.id),
          eq(m.organizationId, validatedData.organizationId)
        ),
    });

    if (!(membership && ["owner", "admin"].includes(membership.role))) {
      return { error: "Insufficient permissions" };
    }

    // 4. Use the external ID provided from the form (generated on client and used in CloudFormation)
    const externalId = validatedData.externalId;

    // 5. Test connection by attempting to get credentials (may assume role or use dev mode)
    try {
      await getCredentials({
        roleArn: validatedData.roleArn,
        externalId,
        region: validatedData.region,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        error: "Unable to connect to AWS account",
        details: message,
      };
    }

    // 6. Save to database
    const [account] = await db
      .insert(awsAccount)
      .values({
        organizationId: validatedData.organizationId,
        name: validatedData.name,
        accountId: validatedData.accountId,
        region: validatedData.region,
        roleArn: validatedData.roleArn,
        externalId,
        isVerified: true,
        lastVerifiedAt: new Date(),
        createdBy: session.user.id,
      })
      .returning();

    if (!account) {
      return { error: "Failed to create AWS account record" };
    }

    // 7. Grant default access to all org members (except owners)
    const allMembers = await db.query.member.findMany({
      where: (m, { eq }) => eq(m.organizationId, validatedData.organizationId),
    });

    for (const orgMember of allMembers) {
      if (orgMember.role === "owner") {
        continue;
      }

      const permissions =
        orgMember.role === "admin" ? "FULL_ACCESS" : "READ_ONLY";

      await grantAWSAccountAccess({
        userId: orgMember.userId,
        awsAccountId: account.id,
        permissions,
        grantedBy: session.user.id,
      });
    }

    // 8. Revalidate pages that display AWS accounts
    revalidatePath(`/${validatedData.organizationId}/settings`, "page");
    revalidatePath(`/dashboard/organizations/${validatedData.organizationId}`);

    return {
      success: true,
      account: {
        id: account.id,
        name: account.name,
        region: account.region,
      },
    } as const;
  } catch (e) {
    // Handle TanStack Form validation errors
    if (
      e &&
      typeof e === "object" &&
      "formState" in e &&
      typeof (e as { formState?: unknown }).formState === "object"
    ) {
      return (e as { formState: unknown }).formState;
    }

    // Handle other errors
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("Error connecting AWS account:", e);
    return { error: "Internal error", details: message };
  }
}

export type ScanFeaturesResult =
  | {
      success: true;
      features: {
        archivingEnabled: boolean;
        archiveArn?: string;
        eventHistoryEnabled: boolean;
        eventTrackingEnabled: boolean;
        configSetName?: string;
        customTrackingDomain?: string;
      };
    }
  | {
      success: false;
      error: string;
    };

/**
 * Scan AWS account for deployed features and update database
 * This detects features like email archiving by querying AWS resources
 */
export async function scanAWSAccountFeatures(
  awsAccountId: string,
  organizationId: string
): Promise<ScanFeaturesResult> {
  try {
    // 1. Get session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // 2. Check org membership and permissions
    const membership = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.userId, session.user.id),
          eq(m.organizationId, organizationId)
        ),
    });

    if (!(membership && ["owner", "admin"].includes(membership.role))) {
      return {
        success: false,
        error: "Insufficient permissions",
      };
    }

    // 3. Get AWS account
    const account = await db.query.awsAccount.findFirst({
      where: (a, { and, eq }) =>
        and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
    });

    if (!account) {
      return {
        success: false,
        error: "AWS account not found",
      };
    }

    // 4. Get credentials for the AWS account
    const credentials = await getOrAssumeRole({
      roleArn: account.roleArn,
      externalId: account.externalId,
    });

    const awsCredentials = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    };

    // 5. Scan for email archiving
    let archivingEnabled = false;
    let archiveArn: string | undefined;

    try {
      archiveArn =
        (await findWrapsArchive(account.region, credentials)) ?? undefined;
      archivingEnabled = !!archiveArn;
    } catch (_error) {
      // findWrapsArchive already handles errors gracefully
      // If AccessDeniedException: user hasn't granted archive permissions
      // Assume archiving is disabled and continue
    }

    // 6. Scan for DynamoDB table (event history)
    let eventHistoryEnabled = false;

    try {
      const dynamoClient = new DynamoDBClient({
        region: account.region,
        credentials: awsCredentials,
      });

      // Try to describe the specific Wraps email history table
      // This only requires DescribeTable permission on our table, not ListTables
      await dynamoClient.send(
        new DescribeTableCommand({
          TableName: "wraps-email-history",
        })
      );
      // If the command succeeds, the table exists
      eventHistoryEnabled = true;
    } catch (error: any) {
      // ResourceNotFoundException means table doesn't exist
      // AccessDeniedException means user hasn't granted permissions
      // Either way, assume event history is disabled
      if (
        error.name !== "ResourceNotFoundException" &&
        error.name !== "AccessDeniedException"
      ) {
        console.error("Error scanning for DynamoDB table:", error);
      }
    }

    // 7. Scan for SES Configuration Set and Custom Tracking Domain
    let configSetName: string | undefined;
    let customTrackingDomain: string | undefined;

    try {
      const sesClient = new SESv2Client({
        region: account.region,
        credentials: awsCredentials,
      });

      // Try common Wraps configuration set name
      const configSetResponse = await sesClient.send(
        new GetConfigurationSetCommand({
          ConfigurationSetName: "wraps-email-tracking",
        })
      );

      // If the command succeeds, the config set exists
      if (configSetResponse) {
        configSetName = "wraps-email-tracking";

        // Extract custom tracking domain if configured
        // VdmOptions contains DashboardOptions with EngagementMetrics
        const vdmOptions = configSetResponse.VdmOptions;
        const dashboardOptions = vdmOptions?.DashboardOptions;
        if (dashboardOptions?.EngagementMetrics === "ENABLED") {
          // Custom tracking domain is stored in TrackingOptions
          customTrackingDomain =
            configSetResponse.TrackingOptions?.CustomRedirectDomain ??
            undefined;
        }
      }
    } catch (error: any) {
      // ResourceNotFoundException means config set doesn't exist
      // AccessDeniedException means user hasn't granted permissions
      // Either way, assume config set is not available
      if (
        error.name !== "NotFoundException" &&
        error.name !== "AccessDeniedException"
      ) {
        console.error("Error scanning for config set:", error);
      }
    }

    // 8. Determine event tracking status
    // Event tracking is enabled if DynamoDB table exists (created by EventBridge rule + Lambda)
    const eventTrackingEnabled = eventHistoryEnabled;

    // 9. Update database with discovered features
    await db
      .update(awsAccount)
      .set({
        archivingEnabled,
        archiveArn: archiveArn ?? null,
        eventHistoryEnabled,
        eventTrackingEnabled,
        configSetName: configSetName ?? null,
        customTrackingDomain: customTrackingDomain ?? null,
        updatedAt: new Date(),
      })
      .where(eq(awsAccount.id, awsAccountId));

    // 10. Revalidate pages
    revalidatePath(`/${organizationId}/aws-accounts/${awsAccountId}`);
    revalidatePath(`/${organizationId}/aws-accounts`);

    return {
      success: true,
      features: {
        archivingEnabled,
        archiveArn,
        eventHistoryEnabled,
        eventTrackingEnabled,
        configSetName,
        customTrackingDomain,
      },
    };
  } catch (error) {
    console.error("Error scanning AWS account features:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Failed to scan features: ${message}`,
    };
  }
}

export type DeleteAWSAccountResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Delete an AWS account from the organization
 */
export async function deleteAWSAccount(
  awsAccountId: string,
  organizationId: string
): Promise<DeleteAWSAccountResult> {
  try {
    // 1. Get session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Not authenticated" };
    }

    // 2. Check if user is owner or admin of the organization
    const member = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.userId, session.user.id),
          eq(m.organizationId, organizationId)
        ),
    });

    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return {
        success: false,
        error: "Only owners and admins can delete AWS accounts",
      };
    }

    // 3. Verify the account belongs to this organization
    const account = await db.query.awsAccount.findFirst({
      where: (a, { and, eq }) =>
        and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
    });

    if (!account) {
      return { success: false, error: "AWS account not found" };
    }

    // 4. Delete the account (cascade will delete related records)
    await db.delete(awsAccount).where(eq(awsAccount.id, awsAccountId));

    // 5. Revalidate the settings page
    revalidatePath("/[orgSlug]/settings", "page");

    return { success: true };
  } catch (error) {
    console.error("Error deleting AWS account:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Failed to delete AWS account: ${message}`,
    };
  }
}
