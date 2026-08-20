import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { CircleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { getVerifiedDomains } from "@/actions/aws-accounts";
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
import { TopicsTabs } from "./components/topics-tabs";

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
  const requiredPlan = getRequiredPlan("topics") || "starter";

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

  // Fetch topics, settings, and verified domains in parallel
  const [topicsResult, settings, account] = await Promise.all([
    listTopics(orgWithMembership.id),
    db.query.topicSettings.findFirst({
      where: (s, { eq }) => eq(s.organizationId, orgWithMembership.id),
    }),
    db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.organizationId, orgWithMembership.id),
    }),
  ]);

  // Every page state - error or populated - gets the same heading, so
  // assistive tech and tab-switching always have a page identity (audit F19).
  const heading = (
    <div className="px-4 lg:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl tracking-tight">Topics</h1>
        <p className="text-muted-foreground">
          Manage subscription topics for your audience
        </p>
      </div>
    </div>
  );

  // A failed fetch must never fall through to "No topics found" - that is
  // audit finding F6. Read the result before deciding anything about
  // emptiness (which `TopicsTabs` itself still handles for the genuine
  // zero-topics case).
  if (!topicsResult.success) {
    return (
      <>
        {heading}
        <div className="px-4 lg:px-6">
          <TopicsLoadError
            isUnauthorized={topicsResult.error === UNAUTHORIZED}
            orgSlug={orgSlug}
          />
        </div>
      </>
    );
  }

  const topics = topicsResult.topics;

  // Get verified domains from the organization's AWS account
  let verifiedDomains: string[] = [];
  if (account) {
    const domainsResult = await getVerifiedDomains(
      account.id,
      orgWithMembership.id
    );
    if (domainsResult.success) {
      verifiedDomains = domainsResult.identities
        .filter((i) => i.type === "DOMAIN")
        .map((i) => i.identity);
    }
  }

  return (
    <>
      {heading}

      {/* Topics Tabs */}
      <div className="@container/main px-4 lg:px-6">
        <TopicsTabs
          brandColor={orgWithMembership.brandColor}
          organizationId={orgWithMembership.id}
          orgLogo={orgWithMembership.logo}
          orgName={orgWithMembership.name}
          orgSlug={orgSlug}
          settings={settings ?? null}
          topics={topics}
          userRole={orgWithMembership.userRole}
          verifiedDomains={verifiedDomains}
        />
      </div>
    </>
  );
}

/**
 * Renders in place of the topics tabs when `listTopics` itself failed.
 * Distinct from "no topics found" (handled inside `TopicsTabs`): the org's
 * topics may simply be unreachable right now, not absent.
 *
 * The `topicSettings` / `awsAccount` lookups above this component's call
 * site are deliberately left unguarded - a throw there (this is the exact
 * query that broke on the missing `preference_center_theme` column,
 * 2026-07-30) now unwinds to this segment's own `error.tsx` instead of
 * taking the whole dashboard shell with it.
 */
function TopicsLoadError({
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
            ? "You don't have access to topics"
            : "We couldn't load your topics"}
        </EmptyTitle>
        <EmptyDescription>
          {isUnauthorized
            ? "Your role in this organization doesn't include topic access. Ask an organization admin to update your permissions."
            : "Something went wrong while loading your topics. Your topics and subscribers are unaffected — reloading the page usually fixes this."}
        </EmptyDescription>
      </EmptyHeader>
      {isUnauthorized ? null : (
        <EmptyContent>
          <Button asChild size="sm">
            <a href={`/${orgSlug}/topics`}>Try again</a>
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
    return { title: "Topics" };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return { title: "Organization Not Found" };
  }

  return {
    title: `Topics | ${orgWithMembership.name}`,
    description: `Subscription topics for ${orgWithMembership.name}`,
  };
}
