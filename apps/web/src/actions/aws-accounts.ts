"use server";

import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DescribePhoneNumbersCommand,
  PinpointSMSVoiceV2Client,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import {
  GetConfigurationSetCommand,
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { createServerValidate } from "@tanstack/react-form/nextjs";
import { auth } from "@wraps/auth";
import { awsAccount, db } from "@wraps/db";
import { subscription } from "@wraps/db/schema/auth";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCredentials } from "@/lib/aws/assume-role";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import { findWrapsArchive } from "@/lib/aws/mailmanager";
import {
  connectAWSAccountFormOpts,
  connectAWSAccountSchema,
} from "@/lib/forms/connect-aws-account";
import { createActionLogger, serializeError } from "@/lib/logger";
import { grantAWSAccountAccess } from "@/lib/permissions/grant-access";
import { canAddAwsAccount, getAwsAccountLimitMessage } from "@/lib/plans";

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
  const log = createActionLogger("listAWSAccounts", {
    orgSlug: organizationId,
  });

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

    log.debug({ userId: session.user.id }, "Listing AWS accounts");

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

    log.info({ count: accounts.length }, "Listed AWS accounts");

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
    log.error({ err: serializeError(error) }, "Failed to list AWS accounts");
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
  const log = createActionLogger("connectAWSAccount", {});

  try {
    // 1. Validate form data
    const validatedData = await serverValidate(formData);
    log.debug(
      {
        orgSlug: validatedData.organizationId,
        accountId: validatedData.accountId,
      },
      "Connecting AWS account"
    );

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

    // 4. Check AWS account limit based on subscription plan
    const activeSubscription = await db.query.subscription.findFirst({
      where: and(
        eq(subscription.referenceId, validatedData.organizationId),
        or(
          eq(subscription.status, "active"),
          eq(subscription.status, "trialing")
        )
      ),
    });

    const existingAccounts = await db.query.awsAccount.findMany({
      where: (table, { eq }) =>
        eq(table.organizationId, validatedData.organizationId),
    });

    const planId = activeSubscription?.plan || "starter";
    if (!canAddAwsAccount(planId, existingAccounts.length)) {
      log.warn(
        { planId, existingCount: existingAccounts.length },
        "AWS account limit reached"
      );
      return {
        error: "AWS account limit reached",
        message: getAwsAccountLimitMessage(planId),
        limitReached: true,
      };
    }

    // 5. Use the external ID provided from the form (generated on client and used in CloudFormation)
    const externalId = validatedData.externalId;

    // 6. Test connection by attempting to get credentials (may assume role or use dev mode)
    try {
      await getCredentials({
        roleArn: validatedData.roleArn,
        externalId,
        region: validatedData.region,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.warn({ err: serializeError(error) }, "Failed to assume AWS role");
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
    revalidatePath("/");

    log.info(
      { accountId: account.id, awsAccountId: validatedData.accountId },
      "AWS account connected"
    );

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
    log.error({ err: serializeError(e) }, "Failed to connect AWS account");
    return { error: "Internal error", details: message };
  }
}

export type ScanFeaturesResult =
  | {
      success: true;
      features: {
        // Email features
        archivingEnabled: boolean;
        archiveArn?: string;
        eventHistoryEnabled: boolean;
        eventTrackingEnabled: boolean;
        configSetName?: string;
        customTrackingDomain?: string;
        // SMS features
        smsEnabled: boolean;
        smsPhoneNumberCount?: number;
        smsEventHistoryEnabled: boolean;
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
  const log = createActionLogger("scanAWSAccountFeatures", {
    orgSlug: organizationId,
    accountId: awsAccountId,
  });

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
        log.warn(
          { err: serializeError(error) },
          "Error scanning for DynamoDB table"
        );
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
        log.warn(
          { err: serializeError(error) },
          "Error scanning for config set"
        );
      }
    }

    // 8. Determine event tracking status
    // Event tracking is enabled if DynamoDB table exists (created by EventBridge rule + Lambda)
    const eventTrackingEnabled = eventHistoryEnabled;

    // 9. Scan for SMS infrastructure (phone numbers)
    let smsEnabled = false;
    let smsPhoneNumberCount = 0;

    try {
      const smsClient = new PinpointSMSVoiceV2Client({
        region: account.region,
        credentials: awsCredentials,
      });

      const phoneNumbersResponse = await smsClient.send(
        new DescribePhoneNumbersCommand({})
      );

      smsPhoneNumberCount = phoneNumbersResponse.PhoneNumbers?.length ?? 0;
      smsEnabled = smsPhoneNumberCount > 0;
    } catch (error: any) {
      // AccessDeniedException means user hasn't granted SMS permissions
      // That's fine - assume SMS is not enabled
      if (error.name !== "AccessDeniedException") {
        log.warn(
          { err: serializeError(error) },
          "Error scanning for SMS infrastructure"
        );
      }
    }

    // 10. Scan for SMS event history (DynamoDB table)
    let smsEventHistoryEnabled = false;

    try {
      const smsDynamoClient = new DynamoDBClient({
        region: account.region,
        credentials: awsCredentials,
      });

      await smsDynamoClient.send(
        new DescribeTableCommand({
          TableName: "wraps-sms-history",
        })
      );
      // If the command succeeds, the table exists
      smsEventHistoryEnabled = true;
    } catch (error: any) {
      // ResourceNotFoundException means table doesn't exist
      // AccessDeniedException means user hasn't granted DynamoDB permissions
      if (
        error.name !== "ResourceNotFoundException" &&
        error.name !== "AccessDeniedException"
      ) {
        log.warn(
          { err: serializeError(error) },
          "Error scanning for SMS history table"
        );
      }
    }

    // 11. Update database with discovered features
    await db
      .update(awsAccount)
      .set({
        // Email features
        archivingEnabled,
        archiveArn: archiveArn ?? null,
        eventHistoryEnabled,
        eventTrackingEnabled,
        configSetName: configSetName ?? null,
        customTrackingDomain: customTrackingDomain ?? null,
        // SMS features
        smsEnabled,
        smsPhoneNumberCount,
        smsEventHistoryEnabled,
        updatedAt: new Date(),
      })
      .where(eq(awsAccount.id, awsAccountId));

    // 12. Revalidate pages (layout will re-fetch products status)
    revalidatePath(`/${organizationId}/settings/aws-accounts/${awsAccountId}`);
    revalidatePath(`/${organizationId}/settings`);
    revalidatePath(`/${organizationId}`);

    return {
      success: true,
      features: {
        // Email features
        archivingEnabled,
        archiveArn,
        eventHistoryEnabled,
        eventTrackingEnabled,
        configSetName,
        customTrackingDomain,
        // SMS features
        smsEnabled,
        smsPhoneNumberCount,
        smsEventHistoryEnabled,
      },
    };
  } catch (error) {
    log.error(
      { err: serializeError(error) },
      "Failed to scan AWS account features"
    );
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
  const log = createActionLogger("deleteAWSAccount", {
    orgSlug: organizationId,
    accountId: awsAccountId,
  });

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

    log.info("AWS account deleted");
    return { success: true };
  } catch (error) {
    log.error({ err: serializeError(error) }, "Failed to delete AWS account");
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Failed to delete AWS account: ${message}`,
    };
  }
}

export type SaveWebhookSecretResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Save webhook secret for an AWS account
 * This enables SES events to be sent to the Wraps dashboard
 */
export async function saveWebhookSecretAction(
  awsAccountId: string,
  webhookSecret: string
): Promise<SaveWebhookSecretResult> {
  const log = createActionLogger("saveWebhookSecret", {
    accountId: awsAccountId,
  });

  try {
    // Get current user session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in to update webhook settings",
      };
    }

    // Get the AWS account to check organization
    const account = await db.query.awsAccount.findFirst({
      where: (a, { eq: eqOp }) => eqOp(a.id, awsAccountId),
    });

    if (!account) {
      return {
        success: false,
        error: "AWS account not found",
      };
    }

    // Check if user is owner/admin of the organization
    const membership = await db.query.member.findFirst({
      where: (m, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(m.userId, session.user.id),
          eqOp(m.organizationId, account.organizationId)
        ),
    });

    if (!(membership && ["owner", "admin"].includes(membership.role))) {
      return {
        success: false,
        error: "You don't have permission to manage this AWS account",
      };
    }

    // Validate webhook secret format (should be 64 hex characters)
    if (!/^[a-f0-9]{64}$/i.test(webhookSecret)) {
      return {
        success: false,
        error:
          "Invalid webhook secret format. It should be a 64-character hex string.",
      };
    }

    // Update the webhook secret
    await db
      .update(awsAccount)
      .set({
        webhookSecret,
        updatedAt: new Date(),
      })
      .where(eq(awsAccount.id, awsAccountId));

    // Revalidate the page
    revalidatePath(`/settings/aws-accounts/${awsAccountId}`);

    log.info("Webhook secret saved");
    return {
      success: true,
      message: "Webhook secret saved successfully",
    };
  } catch (error) {
    log.error({ err: serializeError(error) }, "Failed to save webhook secret");
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Remove webhook secret from an AWS account
 * This stops SES events from being sent to the Wraps dashboard
 */
export async function removeWebhookSecretAction(
  awsAccountId: string
): Promise<SaveWebhookSecretResult> {
  const log = createActionLogger("removeWebhookSecret", {
    accountId: awsAccountId,
  });

  try {
    // Get current user session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in to update webhook settings",
      };
    }

    // Get the AWS account to check organization
    const account = await db.query.awsAccount.findFirst({
      where: (a, { eq: eqOp }) => eqOp(a.id, awsAccountId),
    });

    if (!account) {
      return {
        success: false,
        error: "AWS account not found",
      };
    }

    // Check if user is owner/admin of the organization
    const membership = await db.query.member.findFirst({
      where: (m, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(m.userId, session.user.id),
          eqOp(m.organizationId, account.organizationId)
        ),
    });

    if (!(membership && ["owner", "admin"].includes(membership.role))) {
      return {
        success: false,
        error: "You don't have permission to manage this AWS account",
      };
    }

    // Remove the webhook secret
    await db
      .update(awsAccount)
      .set({
        webhookSecret: null,
        updatedAt: new Date(),
      })
      .where(eq(awsAccount.id, awsAccountId));

    // Revalidate the page
    revalidatePath(`/settings/aws-accounts/${awsAccountId}`);

    log.info("Webhook secret removed");
    return {
      success: true,
      message: "Webhook disconnected successfully",
    };
  } catch (error) {
    log.error(
      { err: serializeError(error) },
      "Failed to remove webhook secret"
    );
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

export type VerifiedIdentity = {
  identity: string;
  type: "DOMAIN" | "EMAIL_ADDRESS";
};

export type GetVerifiedDomainsResult =
  | {
      success: true;
      identities: VerifiedIdentity[];
    }
  | {
      success: false;
      error: string;
    };

/**
 * Get verified SES identities (domains and email addresses) for an AWS account.
 * Only returns identities using the Wraps configuration set (wraps-email-*).
 *
 * Uses Next.js caching with a 30 minute TTL. Call with forceRefresh=true to bypass cache.
 */
export async function getVerifiedDomains(
  awsAccountId: string,
  organizationId: string,
  forceRefresh = false
): Promise<GetVerifiedDomainsResult> {
  const log = createActionLogger("getVerifiedDomains", {
    orgSlug: organizationId,
    accountId: awsAccountId,
  });

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

    // 2. Check org membership
    const membership = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.userId, session.user.id),
          eq(m.organizationId, organizationId)
        ),
    });

    if (!membership) {
      return {
        success: false,
        error: "You don't have access to this organization",
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

    // 5. List all email identities
    const sesClient = new SESv2Client({
      region: account.region,
      credentials: awsCredentials,
    });

    const listResponse = await sesClient.send(
      new ListEmailIdentitiesCommand({
        PageSize: 100, // Should be enough for most accounts
      })
    );

    if (!listResponse.EmailIdentities?.length) {
      return {
        success: true,
        identities: [],
      };
    }

    // 6. Filter to verified identities and check configuration set
    const verifiedIdentities: VerifiedIdentity[] = [];

    // Get details for each identity to check config set
    // Using Promise.all for parallel requests
    const identityDetails = await Promise.all(
      listResponse.EmailIdentities.filter(
        (identity) => identity.SendingEnabled === true
      ).map(async (identity) => {
        try {
          const details = await sesClient.send(
            new GetEmailIdentityCommand({
              EmailIdentity: identity.IdentityName,
            })
          );
          return {
            name: identity.IdentityName,
            type: identity.IdentityType,
            configSet: details.ConfigurationSetName,
            verified: details.VerifiedForSendingStatus,
          };
        } catch {
          // Skip identities we can't access
          return null;
        }
      })
    );

    // Filter to only Wraps-managed identities
    for (const detail of identityDetails) {
      if (!detail || !detail.verified) continue;

      // Check if using our configuration set
      if (detail.configSet?.startsWith("wraps-email-")) {
        verifiedIdentities.push({
          identity: detail.name!,
          type: detail.type as "DOMAIN" | "EMAIL_ADDRESS",
        });
      }
    }

    log.info(
      { count: verifiedIdentities.length },
      "Fetched verified identities"
    );

    // Force revalidation if requested
    if (forceRefresh) {
      revalidatePath(`/${organizationId}/send/new`);
    }

    return {
      success: true,
      identities: verifiedIdentities,
    };
  } catch (error) {
    log.error(
      { err: serializeError(error) },
      "Failed to fetch verified domains"
    );
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch domains",
    };
  }
}
