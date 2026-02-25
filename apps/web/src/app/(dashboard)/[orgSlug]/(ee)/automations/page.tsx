import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { listAutomations } from "@/actions/automations";
import { FeatureGate } from "@/components/feature-gate";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkFeatureAccess, getOrganizationPlan } from "@/lib/plan-limits";
import { getRequiredPlan, type PlanId } from "@/lib/plans";
import { WorkflowsTable } from "./components/workflows-table";

type AutomationsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
  }>;
};

export default async function AutomationsPage({
  params,
  searchParams,
}: AutomationsPageProps) {
  const { orgSlug } = await params;
  const { page = "1", pageSize = "20", search, status } = await searchParams;

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

  // Check if workflows feature is available for this plan
  const [featureCheck, planId] = await Promise.all([
    checkFeatureAccess(orgWithMembership.id, "automations"),
    getOrganizationPlan(orgWithMembership.id),
  ]);

  // No subscription - redirect to upgrade (shouldn't happen due to layout guard)
  if (!planId) {
    redirect(`/${orgSlug}/upgrade`);
  }

  const currentPlanId = planId;
  const requiredPlan = getRequiredPlan("automations") || "free";

  // If feature not allowed, show upgrade prompt
  if (!featureCheck.allowed) {
    return (
      <>
        <div className="px-4 lg:px-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-bold text-2xl tracking-tight">Automations</h1>
            <p className="text-muted-foreground">
              Create automated workflows triggered by events
            </p>
          </div>
        </div>
        <div className="px-4 lg:px-6">
          <FeatureGate
            currentPlanId={currentPlanId}
            feature="Automations"
            featureDescription="Create powerful automated workflows that trigger based on contact events, schedules, or API calls. Send emails, SMS, and more based on user behavior."
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

  // Fetch automations
  const workflowsResult = await listAutomations(orgWithMembership.id, {
    page: Number.parseInt(page, 10),
    pageSize: Number.parseInt(pageSize, 10),
    search: search || undefined,
    status: status as "draft" | "enabled" | "paused" | "archived" | undefined,
  });

  const workflows = workflowsResult.success ? workflowsResult.automations : [];
  const total = workflowsResult.success ? workflowsResult.total : 0;

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Automations</h1>
          <p className="text-muted-foreground">
            Create automated workflows triggered by events
          </p>
        </div>
      </div>

      {/* Workflows Table */}
      <div className="@container/main px-4 lg:px-6">
        <WorkflowsTable
          organizationId={orgWithMembership.id}
          orgSlug={orgSlug}
          total={total}
          userRole={orgWithMembership.userRole}
          workflows={workflows}
        />
      </div>
    </>
  );
}
