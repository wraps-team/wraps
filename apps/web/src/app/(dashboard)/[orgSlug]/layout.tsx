import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { GoLiveBanner } from "@/components/go-live-banner";
import { ProductsStatusHydrator } from "@/components/products-status-hydrator";
import {
  getOrganizationWithDashboardData,
  getOrganizationWithMembership,
} from "@/lib/organization";
import { getOrganizationPlan, isSelfHosted } from "@/lib/plan-limits";
import { PLANS } from "@/lib/plans";
import type { AccountFeatures } from "@/lib/setup-status";

/**
 * SES sandbox state for the organization, or `null` when no connected account
 * has been scanned. Prefers a verified account's answer and never guesses:
 * "unknown" is a different thing to say than "in the sandbox".
 */
function resolveSandboxStatus(
  accounts: Array<{ features: unknown; isVerified: boolean }>
): boolean | null {
  const ordered = [
    ...accounts.filter((a) => a.isVerified),
    ...accounts.filter((a) => !a.isVerified),
  ];
  for (const account of ordered) {
    const value = (account.features as AccountFeatures)?.email?.sandbox;
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

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

  // Self-hosted orgs are licensed via WRAPS_LICENSE_KEY and have no Stripe
  // subscription — don't bounce them to the upgrade page.
  const selfHosted = isSelfHosted();

  // If subscription is cancelled/expired, redirect to upgrade page
  if (!(selfHosted || orgData.activeSubscription)) {
    redirect(`/${orgSlug}/upgrade`);
  }

  // Plan source of truth: license key (self-hosted) then subscription.
  const planId = await getOrganizationPlan(orgData.id);
  const plan = PLANS[planId];

  const productsStatus = {
    emailEnabled: orgData.awsAccounts.some((a) => a.emailEnabled),
    smsEnabled: orgData.awsAccounts.some((a) => a.smsEnabled),
    hasAwsAccounts: orgData.awsAccounts.length > 0,
    sandboxStatus: resolveSandboxStatus(orgData.awsAccounts),
    planId,
    planFeatures: {
      batch: plan.features.batch,
      topics: plan.features.topics,
      segments: plan.features.segments,
      campaigns: plan.features.campaigns,
      workflows: plan.features.workflows,
      events: plan.features.events,
    },
    memberCount: orgData.memberCount,
    userRole: orgData.userRole,
  };

  return (
    <>
      <ProductsStatusHydrator orgId={orgData.id} status={productsStatus} />
      {/*
        The banner used to be gated on `!hasAwsAccounts`, which meant it
        disappeared the moment an account was connected - exactly when an
        organization stuck in the SES sandbox is most stuck, and reading as
        "you are done". It now decides for itself (audit finding F6).
      */}
      <GoLiveBanner orgSlug={orgSlug} />
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
    // A plain string here augments the root layout's own `%s | Wraps`
    // template (see .next-docs generate-metadata.mdx, "title" > "template");
    // this segment must not add its own "| Wraps" suffix or every page in
    // the org that doesn't set its own title reads "{org} | Wraps | Wraps"
    // in the tab (audit F19). Pages that DO set their own title (contacts,
    // segments, topics, emails, ...) are unaffected either way - they
    // augment the same root template directly.
    title: orgWithMembership.name,
    description: `${orgWithMembership.name} dashboard on Wraps`,
  };
}
