import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { listTopics } from "@/actions/topics";
import { FeatureGate } from "@/components/feature-gate";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkFeatureAccess, getOrganizationPlan } from "@/lib/plan-limits";
import { getRequiredPlan, type PlanId } from "@/lib/plans";
import { TopicsTable } from "./components/topics-table";

type TopicsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function TopicsPage({ params }: TopicsPageProps) {
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

  // Check if topics feature is available for this plan
  const [featureCheck, planId] = await Promise.all([
    checkFeatureAccess(orgWithMembership.id, "topics"),
    getOrganizationPlan(orgWithMembership.id),
  ]);

  // No subscription - redirect to upgrade (shouldn't happen due to layout guard)
  if (!planId) {
    redirect(`/${orgSlug}/upgrade`);
  }

  const currentPlanId = planId;
  const requiredPlan = getRequiredPlan("topics") || "pro";

  // If feature not allowed, show upgrade prompt
  if (!featureCheck.allowed) {
    return (
      <>
        <div className="px-4 lg:px-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-bold text-2xl tracking-tight">Topics</h1>
            <p className="text-muted-foreground">
              Manage subscription topics for your audience
            </p>
          </div>
        </div>
        <div className="px-4 lg:px-6">
          <FeatureGate
            currentPlanId={currentPlanId}
            feature="Topics"
            featureDescription="Create subscription topics to let contacts manage their email preferences. Build trust with granular opt-in/out controls."
            isAllowed={false}
            orgSlug={orgSlug}
            requiredPlanId={requiredPlan as PlanId}
          >
            {null}
          </FeatureGate>
        </div>
      </>
    );
  }

  const topicsResult = await listTopics(orgWithMembership.id);
  const topics = topicsResult.success ? topicsResult.topics : [];

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Topics</h1>
          <p className="text-muted-foreground">
            Manage subscription topics for your audience
          </p>
        </div>
      </div>

      {/* Topics Table */}
      <div className="@container/main px-4 lg:px-6">
        <TopicsTable
          organizationId={orgWithMembership.id}
          orgSlug={orgSlug}
          topics={topics}
          userRole={orgWithMembership.userRole}
        />
      </div>
    </>
  );
}
