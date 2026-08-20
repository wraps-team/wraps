import { auth } from "@wraps/auth";
import { CircleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { getPropertyKeys, listSegments } from "@/actions/segments";
import { UNAUTHORIZED } from "@/actions/shared/org-action";
import { listTopics } from "@/actions/topics";
import { FeatureGate } from "@/components/feature-gate";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
  const [featureCheck, planId] = await Promise.all([
    checkFeatureAccess(orgWithMembership.id, "segments"),
    getOrganizationPlan(orgWithMembership.id),
  ]);

  // No subscription - redirect to upgrade (shouldn't happen due to layout guard)
  if (!planId) {
    redirect(`/${orgSlug}/upgrade`);
  }

  const currentPlanId = planId;
  const requiredPlan = getRequiredPlan("segments") || "starter";

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

  // Every page state - error or populated - gets the same heading, so
  // assistive tech and tab-switching always have a page identity (audit F19).
  const heading = (
    <div className="px-4 lg:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl tracking-tight">Segments</h1>
        <p className="text-muted-foreground">
          Create dynamic audience segments based on contact attributes and
          behavior
        </p>
      </div>
    </div>
  );

  // A failed fetch must never fall through to "No segments found" - that is
  // audit finding F6. Read the result before deciding anything about
  // emptiness (which `SegmentsTable` itself still handles for the genuine
  // zero-segments and filtered-to-zero cases).
  if (!segmentsResult.success) {
    return (
      <>
        {heading}
        <div className="px-4 lg:px-6">
          <SegmentsLoadError
            isUnauthorized={segmentsResult.error === UNAUTHORIZED}
            orgSlug={orgSlug}
          />
        </div>
      </>
    );
  }

  const segments = segmentsResult.segments;
  // Topics and property keys feed the segment builder's condition editor -
  // useful, but not what the page is about. A failure here degrades to an
  // empty list rather than blocking the page the way a failed segments
  // fetch does above.
  const topics = topicsResult.success ? topicsResult.topics : [];
  const propertyKeys = propertyKeysResult.success
    ? propertyKeysResult.keys
    : [];

  return (
    <>
      {heading}

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

/**
 * Renders in place of the segments table when `listSegments` itself failed.
 * Distinct from "no segments found" (handled inside `SegmentsTable`): the
 * org's segments may simply be unreachable right now, not absent.
 */
function SegmentsLoadError({
  isUnauthorized,
  orgSlug,
}: {
  isUnauthorized: boolean;
  orgSlug: string;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlert className="size-6" />
        </EmptyMedia>
        <EmptyTitle>
          {isUnauthorized
            ? "You don't have access to segments"
            : "We couldn't load your segments"}
        </EmptyTitle>
        <EmptyDescription>
          {isUnauthorized
            ? "Your role in this organization doesn't include segment access. Ask an organization admin to update your permissions."
            : "Something went wrong while loading your segments. Your segments are unaffected — reloading the page usually fixes this."}
        </EmptyDescription>
      </EmptyHeader>
      {isUnauthorized ? null : (
        <EmptyContent>
          <Button asChild size="sm">
            <a href={`/${orgSlug}/segments`}>Try again</a>
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    return { title: "Segments" };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return { title: "Organization Not Found" };
  }

  return {
    title: `Segments | ${orgWithMembership.name}`,
    description: `Dynamic audience segments for ${orgWithMembership.name}`,
  };
}
