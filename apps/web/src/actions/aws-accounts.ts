"use server";
// baseline:allow-large-file

import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DescribePhoneNumbersCommand,
  PinpointSMSVoiceV2Client,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import {
  GetAccountCommand,
  GetConfigurationSetCommand,
  GetConfigurationSetEventDestinationsCommand,
  GetDedicatedIpsCommand,
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { createServerValidate } from "@tanstack/react-form-nextjs";
import { auth } from "@wraps/auth";
import { awsAccount, db } from "@wraps/db";
import { subscription } from "@wraps/db/schema/auth";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  trackAwsConnected,
  trackDomainVerified,
} from "@/lib/activation-tracking";
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

    // Activation tracking (awaited to ensure events emit before response)
    await trackAwsConnected(session.user.email, validatedData.organizationId, {
      region: validatedData.region,
      accountId: validatedData.accountId,
    });

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
        email?: {
          configSetName?: string;
          archivingEnabled?: boolean;
          archiveArn?: string;
          eventHistoryEnabled?: boolean;
          eventTrackingEnabled?: boolean;
          customTrackingDomain?: string;
          inboundBucketName?: string;
          identities?: Array<{
            identity: string;
            type: "DOMAIN" | "EMAIL_ADDRESS";
          }>;
        };
        sms?: {
          enabled?: boolean;
          phoneNumberCount?: number;
          eventHistoryEnabled?: boolean;
        };
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
      with: {
        organization: {
          columns: { slug: true },
        },
      },
    });

    if (
      !(
        membership?.organization.slug &&
        ["owner", "admin"].includes(membership.role)
      )
    ) {
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

    // 7. Scan for SES Configuration Set, Custom Tracking Domain, and Tracked Events
    let configSetName: string | undefined;
    let customTrackingDomain: string | undefined;
    let trackedEvents: string[] = [];

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
        customTrackingDomain =
          configSetResponse.TrackingOptions?.CustomRedirectDomain ?? undefined;

        // Get event destinations to determine which events are tracked
        try {
          const eventDestResponse = await sesClient.send(
            new GetConfigurationSetEventDestinationsCommand({
              ConfigurationSetName: "wraps-email-tracking",
            })
          );

          // Collect all unique event types across all destinations
          const eventTypes = new Set<string>();
          for (const destination of eventDestResponse.EventDestinations ?? []) {
            for (const eventType of destination.MatchingEventTypes ?? []) {
              eventTypes.add(eventType);
            }
          }
          trackedEvents = Array.from(eventTypes).sort();
        } catch (destError: any) {
          // If we can't get event destinations, just continue without them
          if (destError.name !== "AccessDeniedException") {
            log.warn(
              { err: serializeError(destError) },
              "Error scanning for event destinations"
            );
          }
        }
      }
    } catch (error: any) {
      // ResourceNotFoundException means config set doesn't exist
      // AccessDeniedException means user hasn't granted permissions
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
    // Event tracking is enabled if we have tracked events configured
    const eventTrackingEnabled = trackedEvents.length > 0;

    // 9. Check SES sandbox status
    let sesSandbox = true; // Default to sandbox (safer assumption)

    try {
      const sesClient = new SESv2Client({
        region: account.region,
        credentials: awsCredentials,
      });

      const accountResponse = await sesClient.send(new GetAccountCommand({}));
      // ProductionAccessEnabled is true when out of sandbox
      sesSandbox = !accountResponse.ProductionAccessEnabled;
    } catch (error: any) {
      if (error.name !== "AccessDeniedException") {
        log.warn(
          { err: serializeError(error) },
          "Error checking SES sandbox status"
        );
      }
    }

    // 10. Scan for SMS infrastructure (phone numbers with details)
    let smsEnabled = false;
    let smsPhoneNumbers: Array<{
      phoneNumber: string;
      status: string;
      type: string;
      capabilities: string[];
    }> = [];

    try {
      const smsClient = new PinpointSMSVoiceV2Client({
        region: account.region,
        credentials: awsCredentials,
      });

      const phoneNumbersResponse = await smsClient.send(
        new DescribePhoneNumbersCommand({})
      );

      smsPhoneNumbers =
        phoneNumbersResponse.PhoneNumbers?.map((pn) => ({
          phoneNumber: pn.PhoneNumber ?? "",
          status: pn.Status ?? "UNKNOWN",
          type: pn.NumberType ?? "UNKNOWN",
          capabilities: pn.NumberCapabilities ?? [],
        })) ?? [];

      smsEnabled = smsPhoneNumbers.length > 0;
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

    // 11. Scan for SMS event history (DynamoDB table)
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

    // 12. Scan for dedicated IPs
    let dedicatedIpCount = 0;

    try {
      const sesClient = new SESv2Client({
        region: account.region,
        credentials: awsCredentials,
      });

      const dedicatedIpsResponse = await sesClient.send(
        new GetDedicatedIpsCommand({})
      );

      dedicatedIpCount = dedicatedIpsResponse.DedicatedIps?.length ?? 0;
    } catch (error: any) {
      // AccessDeniedException means user hasn't granted permissions
      // That's fine - assume no dedicated IPs
      if (error.name !== "AccessDeniedException") {
        log.warn(
          { err: serializeError(error) },
          "Error scanning for dedicated IPs"
        );
      }
    }

    // 13. Scan for sending identities using Wraps config set
    const identities: Array<{
      identity: string;
      type: "DOMAIN" | "EMAIL_ADDRESS";
    }> = [];

    try {
      const sesClient = new SESv2Client({
        region: account.region,
        credentials: awsCredentials,
      });

      const listResponse = await sesClient.send(
        new ListEmailIdentitiesCommand({ PageSize: 100 })
      );

      // Check each sending-enabled identity for Wraps config set
      const sendingEnabled =
        listResponse.EmailIdentities?.filter((i) => i.SendingEnabled) ?? [];

      for (const identity of sendingEnabled) {
        try {
          const details = await sesClient.send(
            new GetEmailIdentityCommand({
              EmailIdentity: identity.IdentityName,
            })
          );
          if (
            details.VerifiedForSendingStatus &&
            details.ConfigurationSetName?.startsWith("wraps-email-")
          ) {
            identities.push({
              identity: identity.IdentityName!,
              type: identity.IdentityType as "DOMAIN" | "EMAIL_ADDRESS",
            });
          }
        } catch {
          // Skip identities we can't access
        }
      }
    } catch (error: any) {
      if (error.name !== "AccessDeniedException") {
        log.warn({ err: serializeError(error) }, "Error scanning identities");
      }
    }

    // 14. Scan for inbound email bucket
    let inboundBucketName: string | undefined;

    try {
      const s3Client = new S3Client({
        region: account.region,
        credentials: awsCredentials,
      });

      // Inbound bucket naming convention: wraps-inbound-{accountId}-{region}
      const expectedBucketName = `wraps-inbound-${account.accountId}-${account.region}`;

      await s3Client.send(
        new HeadBucketCommand({
          Bucket: expectedBucketName,
        })
      );

      // If HeadBucket succeeds, the bucket exists
      inboundBucketName = expectedBucketName;
      log.info({ bucket: inboundBucketName }, "Found inbound email bucket");
    } catch (error: any) {
      // NotFound or AccessDenied means bucket doesn't exist or no permissions
      // Either way, assume inbound is not enabled
      if (
        error.name !== "NotFound" &&
        error.name !== "AccessDenied" &&
        error.$metadata?.httpStatusCode !== 404 &&
        error.$metadata?.httpStatusCode !== 403
      ) {
        log.warn(
          { err: serializeError(error) },
          "Error scanning for inbound bucket"
        );
      }
    }

    // 15. Build features JSON object
    const featuresJson = {
      email: {
        configSetName,
        sandbox: sesSandbox,
        archivingEnabled,
        archiveArn,
        eventHistoryEnabled,
        eventTrackingEnabled,
        trackedEvents,
        customTrackingDomain,
        dedicatedIpCount,
        inboundBucketName,
        identities,
      },
      sms: {
        enabled: smsEnabled,
        phoneNumbers: smsPhoneNumbers,
        eventHistoryEnabled: smsEventHistoryEnabled,
      },
    };

    // 16. Update database with discovered features
    // Email is enabled if we found a config set
    const emailEnabled = !!configSetName;

    await db
      .update(awsAccount)
      .set({
        emailEnabled,
        smsEnabled,
        features: featuresJson,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(awsAccount.id, awsAccountId),
          eq(awsAccount.organizationId, organizationId)
        )
      );

    // 17. Track domain verification if new verified domains were discovered
    const previousIdentities = account.features?.email?.identities ?? [];
    const previousDomains = new Set(
      previousIdentities
        .filter((i) => i.type === "DOMAIN")
        .map((i) => i.identity)
    );
    const newDomains = identities.filter(
      (i) => i.type === "DOMAIN" && !previousDomains.has(i.identity)
    );
    if (newDomains.length > 0) {
      const isFirstDomain = previousDomains.size === 0;
      for (const domain of newDomains) {
        await trackDomainVerified(session.user.email, organizationId, {
          domain: domain.identity,
          isFirstDomain,
        });
        // Only the first new domain can be the org's first domain
        break;
      }
    }

    // 18. Revalidate pages (layout will re-fetch products status)
    const orgSlug = membership.organization.slug;
    revalidatePath(`/${orgSlug}/settings/aws-accounts/${awsAccountId}`);
    revalidatePath(`/${orgSlug}/settings`);
    revalidatePath(`/${orgSlug}`);
    revalidatePath(`/${orgSlug}/emails/inbound`);

    return {
      success: true,
      features: featuresJson,
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

    // 4. Delete the account (cascade will delete related records), re-scoped by org for defense-in-depth
    await db
      .delete(awsAccount)
      .where(
        and(
          eq(awsAccount.id, awsAccountId),
          eq(awsAccount.organizationId, organizationId)
        )
      );

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

    // Update the webhook secret, re-scoped by org for defense-in-depth
    await db
      .update(awsAccount)
      .set({
        webhookSecret,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(awsAccount.id, awsAccountId),
          eq(awsAccount.organizationId, account.organizationId)
        )
      );

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

    // Remove the webhook secret, re-scoped by org for defense-in-depth
    await db
      .update(awsAccount)
      .set({
        webhookSecret: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(awsAccount.id, awsAccountId),
          eq(awsAccount.organizationId, account.organizationId)
        )
      );

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
      errorCode?: "PERMISSION_DENIED" | "UNKNOWN";
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
      with: {
        organization: {
          columns: { slug: true },
        },
      },
    });

    if (!membership?.organization.slug) {
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

    log.info(
      {
        totalIdentities: listResponse.EmailIdentities?.length ?? 0,
        identities: listResponse.EmailIdentities?.map((i) => ({
          name: i.IdentityName,
          type: i.IdentityType,
          sendingEnabled: i.SendingEnabled,
        })),
      },
      "Listed email identities from SES"
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
    const sendingEnabledIdentities = listResponse.EmailIdentities.filter(
      (identity) => identity.SendingEnabled === true
    );

    log.info(
      { count: sendingEnabledIdentities.length },
      "Identities with SendingEnabled=true"
    );

    const identityDetails = await Promise.all(
      sendingEnabledIdentities.map(async (identity) => {
        try {
          const details = await sesClient.send(
            new GetEmailIdentityCommand({
              EmailIdentity: identity.IdentityName,
            })
          );
          const result = {
            name: identity.IdentityName,
            type: identity.IdentityType,
            configSet: details.ConfigurationSetName,
            verified: details.VerifiedForSendingStatus,
          };
          log.info({ identity: result }, "Identity details");
          return result;
        } catch (err) {
          log.warn(
            { identity: identity.IdentityName, err },
            "Failed to get identity details"
          );
          return null;
        }
      })
    );

    // Filter to only Wraps-managed identities
    for (const detail of identityDetails) {
      if (!detail?.verified) {
        continue;
      }

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
      revalidatePath(`/${membership.organization.slug}/emails/broadcasts/new`);
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

    // Check for AWS permission errors
    const isAccessDenied =
      error instanceof Error &&
      ((error as { name?: string }).name === "AccessDeniedException" ||
        error.message.includes("is not authorized to perform"));

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch domains",
      errorCode: isAccessDenied ? "PERMISSION_DENIED" : "UNKNOWN",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SMS PHONE NUMBERS
// ═══════════════════════════════════════════════════════════════════════════

export type PhoneNumber = {
  phoneNumber: string;
  phoneNumberArn: string;
  status: string;
  isoCountryCode: string;
};

export type GetSMSPhoneNumbersResult =
  | {
      success: true;
      phoneNumbers: PhoneNumber[];
    }
  | {
      success: false;
      error: string;
    };

/**
 * Get SMS phone numbers for an AWS account
 */
export async function getSMSPhoneNumbers(
  awsAccountId: string,
  organizationId: string
): Promise<GetSMSPhoneNumbersResult> {
  const log = createActionLogger("getSMSPhoneNumbers", {
    accountId: awsAccountId,
    orgSlug: organizationId,
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
      where: (m, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(m.userId, session.user.id),
          eqOp(m.organizationId, organizationId)
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
      where: (a, { and: andOp, eq: eqOp }) =>
        andOp(eqOp(a.id, awsAccountId), eqOp(a.organizationId, organizationId)),
    });

    if (!account) {
      return {
        success: false,
        error: "AWS account not found",
      };
    }

    // 4. Check if SMS is enabled
    if (!account.smsEnabled) {
      return {
        success: true,
        phoneNumbers: [],
      };
    }

    // 5. Get AWS credentials
    const awsCredentials = await getOrAssumeRole(account);

    // 6. Get phone numbers from Pinpoint SMS Voice
    const smsClient = new PinpointSMSVoiceV2Client({
      region: account.region,
      credentials: awsCredentials,
    });

    const phoneNumbersResponse = await smsClient.send(
      new DescribePhoneNumbersCommand({})
    );

    const phoneNumbers: PhoneNumber[] = (
      phoneNumbersResponse.PhoneNumbers ?? []
    ).map((pn) => ({
      phoneNumber: pn.PhoneNumber ?? "",
      phoneNumberArn: pn.PhoneNumberArn ?? "",
      status: pn.Status ?? "",
      isoCountryCode: pn.IsoCountryCode ?? "",
    }));

    log.info({ count: phoneNumbers.length }, "Fetched SMS phone numbers");

    return {
      success: true,
      phoneNumbers,
    };
  } catch (error) {
    log.error(
      { err: serializeError(error) },
      "Failed to fetch SMS phone numbers"
    );
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch phone numbers",
    };
  }
}
