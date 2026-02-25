import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ProductsStatusHydrator } from "@/components/products-status-hydrator";
import {
  getOrganizationWithDashboardData,
  getOrganizationWithMembership,
} from "@/lib/organization";
import { PLANS, type PlanId } from "@/lib/plans";

type OrganizationLayoutProps = {
  children: ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function OrganizationLayout({
  children,
  params,
}: OrganizationLayoutProps) {
  const { orgSlug } = await params;
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    redirect("/auth");
  }

  // Single relational query to fetch organization with all dashboard data
  const orgData = await getOrganizationWithDashboardData(
    orgSlug,
    session.user.id
  );

  if (!orgData) {
    // User doesn't have access to this organization
    redirect("/");
  }

  // Redirect to onboarding if not completed
  if (!orgData.extension?.onboardingCompleted) {
    redirect(`/${orgSlug}/onboarding`);
  }

  // If subscription is cancelled/expired, redirect to upgrade page
  if (!orgData.activeSubscription) {
    redirect(`/${orgSlug}/upgrade`);
  }

  // Get plan from subscription (source of truth)
  const rawPlanId = orgData.activeSubscription.plan;
  const planId: PlanId = ["free", "starter", "growth", "scale"].includes(
    rawPlanId
  )
    ? (rawPlanId as PlanId)
    : "free";
  const plan = PLANS[planId];

  const productsStatus = {
    emailEnabled: orgData.awsAccounts.some((a) => a.emailEnabled),
    smsEnabled: orgData.awsAccounts.some((a) => a.smsEnabled),
    hasAwsAccounts: orgData.awsAccounts.length > 0,
    planId,
    planFeatures: {
      batch: plan.features.batch,
      topics: plan.features.topics,
      segments: plan.features.segments,
      campaigns: plan.features.campaigns,
      automations: plan.features.automations,
      events: plan.features.events,
    },
  };

  return (
    <>
      <ProductsStatusHydrator orgId={orgData.id} status={productsStatus} />
      {children}
    </>
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
    return {
      title: "Organization",
    };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return {
      title: "Organization Not Found",
    };
  }

  return {
    title: `${orgWithMembership.name} | Wraps`,
    description: `${orgWithMembership.name} dashboard on Wraps`,
  };
}
