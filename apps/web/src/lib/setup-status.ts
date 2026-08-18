import {
  awsAccount,
  batchSend,
  contact,
  db,
  messageSend,
  template,
  workflow,
} from "@wraps/db";
import { and, count, eq, isNotNull, ne } from "drizzle-orm";
import { cache } from "react";
import { queryEmailEvents } from "@/lib/aws/dynamodb";

export type AccountFeatures = {
  email?: {
    configSetName?: string;
    sandbox?: boolean;
    archivingEnabled?: boolean;
    archiveArn?: string;
    eventHistoryEnabled?: boolean;
    eventTrackingEnabled?: boolean;
    customTrackingDomain?: string;
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
} | null;

type AwsAccountRecord = {
  id: string;
  isVerified: boolean;
  region: string;
  features: unknown;
};

export type SetupStatus = {
  hasAwsAccount: boolean;
  hasAnyAwsAccounts: boolean;
  hasPlatformConnection: boolean;
  hasVerifiedDomain: boolean;
  hasSentEmail: boolean;
  hasTemplate: boolean;
  hasBroadcast: boolean;
  hasContact: boolean;
  hasWorkflow: boolean;
  verifiedDomains: string[];
  awsRegion: string | null;
  emailCount: number;
  sandboxStatus: boolean | null;
  awsAccountId: string | null;
  domainCount: number;
};

export type AwsAccountData = {
  id: string;
  webhookSecret: string | null;
  features: AccountFeatures;
} | null;

/** Extract verified domains from a single AWS account */
function extractDomainsFromAccount(account: AwsAccountRecord): string[] {
  const features = account.features as AccountFeatures;
  const identities = features?.email?.identities || [];
  return identities.filter((i) => i.type === "DOMAIN").map((i) => i.identity);
}

/** Get domains and region from verified accounts */
function getDomainsAndRegion(accounts: AwsAccountRecord[]): {
  verifiedDomains: string[];
  awsRegion: string | null;
} {
  const verifiedDomains: string[] = [];
  let awsRegion: string | null = null;

  for (const account of accounts) {
    if (account.isVerified) {
      awsRegion = account.region;
      verifiedDomains.push(...extractDomainsFromAccount(account));
    }
  }

  return { verifiedDomains, awsRegion };
}

/** Check if any emails have been sent across verified accounts */
async function checkEmailsSent(
  accounts: AwsAccountRecord[]
): Promise<{ hasSentEmail: boolean; emailCount: number }> {
  for (const account of accounts) {
    if (!account.isVerified) {
      continue;
    }

    try {
      const events = await queryEmailEvents({
        awsAccountId: account.id,
        startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        endTime: new Date(),
        limit: 10,
      });
      if (events.length > 0) {
        return { hasSentEmail: true, emailCount: events.length };
      }
    } catch {
      // Account may not have DynamoDB table yet, continue
    }
  }

  return { hasSentEmail: false, emailCount: 0 };
}

/**
 * Check if organization has any AWS accounts.
 *
 * Request-deduped like the `lib/organization.ts` helpers, because it sits on
 * the critical path of four dashboard pages and is called again inside the
 * emails page's own Suspense boundary.
 */
export const checkHasAwsAccounts = cache(
  async (organizationId: string): Promise<boolean> => {
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, organizationId),
      columns: { id: true },
    });
    return accounts.length > 0;
  }
);

export type EmailsListStatus = {
  /** Any email send on record, in any window. */
  hasEverSent: boolean;
  /** `true` in the SES sandbox, `false` in production, `null` never scanned. */
  sandboxStatus: boolean | null;
};

/**
 * The two facts the emails list needs to tell its zero-states apart
 * (audit finding F6).
 *
 * `hasEverSent` separates "this organization has never sent" from "nothing
 * landed in the selected window" - only the second may talk about the time
 * range. `sandboxStatus` separates both from the organization AWS will reject,
 * for which "send your first email" is advice that cannot be followed.
 *
 * The send probe matches the predicate the list and the chart already share:
 * this organization, `channel = 'email'`, a non-null `sentAt`. `null` sandbox
 * means the account's SES settings have never been scanned, and is reported as
 * unknown rather than guessed at.
 */
export const getEmailsListStatus = cache(
  async (organizationId: string): Promise<EmailsListStatus> => {
    const [accounts, sends] = await Promise.all([
      db.query.awsAccount.findMany({
        where: eq(awsAccount.organizationId, organizationId),
        columns: { isVerified: true, features: true },
      }),
      db
        .select({ id: messageSend.id })
        .from(messageSend)
        .where(
          and(
            eq(messageSend.organizationId, organizationId),
            eq(messageSend.channel, "email"),
            isNotNull(messageSend.sentAt)
          )
        )
        .limit(1),
    ]);

    // Prefer a verified account's answer; fall back to any account that has
    // been scanned. Only report `true` when SES actually said sandbox.
    const ordered = [
      ...accounts.filter((a) => a.isVerified),
      ...accounts.filter((a) => !a.isVerified),
    ];
    let sandboxStatus: boolean | null = null;
    for (const account of ordered) {
      const value = (account.features as AccountFeatures)?.email?.sandbox;
      if (typeof value === "boolean") {
        sandboxStatus = value;
        break;
      }
    }

    return { hasEverSent: sends.length > 0, sandboxStatus };
  }
);

/** Check if organization has any contacts */
async function checkHasContacts(organizationId: string): Promise<boolean> {
  const [result] = await db
    .select({ count: count() })
    .from(contact)
    .where(eq(contact.organizationId, organizationId));
  return (result?.count ?? 0) > 0;
}

/** Check if organization has any templates */
async function checkHasTemplates(organizationId: string): Promise<boolean> {
  const [result] = await db
    .select({ count: count() })
    .from(template)
    .where(eq(template.organizationId, organizationId));
  return (result?.count ?? 0) > 0;
}

/** Check if organization has any email broadcasts */
async function checkHasBroadcasts(organizationId: string): Promise<boolean> {
  const [result] = await db
    .select({ count: count() })
    .from(batchSend)
    .where(
      and(
        eq(batchSend.organizationId, organizationId),
        eq(batchSend.channel, "email"),
        ne(batchSend.status, "draft")
      )
    );
  return (result?.count ?? 0) > 0;
}

/** Check if organization has any workflows */
async function checkHasWorkflows(organizationId: string): Promise<boolean> {
  const [result] = await db
    .select({ count: count() })
    .from(workflow)
    .where(eq(workflow.organizationId, organizationId));
  return (result?.count ?? 0) > 0;
}

export async function getSetupStatus(organizationId: string): Promise<{
  setupStatus: SetupStatus;
  awsAccount: AwsAccountData;
}> {
  // Get AWS accounts for this organization
  const accounts = await db.query.awsAccount.findMany({
    where: eq(awsAccount.organizationId, organizationId),
  });

  const hasAwsAccount =
    accounts.length > 0 && accounts.some((a) => a.isVerified);

  // Check if platform connection is configured (webhookSecret set)
  const hasPlatformConnection = accounts.some((a) => a.webhookSecret !== null);

  // Get domain and region info
  const { verifiedDomains, awsRegion } = getDomainsAndRegion(accounts);
  const hasVerifiedDomain = verifiedDomains.length > 0;

  const hasAnyAwsAccounts = accounts.length > 0;

  // Check email, template, broadcast, contact, and workflow status in parallel
  const [emailStatus, hasTemplate, hasBroadcast, hasContact, hasWorkflow] =
    await Promise.all([
      checkEmailsSent(accounts),
      checkHasTemplates(organizationId),
      checkHasBroadcasts(organizationId),
      checkHasContacts(organizationId),
      checkHasWorkflows(organizationId),
    ]);

  // Get first verified account for inline actions
  const firstVerifiedAccount = accounts.find((a) => a.isVerified);
  const awsAccountData: AwsAccountData = firstVerifiedAccount
    ? {
        id: firstVerifiedAccount.id,
        webhookSecret: firstVerifiedAccount.webhookSecret,
        features: firstVerifiedAccount.features as AccountFeatures,
      }
    : null;

  // Sandbox status: true = in sandbox, false = production, null = not yet scanned
  const sandboxStatus = firstVerifiedAccount
    ? ((firstVerifiedAccount.features as AccountFeatures)?.email?.sandbox ??
      null)
    : null;

  return {
    setupStatus: {
      hasAwsAccount,
      hasAnyAwsAccounts,
      hasPlatformConnection,
      hasVerifiedDomain,
      hasSentEmail: emailStatus.hasSentEmail,
      hasTemplate,
      hasBroadcast,
      hasContact,
      hasWorkflow,
      verifiedDomains,
      awsRegion,
      emailCount: emailStatus.emailCount,
      sandboxStatus,
      awsAccountId: firstVerifiedAccount?.id ?? null,
      domainCount: verifiedDomains.length,
    },
    awsAccount: awsAccountData,
  };
}
