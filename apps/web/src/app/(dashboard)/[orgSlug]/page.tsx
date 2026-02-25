import { auth } from "@wraps/auth";
import {
  automationExecution,
  awsAccount,
  batchSend,
  contactEvent,
  db,
  template,
} from "@wraps/db";
import { and, count, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { queryEmailEvents } from "@/lib/aws/dynamodb";
import { getOrganizationWithMembership } from "@/lib/organization";
import { GettingStartedDashboard } from "./components/getting-started-dashboard";
import { OverviewDashboard } from "./components/overview-dashboard";

type OrganizationDashboardProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export type SetupStatus = {
  hasAwsAccount: boolean;
  hasPlatformConnection: boolean;
  hasVerifiedDomain: boolean;
  hasSentEmail: boolean;
  hasTemplate: boolean;
  hasBroadcast: boolean;
  verifiedDomains: string[];
  awsRegion: string | null;
  emailCount: number;
};

export type AwsAccountData = {
  id: string;
  webhookSecret: string | null;
  features: AccountFeatures;
} | null;

type AwsAccountRecord = {
  id: string;
  isVerified: boolean;
  region: string;
  features: unknown;
};

export type RecentItem = {
  id: string;
  type: "broadcast" | "event" | "workflow";
  title: string;
  subtitle: string | null;
  timestamp: number;
  href: string;
};

export type AccountFeatures = {
  email?: {
    configSetName?: string;
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
        eq(batchSend.channel, "email")
      )
    );
  return (result?.count ?? 0) > 0;
}

async function getSetupStatus(organizationId: string): Promise<{
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

  // Check email, template, and broadcast status in parallel
  const [emailStatus, hasTemplate, hasBroadcast] = await Promise.all([
    checkEmailsSent(accounts),
    checkHasTemplates(organizationId),
    checkHasBroadcasts(organizationId),
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

  return {
    setupStatus: {
      hasAwsAccount,
      hasPlatformConnection,
      hasVerifiedDomain,
      hasSentEmail: emailStatus.hasSentEmail,
      hasTemplate,
      hasBroadcast,
      verifiedDomains,
      awsRegion,
      emailCount: emailStatus.emailCount,
    },
    awsAccount: awsAccountData,
  };
}

async function getRecentItems(
  organizationId: string,
  orgSlug: string
): Promise<RecentItem[]> {
  const [recentBatches, recentEvents, recentWorkflows] = await Promise.all([
    db.query.batchSend.findMany({
      where: eq(batchSend.organizationId, organizationId),
      orderBy: desc(batchSend.createdAt),
      limit: 5,
      columns: {
        id: true,
        name: true,
        channel: true,
        status: true,
        totalRecipients: true,
        createdAt: true,
      },
    }),
    db.query.contactEvent.findMany({
      where: eq(contactEvent.organizationId, organizationId),
      orderBy: desc(contactEvent.createdAt),
      limit: 5,
      columns: {
        id: true,
        eventName: true,
        contactId: true,
        createdAt: true,
      },
      with: {
        contact: {
          columns: { email: true, firstName: true },
        },
      },
    }),
    db.query.automationExecution.findMany({
      where: eq(automationExecution.organizationId, organizationId),
      orderBy: desc(automationExecution.createdAt),
      limit: 5,
      columns: {
        id: true,
        status: true,
        createdAt: true,
      },
      with: {
        automation: { columns: { name: true } },
        contact: { columns: { email: true, firstName: true } },
      },
    }),
  ]);

  const items: RecentItem[] = [];

  for (const b of recentBatches) {
    const label = b.name ?? `${b.channel} broadcast`;
    const recipients = `${b.totalRecipients} recipients`;
    items.push({
      id: `batch-${b.id}`,
      type: "broadcast",
      title: `${label} — ${b.status}`,
      subtitle: recipients,
      timestamp: b.createdAt.getTime(),
      href: `/${orgSlug}/emails/broadcasts/${b.id}`,
    });
  }

  for (const e of recentEvents) {
    const who = e.contact?.firstName ?? e.contact?.email ?? "Unknown";
    items.push({
      id: `event-${e.id}`,
      type: "event",
      title: e.eventName,
      subtitle: who,
      timestamp: e.createdAt.getTime(),
      href: `/${orgSlug}/events`,
    });
  }

  for (const w of recentWorkflows) {
    const name = w.automation?.name ?? "Automation";
    const who = w.contact?.firstName ?? w.contact?.email ?? "";
    items.push({
      id: `workflow-${w.id}`,
      type: "workflow",
      title: `${name} — ${w.status}`,
      subtitle: who || null,
      timestamp: w.createdAt.getTime(),
      href: `/${orgSlug}/automations`,
    });
  }

  return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
}

export default async function OrganizationDashboard({
  params,
}: OrganizationDashboardProps) {
  const { orgSlug } = await params;
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    redirect("/auth");
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    redirect("/");
  }

  const { setupStatus, awsAccount: awsAccountData } = await getSetupStatus(
    orgWithMembership.id
  );

  // Calculate completion percentage
  const requiredSteps = [
    setupStatus.hasAwsAccount,
    setupStatus.hasPlatformConnection,
    setupStatus.hasVerifiedDomain,
    setupStatus.hasSentEmail,
  ];
  const completedRequired = requiredSteps.filter(Boolean).length;
  const completionPercent = Math.round(
    (completedRequired / requiredSteps.length) * 100
  );

  // If all required steps are complete, show overview dashboard
  if (completionPercent === 100) {
    const recentItems = await getRecentItems(orgWithMembership.id, orgSlug);

    return (
      <OverviewDashboard
        organizationId={orgWithMembership.id}
        organizationName={orgWithMembership.name}
        orgSlug={orgSlug}
        recentItems={recentItems}
        setupStatus={setupStatus}
      />
    );
  }

  return (
    <GettingStartedDashboard
      awsAccount={awsAccountData}
      completionPercent={completionPercent}
      organizationId={orgWithMembership.id}
      organizationName={orgWithMembership.name}
      orgSlug={orgSlug}
      setupStatus={setupStatus}
    />
  );
}
