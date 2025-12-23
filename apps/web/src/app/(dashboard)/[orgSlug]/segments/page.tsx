import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { getPropertyKeys, listSegments } from "@/actions/segments";
import { listTopics } from "@/actions/topics";
import { FeatureGate } from "@/components/feature-gate";
import { getOrganizationWithMembership } from "@/lib/organization";
import { checkFeatureAccess, getOrganizationPlan } from "@/lib/plan-limits";
import { getRequiredPlan, type PlanId } from "@/lib/plans";
import { SegmentsTable } from "./components/segments-table";

type SegmentsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function SegmentsPage({ params }: SegmentsPageProps) {
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

  // Check if segments feature is available for this plan
  const [featureCheck, currentPlanId] = await Promise.all([
    checkFeatureAccess(orgWithMembership.id, "segments"),
    getOrganizationPlan(orgWithMembership.id),
  ]);

  const requiredPlan = getRequiredPlan("segments") || "pro";

  // If feature not allowed, show upgrade prompt
  if (!featureCheck.allowed) {
    return (
      <>
        <div className="px-4 lg:px-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-bold text-2xl tracking-tight">Segments</h1>
            <p className="text-muted-foreground">
              Create dynamic audience segments based on contact attributes and
              behavior
            </p>
          </div>
        </div>
        <div className="px-4 lg:px-6">
          <FeatureGate
            currentPlanId={currentPlanId}
            feature="Segments"
            featureDescription="Create dynamic audience segments to target specific groups of contacts based on their properties, engagement, and topic subscriptions."
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

  // Fetch segments, topics, and property keys in parallel
  const [segmentsResult, topicsResult, propertyKeysResult] = await Promise.all([
    listSegments(orgWithMembership.id),
    listTopics(orgWithMembership.id),
    getPropertyKeys(orgWithMembership.id),
  ]);

  const segments = segmentsResult.success ? segmentsResult.segments : [];
  const topics = topicsResult.success ? topicsResult.topics : [];
  const propertyKeys = propertyKeysResult.success
    ? propertyKeysResult.keys
    : [];

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Segments</h1>
          <p className="text-muted-foreground">
            Create dynamic audience segments based on contact attributes and
            behavior
          </p>
        </div>
      </div>

      {/* Segments Table */}
      <div className="@container/main px-4 lg:px-6">
        <SegmentsTable
          organizationId={orgWithMembership.id}
          orgSlug={orgSlug}
          propertyKeys={propertyKeys}
          segments={segments}
          topics={topics}
          userRole={orgWithMembership.userRole}
        />
      </div>
    </>
  );
}
