import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
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
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkHasAwsAccounts } from "@/lib/setup-status";
import { AnalyticsOverview } from "./components/analytics-overview";
import { AnalyticsRefreshButton } from "./components/analytics-refresh-button";
import { BounceTypeChart } from "./components/bounce-type-chart";
import { ComplaintChart } from "./components/complaint-chart";
import { DeliverabilityChart } from "./components/deliverability-chart";
import { EmailVolumeChart } from "./components/email-volume-chart";
import { EngagementChart } from "./components/engagement-chart";
import { PerformanceMetrics } from "./components/performance-metrics";
import { RecentActivity } from "./components/recent-activity";
import { SuppressionChart } from "./components/suppression-chart";

type AnalyticsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function AnalyticsPage({ params }: AnalyticsPageProps) {
  const { orgSlug } = await params;
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

  // Check if org has any AWS accounts
  const hasAccounts = await checkHasAwsAccounts(orgWithMembership.id);

  if (!hasAccounts) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
        <Empty className="max-w-2xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BarChart3 className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Email Analytics</EmptyTitle>
            <EmptyDescription>
              Deep insights into your email performance — delivery rates,
              engagement metrics, bounce analysis, and reputation monitoring
              across all your AWS accounts.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={`/${orgSlug}/setup`}>
                Connect AWS to see analytics
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-bold text-2xl tracking-tight">
              Email Analytics
            </h1>
            <p className="text-muted-foreground">
              Deep insights into your email performance and engagement
            </p>
          </div>
          <AnalyticsRefreshButton orgSlug={orgSlug} />
        </div>
      </div>

      {/* Analytics Content */}
      <div className="@container/main space-y-6 px-4 lg:px-6">
        {/* Overview Stats */}
        <AnalyticsOverview orgSlug={orgSlug} />

        {/* Main Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <EmailVolumeChart orgSlug={orgSlug} />
          <DeliverabilityChart orgSlug={orgSlug} showChangeMarkers />
        </div>

        {/* Engagement Section */}
        <EngagementChart orgSlug={orgSlug} />

        {/* Reputation Monitoring */}
        <div className="grid gap-6 lg:grid-cols-3">
          <BounceTypeChart orgSlug={orgSlug} showChangeMarkers />
          <SuppressionChart orgSlug={orgSlug} showChangeMarkers />
          <ComplaintChart orgSlug={orgSlug} showChangeMarkers />
        </div>

        {/* Performance Metrics */}
        <PerformanceMetrics orgSlug={orgSlug} />

        {/* Recent Activity */}
        <RecentActivity orgSlug={orgSlug} />
      </div>
    </>
  );
}
