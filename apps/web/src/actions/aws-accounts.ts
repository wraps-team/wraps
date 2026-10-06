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
  ListConfigurationSetsCommand,
  ListEmailIdentitiesCommand,
  type ReviewStatus,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { createServerValidate } from "@tanstack/react-form-nextjs";
import {
  auditLog,
  awsAccount,
  db,
  notifyOrg,
  writeIdentitySnapshot,
} from "@wraps/db";
import { scanWrapsIdentities } from "@wraps/email";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  trackAwsConnected,
  trackDomainVerified,
  trackProductionAccess,
} from "@/lib/activation-tracking";
import { auditLogEntry, getAuditContext } from "@/lib/audit";
import {
  getCredentials,
  isCustomerRoleAccessError,
} from "@/lib/aws/assume-role";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import { findWrapsArchive } from "@/lib/aws/mailmanager";
import { renameAwsAccountSchema } from "@/lib/forms/aws-account";
import {
  connectAWSAccountFormOpts,
  connectAWSAccountSchema,
} from "@/lib/forms/connect-aws-account";
import { checkAWSAccountAccess } from "@/lib/permissions/check-access";
import { grantAWSAccountAccess } from "@/lib/permissions/grant-access";
import { getOrganizationPlan, isSelfHosted } from "@/lib/plan-limits";
import { canAddAwsAccount, getAwsAccountLimitMessage } from "@/lib/plans";
import { orgAction } from "./shared/org-action";

/**
 * AWS SDK v3 does not reliably populate `name`: some errors arrive as
 * `name: "Error"` with the real exception type only in `message`. Match on both.
 */
function isAwsErrorNamed(error: unknown, ...names: string[]): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return names.some((n) => error.name === n || error.message.includes(n));
}

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

// AWS's ReviewDetails.Status, carried through to the persisted features blob.
// null means AWS reported no review at all — never a defaulted/fabricated status.
export type SesProductionAccessRequest = {
  status: ReviewStatus | null;
  caseId: string | null;
} | null;

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
export const listAWSAccounts = orgAction(
  {
    name: "listAWSAccounts",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to fetch AWS accounts",
  },
  async (ctx, organizationId: string): Promise<ListAWSAccountsResult> => {
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

    ctx.log.info({ count: accounts.length }, "Listed AWS accounts");

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
  }
);

export const connectAWSAccountAction = orgAction(
  {
    name: "connectAWSAccount",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (_prev: unknown, formData: FormData) =>
      String(formData.get("organizationId")),
    onError: "Failed to connect AWS account",
  },
  async (ctx, _prev: unknown, formData: FormData) => {
    // CHARACTERIZATION: this try/catch stays — it returns the TanStack
    // `formState` shape and the `{ error, details }` shape that orgAction's
    // generic static-string catch can't reproduce.
    try {
      // 1. Validate form data
      const validatedData = await serverValidate(formData);

      // The wrapper authorized `ctx.organizationId`, read via formData.get() — the
      // FIRST value for a duplicated key. serverValidate decodes through
      // decode-formdata, which keeps the LAST. A body with two organizationId
      // entries would otherwise authorize one org and write to another.
      if (validatedData.organizationId !== ctx.organizationId) {
        return { error: "Invalid organization" };
      }

      ctx.log.debug(
        {
          orgSlug: ctx.organizationId,
          accountId: validatedData.accountId,
        },
        "Connecting AWS account"
      );

      // One row per AWS account per org. Every other connect path upserts on
      // (organizationId, accountId); inserting here is how duplicates arise.
      const alreadyConnected = await db.query.awsAccount.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.organizationId, ctx.organizationId),
            eq(table.accountId, validatedData.accountId)
          ),
        columns: { id: true },
      });
      if (alreadyConnected) {
        return {
          error: "This AWS account is already connected",
          existingAccountId: alreadyConnected.id,
          existingAccountHref: `/${ctx.access.orgSlug}/settings/aws-accounts/${alreadyConnected.id}`,
        };
      }

      // 4. Check AWS account limit based on subscription plan.
      // `getOrganizationPlan` is the single source of truth: it honours a
      // self-host licence, requires an active/trialing subscription on a real
      // paid plan, and defaults to "free". The hand-rolled query this replaced
      // defaulted to legacy "starter", which post-restructure carries
      // maxAwsAccounts: 3 — so an org with no subscription was handed a paid
      // tier's limit.
      const existingAccounts = await db.query.awsAccount.findMany({
        where: (table, { eq }) => eq(table.organizationId, ctx.organizationId),
      });

      const planId = await getOrganizationPlan(ctx.organizationId);
      if (
        !(isSelfHosted() || canAddAwsAccount(planId, existingAccounts.length))
      ) {
        ctx.log.warn(
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
      let connectCredentials: Awaited<ReturnType<typeof getCredentials>>;
      try {
        connectCredentials = await getCredentials({
          roleArn: validatedData.roleArn,
          externalId,
          region: validatedData.region,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        ctx.log.warn({ err: error }, "Failed to assume AWS role");
        return {
          error: "Unable to connect to AWS account",
          details: message,
        };
      }

      // 6. Save to database
      const [account] = await db
        .insert(awsAccount)
        .values({
          organizationId: ctx.organizationId,
          name: validatedData.name,
          accountId: validatedData.accountId,
          region: validatedData.region,
          roleArn: validatedData.roleArn,
          externalId,
          isVerified: true,
          lastVerifiedAt: new Date(),
          createdBy: ctx.access.userId,
          setupMethod: "cfn_console_role",
        })
        .returning();

      if (!account) {
        return { error: "Failed to create AWS account record" };
      }

      // Populate the identities snapshot now, so the overview is right on
      // first render. Best-effort: a scan failure must never fail the connect.
      try {
        const identities = await scanWrapsIdentities(
          connectCredentials,
          validatedData.region
        );
        await writeIdentitySnapshot({
          organizationId: ctx.organizationId,
          awsAccountId: account.id,
          identities,
        });
      } catch (error: unknown) {
        ctx.log.warn({ err: error }, "Identity scan failed during connect");
      }

      // 7. Grant default access to all org members (except owners)
      const allMembers = await db.query.member.findMany({
        where: (m, { eq }) => eq(m.organizationId, ctx.organizationId),
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
          grantedBy: ctx.access.userId,
        });
      }

      // 8. Revalidate pages that display AWS accounts
      revalidatePath(`/${ctx.access.orgSlug}/settings`, "page");
      revalidatePath("/");

      ctx.log.info(
        { accountId: account.id, awsAccountId: validatedData.accountId },
        "AWS account connected"
      );

      // Activation tracking (awaited to ensure events emit before response)
      await trackAwsConnected(ctx.access.userEmail, ctx.organizationId, {
        region: validatedData.region,
        accountId: validatedData.accountId,
      });

      // Audit log (best-effort, after response)
      const auditCtx = await getAuditContext();
      after(() =>
        db
          .insert(auditLog)
          .values(
            auditLogEntry(auditCtx, {
              organizationId: ctx.organizationId,
              actorId: ctx.access.userId,
              actorEmail: ctx.access.userEmail,
              action: "resource.deployed",
              resource: "aws_account",
              resourceId: account.id,
              metadata: {
                accountId: validatedData.accountId,
                region: validatedData.region,
              },
            })
          )
          .catch((err) =>
            ctx.log.warn({ err }, "Best-effort audit log write failed")
          )
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
      ctx.log.error({ err: e }, "Failed to connect AWS account");
      return { error: "Internal error", details: message };
    }
  }
);

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
          /**
           * The configuration set's SES HttpsPolicy. OPTIONAL (SES's default
           * when the field is omitted) wraps click links in the original
           * link's protocol, so an https:// link resolves against a tracking
           * domain with no matching certificate. Absent on rows scanned
           * before this field.
           */
          trackingHttpsPolicy?: "REQUIRE" | "REQUIRE_OPEN_ONLY" | "OPTIONAL";
          /**
           * Per-configuration-set tracking state. Only sets with a
           * CustomRedirectDomain are recorded. Absent on rows scanned before
           * this field.
           */
          trackingBySet?: Array<{
            configSetName: string;
            customRedirectDomain?: string;
            httpsPolicy?: "REQUIRE" | "REQUIRE_OPEN_ONLY" | "OPTIONAL";
          }>;
          dedicatedIpCount?: number;
          /**
           * How many of dedicatedIpCount are SES *managed* dedicated IPs.
           * Absent on rows scanned before this field.
           */
          managedDedicatedIpCount?: number;
          /**
           * The dedicated IP pool each wraps-email-* configuration set sends
           * through. Only sets with a pool are recorded. Absent on rows
           * scanned before this field.
           */
          sendingPoolBySet?: Array<{ configSetName: string; poolName: string }>;
          inboundBucketName?: string;
          identities?: Array<{
            identity: string;
            type: "DOMAIN" | "EMAIL_ADDRESS";
          }>;
          productionAccessRequest?: SesProductionAccessRequest;
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
export const scanAWSAccountFeatures: (
  awsAccountId: string,
  organizationId: string
) => Promise<ScanFeaturesResult> = orgAction(
  {
    name: "scanAWSAccountFeatures",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (_awsAccountId: string, organizationId: string) => organizationId,
    onError: "Failed to scan AWS account features",
  },
  async (
    ctx,
    awsAccountId: string,
    organizationId: string
  ): Promise<ScanFeaturesResult> => {
    // CHARACTERIZATION: this try/catch stays — it returns an interpolated
    // error message (`Failed to scan features: ${message}`) that orgAction's
    // generic static-string catch can't reproduce.
    try {
      // 1. Get AWS account
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
      } catch (error: unknown) {
        // ResourceNotFoundException means table doesn't exist
        // AccessDeniedException means user hasn't granted permissions
        // Either way, assume event history is disabled
        if (
          !isAwsErrorNamed(
            error,
            "ResourceNotFoundException",
            "AccessDeniedException"
          )
        ) {
          ctx.log.warn({ err: error }, "Error scanning for DynamoDB table");
        }
      }

      // 7. Scan for SES Configuration Set, Custom Tracking Domain, and Tracked Events.
      // Always list ALL wraps-email-* config sets so per-domain sets are included.
      // Prefer per-domain sets (wraps-email-<domain>) over the legacy global set
      // (wraps-email-tracking) as the canonical name shown in the dashboard.
      let configSetName: string | undefined;
      let customTrackingDomain: string | undefined;
      let customTrackingHttpsPolicy:
        | "REQUIRE"
        | "REQUIRE_OPEN_ONLY"
        | "OPTIONAL"
        | undefined;
      let trackedEvents: string[] = [];
      const trackingBySet: Array<{
        configSetName: string;
        customRedirectDomain?: string;
        httpsPolicy?: "REQUIRE" | "REQUIRE_OPEN_ONLY" | "OPTIONAL";
      }> = [];
      const sendingPoolBySet: Array<{
        configSetName: string;
        poolName: string;
      }> = [];

      const sesClientForConfigSet = new SESv2Client({
        region: account.region,
        credentials: awsCredentials,
      });

      try {
        const listResponse = await sesClientForConfigSet.send(
          new ListConfigurationSetsCommand({ PageSize: 100 })
        );
        const wrapsConfigSets = (listResponse.ConfigurationSets ?? []).filter(
          (name) => name.startsWith("wraps-email-")
        );

        // Per-domain sets (anything other than the legacy global name)
        const perDomainSets = wrapsConfigSets.filter(
          (name) => name !== "wraps-email-tracking"
        );
        // Prefer per-domain sets; fall back to legacy global if that's all there is
        const setsToCheck =
          perDomainSets.length > 0 ? perDomainSets : wrapsConfigSets;

        const allEventTypes = new Set<string>();
        for (const setName of setsToCheck) {
          try {
            const csResponse = await sesClientForConfigSet.send(
              new GetConfigurationSetCommand({
                ConfigurationSetName: setName,
              })
            );
            const trackingDomain =
              csResponse.TrackingOptions?.CustomRedirectDomain ?? undefined;
            const trackingHttpsPolicy = csResponse.TrackingOptions?.HttpsPolicy;
            if (trackingDomain) {
              trackingBySet.push({
                configSetName: setName,
                customRedirectDomain: trackingDomain,
                httpsPolicy: trackingHttpsPolicy,
              });
            }
            const sendingPoolName = csResponse.DeliveryOptions?.SendingPoolName;
            if (sendingPoolName) {
              sendingPoolBySet.push({
                configSetName: setName,
                poolName: sendingPoolName,
              });
            }
            const eventDestResponse = await sesClientForConfigSet.send(
              new GetConfigurationSetEventDestinationsCommand({
                ConfigurationSetName: setName,
              })
            );
            const hasDestinations =
              (eventDestResponse.EventDestinations ?? []).length > 0;
            for (const destination of eventDestResponse.EventDestinations ??
              []) {
              for (const eventType of destination.MatchingEventTypes ?? []) {
                allEventTypes.add(eventType);
              }
            }
            // Canonical = first set with event destinations; fall back to first match
            if (!configSetName && hasDestinations) {
              configSetName = setName;
              customTrackingDomain = trackingDomain;
              customTrackingHttpsPolicy = trackingHttpsPolicy;
            } else if (!configSetName && setsToCheck[0] === setName) {
              configSetName = setName;
              customTrackingDomain = trackingDomain;
              customTrackingHttpsPolicy = trackingHttpsPolicy;
            }
          } catch (detailError: unknown) {
            if (!isAwsErrorNamed(detailError, "AccessDeniedException")) {
              ctx.log.warn(
                { err: detailError, configSetName: setName },
                "Error fetching config set details"
              );
            }
          }
        }
        trackedEvents = Array.from(allEventTypes).sort();
      } catch (error: unknown) {
        // Never silent: this was suppressed for AccessDeniedException, which is
        // precisely the case that matters. Every role template granted
        // GetConfigurationSet without ListConfigurationSets, so the call was
        // denied for every customer and the dashboard just showed event tracking
        // as disabled. A denial here now means the account is on a stale role.
        if (isAwsErrorNamed(error, "AccessDeniedException")) {
          ctx.log.warn(
            { err: error },
            "Denied listing config sets during scan — role is missing ses:ListConfigurationSets, run `wraps platform update-role`"
          );
        } else {
          ctx.log.warn({ err: error }, "Error listing config sets during scan");
        }
      }

      // 8. Determine event tracking status
      // Event tracking is enabled if we have tracked events configured
      const eventTrackingEnabled = trackedEvents.length > 0;

      // 9. Check SES sandbox status
      // null = GetAccount did not answer this scan. Never let a failed check
      // overwrite a recorded value: writing `true` over a known `false` would
      // make the next successful check re-announce production access.
      let sesSandbox: boolean | null = null;
      let sesProductionAccessRequest: SesProductionAccessRequest = null;

      try {
        const sesClient = new SESv2Client({
          region: account.region,
          credentials: awsCredentials,
        });

        const accountResponse = await sesClient.send(new GetAccountCommand({}));
        // ProductionAccessEnabled is true when out of sandbox
        sesSandbox = !accountResponse.ProductionAccessEnabled;

        const review = accountResponse.Details?.ReviewDetails;
        sesProductionAccessRequest = review
          ? { status: review.Status ?? null, caseId: review.CaseId ?? null }
          : null;
      } catch (error: unknown) {
        if (!isAwsErrorNamed(error, "AccessDeniedException")) {
          ctx.log.warn({ err: error }, "Error checking SES sandbox status");
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
      } catch (error: unknown) {
        // AccessDeniedException means user hasn't granted SMS permissions
        // That's fine - assume SMS is not enabled
        if (!isAwsErrorNamed(error, "AccessDeniedException")) {
          ctx.log.warn({ err: error }, "Error scanning for SMS infrastructure");
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
      } catch (error: unknown) {
        // ResourceNotFoundException means table doesn't exist
        // AccessDeniedException means user hasn't granted DynamoDB permissions
        if (
          !isAwsErrorNamed(
            error,
            "ResourceNotFoundException",
            "AccessDeniedException"
          )
        ) {
          ctx.log.warn({ err: error }, "Error scanning for SMS history table");
        }
      }

      // 12. Scan for dedicated IPs
      let dedicatedIpCount = 0;
      let managedDedicatedIpCount = 0;

      try {
        const sesClient = new SESv2Client({
          region: account.region,
          credentials: awsCredentials,
        });

        const dedicatedIpsResponse = await sesClient.send(
          new GetDedicatedIpsCommand({})
        );

        const dedicatedIps = dedicatedIpsResponse.DedicatedIps ?? [];
        dedicatedIpCount = dedicatedIps.length;
        managedDedicatedIpCount = dedicatedIps.filter(
          (ip) => ip.WarmupStatus === "NOT_APPLICABLE"
        ).length;
      } catch (error: unknown) {
        // AccessDeniedException means user hasn't granted permissions
        // That's fine - assume no dedicated IPs
        if (!isAwsErrorNamed(error, "AccessDeniedException")) {
          ctx.log.warn({ err: error }, "Error scanning for dedicated IPs");
        }
      }

      // 13. Scan for sending identities using Wraps config set
      const identities: Array<{
        identity: string;
        type: "DOMAIN" | "EMAIL_ADDRESS";
        configSetName?: string;
      }> = [];

      try {
        identities.push(
          ...(await scanWrapsIdentities(awsCredentials, account.region))
        );
      } catch (error: unknown) {
        if (!isAwsErrorNamed(error, "AccessDeniedException")) {
          ctx.log.warn({ err: error }, "Error scanning identities");
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
        ctx.log.info(
          { bucket: inboundBucketName },
          "Found inbound email bucket"
        );
      } catch (error: unknown) {
        // NotFound or AccessDenied means bucket doesn't exist or no permissions
        // Either way, assume inbound is not enabled
        const httpStatus = (
          error as { $metadata?: { httpStatusCode?: number } }
        ).$metadata?.httpStatusCode;
        if (
          !isAwsErrorNamed(error, "NotFound", "AccessDenied") &&
          httpStatus !== 404 &&
          httpStatus !== 403
        ) {
          ctx.log.warn({ err: error }, "Error scanning for inbound bucket");
        }
      }

      // 15. Build features JSON object
      const featuresJson = {
        scannedAt: new Date().toISOString(),
        email: {
          configSetName,
          // Unknown on a first scan still defaults to sandbox, the safer guess.
          sandbox: sesSandbox ?? account.features?.email?.sandbox ?? true,
          productionAccessRequest: sesProductionAccessRequest,
          archivingEnabled,
          archiveArn,
          eventHistoryEnabled,
          eventTrackingEnabled,
          trackedEvents,
          customTrackingDomain,
          trackingHttpsPolicy: customTrackingHttpsPolicy,
          trackingBySet,
          sendingPoolBySet,
          dedicatedIpCount,
          managedDedicatedIpCount,
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
      // Email is enabled if the account has verified sending identities wired to
      // a Wraps config set. Config sets are per-domain now, so the single
      // canonical `configSetName` can be absent even when email sends fine —
      // don't gate email on it alone.
      const emailEnabled = identities.length > 0 || !!configSetName;

      await db
        .update(awsAccount)
        .set({
          emailEnabled,
          smsEnabled,
          features: featuresJson,
          identitiesScannedAt: new Date(),
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
        for (const domain of newDomains) {
          await trackDomainVerified(ctx.access.userEmail, organizationId, {
            domain: domain.identity,
          });
          try {
            await notifyOrg({
              organizationId,
              type: "domain.verified",
              title: `${domain.identity} is verified`,
              body: `DKIM verification completed for ${domain.identity}. You can now send email from this domain.`,
              href: `/${ctx.access.orgSlug}/settings/aws-accounts/${awsAccountId}`,
              data: { domain: domain.identity, awsAccountId },
            });
          } catch (notifyError) {
            ctx.log.error(
              { err: notifyError, domain: domain.identity },
              "Failed to write domain-verified notification"
            );
          }
        }
      }

      // 17b. Notify when SES production access is granted (sandbox -> production)
      const wasSandbox = account.features?.email?.sandbox === true;
      if (wasSandbox && sesSandbox === false) {
        try {
          await notifyOrg({
            organizationId,
            type: "ses.production_access",
            title: "SES production access granted",
            body: `AWS account ${account.accountId} (${account.region}) is out of the SES sandbox. You can now send email to any recipient.`,
            href: `/${ctx.access.orgSlug}/emails`,
            data: { awsAccountId, region: account.region },
          });
        } catch (notifyError) {
          ctx.log.error(
            { err: notifyError },
            "Failed to write production-access notification"
          );
        }
      }

      // 17c. Emit the activation event onboarding workflows trigger on. Unlike
      // the notification this also fires for an account first seen already in
      // production, so the flag reaches contacts whose sandbox was never stored.
      if (sesSandbox === false && account.features?.email?.sandbox !== false) {
        await trackProductionAccess(organizationId, account.createdBy, {
          region: account.region,
          accountId: account.accountId,
        });
      }

      // 18. Revalidate pages (layout will re-fetch products status)
      const orgSlug = ctx.access.orgSlug;
      revalidatePath(
        `/${orgSlug}/settings/aws-accounts/${awsAccountId}`,
        "layout"
      );
      revalidatePath(`/${orgSlug}/settings`);
      revalidatePath(`/${orgSlug}`);
      revalidatePath(`/${orgSlug}/emails/inbound`);

      return {
        success: true,
        features: featuresJson,
      };
    } catch (error) {
      ctx.log.error({ err: error }, "Failed to scan AWS account features");
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to scan features: ${message}`,
      };
    }
  }
);

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
export const deleteAWSAccount: (
  awsAccountId: string,
  organizationId: string
) => Promise<DeleteAWSAccountResult> = orgAction(
  {
    name: "deleteAWSAccount",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (_awsAccountId: string, organizationId: string) => organizationId,
    onError: "Failed to delete AWS account",
  },
  async (
    ctx,
    awsAccountId: string,
    organizationId: string
  ): Promise<DeleteAWSAccountResult> => {
    // CHARACTERIZATION: this try/catch stays — it returns an interpolated
    // error message (`Failed to delete AWS account: ${message}`) that
    // orgAction's generic static-string catch can't reproduce.
    try {
      // 1. Verify the account belongs to this organization
      const account = await db.query.awsAccount.findFirst({
        where: (a, { and, eq }) =>
          and(eq(a.id, awsAccountId), eq(a.organizationId, organizationId)),
      });

      if (!account) {
        return { success: false, error: "AWS account not found" };
      }

      // 2. Delete the account (cascade will delete related records), re-scoped by org for defense-in-depth
      await db
        .delete(awsAccount)
        .where(
          and(
            eq(awsAccount.id, awsAccountId),
            eq(awsAccount.organizationId, organizationId)
          )
        );

      // 3. Revalidate the settings page
      revalidatePath(`/${ctx.access.orgSlug}/settings`, "page");

      // Audit log (best-effort, after response)
      const auditCtx = await getAuditContext();
      after(() =>
        db
          .insert(auditLog)
          .values(
            auditLogEntry(auditCtx, {
              organizationId,
              actorId: ctx.access.userId,
              actorEmail: ctx.access.userEmail,
              action: "resource.deleted",
              resource: "aws_account",
              resourceId: awsAccountId,
            })
          )
          .catch((err) =>
            ctx.log.warn({ err }, "Best-effort audit log write failed")
          )
      );

      ctx.log.info("AWS account deleted");
      return { success: true };
    } catch (error) {
      ctx.log.error({ err: error }, "Failed to delete AWS account");
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to delete AWS account: ${message}`,
      };
    }
  }
);

export type SaveWebhookSecretResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Save webhook secret for an AWS account
 * This enables SES events to be sent to the Wraps dashboard
 */
export const saveWebhookSecretAction = orgAction(
  {
    name: "saveWebhookSecret",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (
      _awsAccountId: string,
      _webhookSecret: string,
      organizationId: string
    ) => organizationId,
    onError: "Something went wrong. Please try again.",
  },
  async (
    ctx,
    awsAccountId: string,
    webhookSecret: string,
    organizationId: string
  ): Promise<SaveWebhookSecretResult> => {
    // Get the AWS account scoped to the caller's org (prevents cross-org enumeration)
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

    // Validate webhook secret format (should be 64 hex characters)
    if (!/^[a-f0-9]{64}$/i.test(webhookSecret)) {
      return {
        success: false,
        error:
          "Invalid webhook secret format. It should be a 64-character hex string.",
      };
    }

    // Update the webhook secret + audit log atomically
    await ctx.audited(
      async (tx) => {
        await tx
          .update(awsAccount)
          .set({
            webhookSecret,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(awsAccount.id, awsAccountId),
              eq(awsAccount.organizationId, organizationId)
            )
          );
      },
      () => ({
        action: "settings.webhook_secret_saved",
        resource: "aws_account",
        resourceId: awsAccountId,
      })
    );

    // Revalidate the page
    revalidatePath(
      `/${ctx.access.orgSlug}/settings/aws-accounts/${awsAccountId}`
    );

    ctx.log.info("Webhook secret saved");
    return {
      success: true,
      message: "Webhook secret saved successfully",
    };
  }
);

export type SaveDailyQuotaReserveResult =
  | { success: true; message: string }
  | { success: false; error: string };

type RenameAWSAccountResult =
  | { success: true; unchanged?: true }
  | { success: false; error: string };

/**
 * Rename an AWS account. Managers only: the Settings tab is manager-gated, and
 * this re-checks per-account manage access so a direct call cannot bypass it.
 */
export const renameAWSAccountAction = orgAction(
  {
    name: "renameAWSAccount",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (_awsAccountId: string, _name: string, organizationId: string) =>
      organizationId,
    onError: "Couldn't rename the AWS account. Please try again.",
  },
  async (
    ctx,
    awsAccountId: string,
    name: string,
    organizationId: string
  ): Promise<RenameAWSAccountResult> => {
    const access = await checkAWSAccountAccess({
      userId: ctx.access.userId,
      organizationId,
      awsAccountId,
      permission: "manage",
    });
    if (!access.authorized) {
      return {
        success: false,
        error: "You don't have permission to manage this AWS account",
      };
    }

    const parsed = renameAwsAccountSchema.safeParse({ name });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid name",
      };
    }
    const newName = parsed.data.name;

    // Scoped to the caller's org (prevents cross-org enumeration)
    const account = await db.query.awsAccount.findFirst({
      where: (a, { and: andOp, eq: eqOp }) =>
        andOp(eqOp(a.id, awsAccountId), eqOp(a.organizationId, organizationId)),
    });
    if (!account) {
      return { success: false, error: "AWS account not found" };
    }
    if (account.name === newName) {
      return { success: true, unchanged: true };
    }

    await ctx.audited(
      async (tx) => {
        await tx
          .update(awsAccount)
          .set({ name: newName, updatedAt: new Date() })
          .where(
            and(
              eq(awsAccount.id, awsAccountId),
              eq(awsAccount.organizationId, organizationId)
            )
          );
      },
      () => ({
        action: "aws_account.renamed",
        resource: "aws_account",
        resourceId: awsAccountId,
        metadata: { from: account.name, to: newName },
      })
    );

    revalidatePath(`/${ctx.access.orgSlug}/settings/aws-accounts`, "page");
    revalidatePath(
      `/${ctx.access.orgSlug}/settings/aws-accounts/${awsAccountId}`,
      "layout"
    );
    return { success: true };
  }
);

// SES's largest published daily-quota tier. A reserve above this is almost
// certainly a typo (e.g. an extra zero), not a real quota-protection value.
const MAX_DAILY_QUOTA_RESERVE = 14_000_000;

/**
 * Save the daily quota reserve for an AWS account: the number of emails/24h
 * that broadcasts must leave untouched so transactional sending never runs
 * out of SES daily quota. NULL disables the feature.
 */
export const saveDailyQuotaReserveAction = orgAction(
  {
    name: "saveDailyQuotaReserve",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (
      _awsAccountId: string,
      _reserve: number | null,
      organizationId: string
    ) => organizationId,
    onError: "Something went wrong. Please try again.",
  },
  async (
    ctx,
    awsAccountId: string,
    reserve: number | null,
    organizationId: string
  ): Promise<SaveDailyQuotaReserveResult> => {
    // Get the AWS account scoped to the caller's org (prevents cross-org enumeration)
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

    // Validate reserve: null (disable) or a non-negative integer within a
    // sane bound (obvious typo guard).
    if (
      reserve !== null &&
      (!Number.isInteger(reserve) ||
        reserve < 0 ||
        reserve > MAX_DAILY_QUOTA_RESERVE)
    ) {
      return {
        success: false,
        error: `Reserve must be a whole number between 0 and ${MAX_DAILY_QUOTA_RESERVE.toLocaleString()}.`,
      };
    }

    // Update the reserve + audit log atomically
    await ctx.audited(
      async (tx) => {
        await tx
          .update(awsAccount)
          .set({
            dailyQuotaReserve: reserve,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(awsAccount.id, awsAccountId),
              eq(awsAccount.organizationId, organizationId)
            )
          );
      },
      () => ({
        action: "settings.daily_quota_reserve_saved",
        resource: "aws_account",
        resourceId: awsAccountId,
        metadata: { reserve },
      })
    );

    // Revalidate the page
    revalidatePath(
      `/${ctx.access.orgSlug}/settings/aws-accounts/${awsAccountId}`,
      "layout"
    );

    ctx.log.info("Daily quota reserve saved");
    return {
      success: true,
      message:
        reserve === null
          ? "Daily quota reserve disabled"
          : "Daily quota reserve saved successfully",
    };
  }
);

/**
 * Remove webhook secret from an AWS account
 * This stops SES events from being sent to the Wraps dashboard
 */
export const removeWebhookSecretAction = orgAction(
  {
    name: "removeWebhookSecret",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (_awsAccountId: string, organizationId: string) => organizationId,
    onError: "Something went wrong. Please try again.",
  },
  async (
    ctx,
    awsAccountId: string,
    organizationId: string
  ): Promise<SaveWebhookSecretResult> => {
    // Get the AWS account scoped to the caller's org (prevents cross-org enumeration)
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

    // Remove the webhook secret + audit log atomically
    await ctx.audited(
      async (tx) => {
        await tx
          .update(awsAccount)
          .set({
            webhookSecret: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(awsAccount.id, awsAccountId),
              eq(awsAccount.organizationId, organizationId)
            )
          );
      },
      () => ({
        action: "settings.webhook_secret_removed",
        resource: "aws_account",
        resourceId: awsAccountId,
      })
    );

    // Revalidate the page
    revalidatePath(
      `/${ctx.access.orgSlug}/settings/aws-accounts/${awsAccountId}`
    );

    ctx.log.info("Webhook secret removed");
    return {
      success: true,
      message: "Webhook disconnected successfully",
    };
  }
);

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
export const getVerifiedDomains: (
  awsAccountId: string,
  organizationId: string,
  forceRefresh?: boolean
) => Promise<GetVerifiedDomainsResult> = orgAction(
  {
    name: "getVerifiedDomains",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (
      _awsAccountId: string,
      organizationId: string,
      _forceRefresh?: boolean
    ) => organizationId,
    onError: "Failed to fetch verified domains",
  },
  async (
    ctx,
    awsAccountId: string,
    organizationId: string,
    forceRefresh = false
  ): Promise<GetVerifiedDomainsResult> => {
    // CHARACTERIZATION: this try/catch stays — it returns a richer shape
    // (`errorCode`) than orgAction's generic `{ success: false, error }`
    // catch can produce, and production code branches on that field (e.g.
    // batch-form.tsx's "run `wraps platform update-role`" toast).
    try {
      // 1. Get AWS account
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

      // 2. Get credentials for the AWS account
      const credentials = await getOrAssumeRole({
        roleArn: account.roleArn,
        externalId: account.externalId,
      });

      const awsCredentials = {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      };

      // 3. List all email identities
      const sesClient = new SESv2Client({
        region: account.region,
        credentials: awsCredentials,
      });

      const listResponse = await sesClient.send(
        new ListEmailIdentitiesCommand({
          PageSize: 100, // Should be enough for most accounts
        })
      );

      ctx.log.info(
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

      // 4. Filter to verified identities and check configuration set
      const verifiedIdentities: VerifiedIdentity[] = [];

      // Get details for each identity to check config set
      // Using Promise.all for parallel requests
      const sendingEnabledIdentities = listResponse.EmailIdentities.filter(
        (identity) => identity.SendingEnabled === true
      );

      ctx.log.info(
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
            ctx.log.info({ identity: result }, "Identity details");
            return result;
          } catch (err) {
            ctx.log.warn(
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

      ctx.log.info(
        { count: verifiedIdentities.length },
        "Fetched verified identities"
      );

      // Force revalidation if requested
      if (forceRefresh) {
        revalidatePath(`/${ctx.access.orgSlug}/emails/broadcasts/new`);
      }

      return {
        success: true,
        identities: verifiedIdentities,
      };
    } catch (error) {
      const isAccessDenied = isCustomerRoleAccessError(error);

      if (isAccessDenied) {
        ctx.log.warn(
          { err: error },
          "AWS permission denied fetching verified domains"
        );
      } else {
        ctx.log.error({ err: error }, "Failed to fetch verified domains");
      }

      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch domains",
        errorCode: isAccessDenied ? "PERMISSION_DENIED" : "UNKNOWN",
      };
    }
  }
);

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
      errorCode?: "PERMISSION_DENIED" | "UNKNOWN";
    };

/**
 * Get SMS phone numbers for an AWS account
 */
export const getSMSPhoneNumbers: (
  awsAccountId: string,
  organizationId: string
) => Promise<GetSMSPhoneNumbersResult> = orgAction(
  {
    name: "getSMSPhoneNumbers",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (_awsAccountId: string, organizationId: string) => organizationId,
    onError: "Failed to fetch SMS phone numbers",
  },
  async (
    ctx,
    awsAccountId: string,
    organizationId: string
  ): Promise<GetSMSPhoneNumbersResult> => {
    // CHARACTERIZATION: this try/catch stays — it returns a richer shape
    // (`errorCode`) than orgAction's generic `{ success: false, error }`
    // catch can produce, and production code branches on that field.
    try {
      // 1. Get AWS account
      const account = await db.query.awsAccount.findFirst({
        where: (a, { and: andOp, eq: eqOp }) =>
          andOp(
            eqOp(a.id, awsAccountId),
            eqOp(a.organizationId, organizationId)
          ),
      });

      if (!account) {
        return {
          success: false,
          error: "AWS account not found",
        };
      }

      // 2. Check if SMS is enabled
      if (!account.smsEnabled) {
        return {
          success: true,
          phoneNumbers: [],
        };
      }

      // 3. Get AWS credentials
      const awsCredentials = await getOrAssumeRole(account);

      // 4. Get phone numbers from Pinpoint SMS Voice
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

      ctx.log.info({ count: phoneNumbers.length }, "Fetched SMS phone numbers");

      return {
        success: true,
        phoneNumbers,
      };
    } catch (error) {
      const isAccessDenied = isCustomerRoleAccessError(error);

      if (isAccessDenied) {
        ctx.log.warn(
          { err: error },
          "AWS permission denied fetching SMS phone numbers"
        );
      } else {
        ctx.log.error({ err: error }, "Failed to fetch SMS phone numbers");
      }

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch phone numbers",
        errorCode: isAccessDenied ? "PERMISSION_DENIED" : "UNKNOWN",
      };
    }
  }
);
