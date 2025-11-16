import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { getOrganizationWithMembership } from "@/lib/organization";
import { AnalyticsOverview } from "./components/analytics-overview";
import { DeliverabilityChart } from "./components/deliverability-chart";
import { EmailVolumeChart } from "./components/email-volume-chart";
import { EngagementChart } from "./components/engagement-chart";
import { PerformanceMetrics } from "./components/performance-metrics";
import { RecentActivity } from "./components/recent-activity";
import { TopPerformers } from "./components/top-performers";

type AnalyticsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function AnalyticsPage({ params }: AnalyticsPageProps) {
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
    redirect("/dashboard");
  }

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Email Analytics</h1>
          <p className="text-muted-foreground">
            Deep insights into your email performance and engagement
          </p>
        </div>
      </div>

      {/* Analytics Content */}
      <div className="@container/main space-y-6 px-4 lg:px-6">
        {/* Overview Stats */}
        <AnalyticsOverview orgSlug={orgSlug} />

        {/* Main Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <EmailVolumeChart orgSlug={orgSlug} />
          <DeliverabilityChart orgSlug={orgSlug} />
        </div>

        {/* Engagement Section */}
        <EngagementChart orgSlug={orgSlug} />

        {/* Performance Metrics */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PerformanceMetrics orgSlug={orgSlug} />
          </div>
          <TopPerformers orgSlug={orgSlug} />
        </div>

        {/* Recent Activity */}
        <RecentActivity orgSlug={orgSlug} />
      </div>
    </>
  );
}
