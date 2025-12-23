import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount, organizationExtension } from "@wraps/db/schema/app";
import { subscription } from "@wraps/db/schema/auth";
import { and, eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ProductsStatusHydrator } from "@/components/products-status-hydrator";
import { getOrganizationWithMembership } from "@/lib/organization";
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

  // Validate user has access to this organization
  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    // User doesn't have access to this organization
    redirect("/");
  }

  // Check if onboarding is completed
  const extension = await db.query.organizationExtension.findFirst({
    where: eq(organizationExtension.organizationId, orgWithMembership.id),
  });

  // Redirect to onboarding if not completed
  if (!extension?.onboardingCompleted) {
    redirect(`/${orgSlug}/onboarding`);
  }

  // Verify user has an active subscription (required for dashboard access)
  // Users must subscribe during onboarding to access the dashboard
  const activeSubscription = await db.query.subscription.findFirst({
    where: and(
      eq(subscription.referenceId, orgWithMembership.id),
      or(eq(subscription.status, "active"), eq(subscription.status, "trialing"))
    ),
  });

  // If subscription is cancelled/expired, redirect to upgrade page
  if (!activeSubscription) {
    redirect(`/${orgSlug}/upgrade`);
  }

  // Fetch products status from AWS accounts
  const accounts = await db.query.awsAccount.findMany({
    where: eq(awsAccount.organizationId, orgWithMembership.id),
    columns: {
      eventHistoryEnabled: true,
      eventTrackingEnabled: true,
      smsEnabled: true,
    },
  });

  // Get plan from subscription (source of truth)
  const rawPlanId = activeSubscription.plan;
  const planId: PlanId = ["starter", "pro", "growth", "scale"].includes(
    rawPlanId
  )
    ? (rawPlanId as PlanId)
    : "starter";
  const plan = PLANS[planId];

  const productsStatus = {
    emailEnabled: accounts.some(
      (a) => a.eventHistoryEnabled || a.eventTrackingEnabled
    ),
    smsEnabled: accounts.some((a) => a.smsEnabled),
    hasAwsAccounts: accounts.length > 0,
    planId,
    planFeatures: {
      batch: plan.features.batch,
      topics: plan.features.topics,
      segments: plan.features.segments,
      campaigns: plan.features.campaigns,
      workflows: plan.features.workflows,
      events: plan.features.events,
    },
  };

  return (
    <>
      <ProductsStatusHydrator
        orgId={orgWithMembership.id}
        status={productsStatus}
      />
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
