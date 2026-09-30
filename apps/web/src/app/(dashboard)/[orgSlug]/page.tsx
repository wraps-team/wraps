import { auth } from "@wraps/auth";
import {
  batchSend,
  contactEvent,
  db,
  member,
  workflowExecution,
} from "@wraps/db";
import { count, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { refreshIdentitySnapshots } from "@/lib/aws/identity-refresh";
import { getOrganizationWithMembership } from "@/lib/organization";
import { getSetupStatus } from "@/lib/setup-status";
import { ExploreFirstDashboard } from "./components/explore-first-dashboard";
import { GettingStartedDashboard } from "./components/getting-started-dashboard";
import { OverviewDashboard } from "./components/overview-dashboard";

export type {
  AccountFeatures,
  AwsAccountData,
  SetupStatus,
} from "@/lib/setup-status";

type OrganizationDashboardProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export type RecentItem = {
  id: string;
  type: "broadcast" | "event" | "workflow";
  title: string;
  subtitle: string | null;
  timestamp: number;
  href: string;
};

async function getMemberCount(organizationId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  return result?.count ?? 1;
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
    db.query.workflowExecution.findMany({
      where: eq(workflowExecution.organizationId, organizationId),
      orderBy: desc(workflowExecution.createdAt),
      limit: 5,
      columns: {
        id: true,
        status: true,
        createdAt: true,
      },
      with: {
        workflow: { columns: { name: true } },
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
    const name = w.workflow?.name ?? "Workflow";
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
    headers: await headers(),
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

  // The overview reads a cached identities snapshot. When it claims no
  // verified domains, refresh it after the response is sent.
  if (setupStatus.hasAwsAccount && setupStatus.domainCount === 0) {
    after(() => refreshIdentitySnapshots(orgWithMembership.id));
  }

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

  // Fully set up — show overview dashboard
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

  // No AWS at all — show value-first explore dashboard
  if (!setupStatus.hasAnyAwsAccounts) {
    const memberCount = await getMemberCount(orgWithMembership.id);

    return (
      <ExploreFirstDashboard
        memberCount={memberCount}
        organizationName={orgWithMembership.name}
        orgSlug={orgSlug}
        setupStatus={setupStatus}
      />
    );
  }

  // Has AWS but not fully set up — show infrastructure checklist
  return (
    <GettingStartedDashboard
      awsAccount={awsAccountData}
      completionPercent={completionPercent}
      organizationId={orgWithMembership.id}
      organizationName={orgWithMembership.name}
      orgSlug={orgSlug}
      setupStatus={setupStatus}
      userEmail={session.user.email}
    />
  );
}
