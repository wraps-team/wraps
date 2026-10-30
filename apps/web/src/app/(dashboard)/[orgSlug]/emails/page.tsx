import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { Mail } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getCurrentSession } from "@/lib/current-session";
import {
  type HubDays,
  type HubTab,
  parseHubDays,
  parseHubTab,
} from "@/lib/emails-hub";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkHasAwsAccounts, getEmailsListStatus } from "@/lib/setup-status";
import { EngagementChart } from "./analytics/components/engagement-chart";
import { PerformanceMetrics } from "./analytics/components/performance-metrics";
import { RecentActivity } from "./analytics/components/recent-activity";
import { EmailAnalytics } from "./components/email-analytics";
import { EmailsHubHeader } from "./components/emails-hub-header";
import { EmailsHubTabs } from "./components/emails-hub-tabs";
import { EmailsTable } from "./components/emails-table";
import { EmailsTableSkeleton } from "./components/emails-table-skeleton";
import { AddressesToReview } from "./deliverability/components/addresses-to-review";
import { DeliverabilityBody } from "./deliverability/components/deliverability-card";
import { MetricSwitch } from "./deliverability/components/metric-switch";

type EmailsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    tab?: string;
    days?: string;
    q?: string;
    /** `asc` for oldest first. Absent or anything else means newest first. */
    sort?: string;
    status?: string;
  }>;
};

export default async function EmailsPage({
  params,
  searchParams,
}: EmailsPageProps) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const tab = parseHubTab(sp.tab);
  const days = parseHubDays(sp.days);
  const { q, sort, status } = sp;

  const session = await getCurrentSession();

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

  // Check if org has any AWS accounts before fetching
  const hasAccounts = await checkHasAwsAccounts(orgWithMembership.id);

  if (!hasAccounts) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Empty className="max-w-2xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Mail className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Email Activity</EmptyTitle>
            <EmptyDescription>
              See every email your application sends — delivery status, opens,
              clicks, and bounces in real time.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={`/${orgSlug}/setup`}>
                  Connect AWS to start sending
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <a
                  href="https://wraps.dev/docs/quickstart/email"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View documentation
                </a>
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <>
      {/* One block so the tabs sit under the description, not a full section
          gap away: the shell's gap-6 plus an mt-4 left 40px between them. */}
      <div className="flex flex-col gap-3">
        <EmailsHubHeader orgSlug={orgSlug} />
        <EmailsHubTabs days={days} orgSlug={orgSlug} tab={tab} />
      </div>

      <HubTabContent
        days={days}
        organizationId={orgWithMembership.id}
        orgSlug={orgSlug}
        q={q}
        sort={sort}
        status={status}
        tab={tab}
      />
    </>
  );
}

type HubTabContentProps = {
  days: HubDays;
  orgSlug: string;
  organizationId: string;
  q?: string;
  sort?: string;
  status?: string;
  tab: HubTab;
};

/**
 * Renders only the open tab. Inactive tabs are not rendered at all, so their
 * queries never run.
 */
function HubTabContent({
  days,
  orgSlug,
  organizationId,
  q,
  sort,
  status,
  tab,
}: HubTabContentProps) {
  if (tab === "engagement") {
    return (
      <div className="@container/main space-y-6 px-4 lg:px-6">
        <EngagementChart orgSlug={orgSlug} />
        <PerformanceMetrics orgSlug={orgSlug} />
        <RecentActivity orgSlug={orgSlug} />
      </div>
    );
  }

  if (tab === "deliverability") {
    return (
      <div className="@container/main space-y-6 px-4 lg:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-lg">Deliverability</h2>
          <MetricSwitch />
        </div>
        <DeliverabilityBody orgSlug={orgSlug} />
        <Suspense fallback={null}>
          <AddressesToReviewSection
            organizationId={organizationId}
            orgSlug={orgSlug}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <>
      {/* Email Activity */}
      <div className="px-4 lg:px-6">
        <EmailAnalytics orgSlug={orgSlug} />
      </div>

      {/*
        The table's own boundary (audit finding F16). The table needs two extra
        facts from the database to tell its zero-states apart; the chart needs
        none. Without a boundary here the whole page - chart included - waits on
        that query before a single byte streams.
      */}
      <div className="@container/main px-4 lg:px-6">
        <Suspense fallback={<EmailsTableSkeleton />}>
          <EmailsTableSection
            days={days}
            organizationId={organizationId}
            orgSlug={orgSlug}
            search={q}
            sort={sort}
            status={status}
          />
        </Suspense>
      </div>
    </>
  );
}

/**
 * The accounts load here, not on the page, so the other tabs never run this
 * query and the card renders without waiting on it.
 */
async function AddressesToReviewSection({
  organizationId,
  orgSlug,
}: {
  organizationId: string;
  orgSlug: string;
}) {
  const accounts = await db.query.awsAccount.findMany({
    where: eq(awsAccount.organizationId, organizationId),
    columns: { id: true, name: true, region: true },
  });

  return (
    <AddressesToReview
      accounts={accounts}
      organizationId={organizationId}
      orgSlug={orgSlug}
    />
  );
}

type EmailsTableSectionProps = {
  days: number;
  organizationId: string;
  orgSlug: string;
  search?: string;
  sort?: string;
  status?: string;
};

async function EmailsTableSection({
  days,
  organizationId,
  orgSlug,
  search,
  sort,
  status,
}: EmailsTableSectionProps) {
  const { hasEverSent, sandboxStatus } =
    await getEmailsListStatus(organizationId);

  return (
    <EmailsTable
      days={days}
      hasEverSent={hasEverSent}
      organizationId={organizationId}
      orgSlug={orgSlug}
      sandboxStatus={sandboxStatus}
      search={search}
      sort={sort}
      status={status}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getCurrentSession();

  if (!session?.user) {
    return { title: "Emails" };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return { title: "Organization Not Found" };
  }

  return {
    title: `Emails | ${orgWithMembership.name}`,
    description: `Message history and delivery events for ${orgWithMembership.name}`,
  };
}
