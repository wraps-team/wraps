import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getOrganizationWithMembership } from "@/lib/organization";

type OnboardingOrgLayoutProps = {
  children: ReactNode;
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function OnboardingOrgLayout({
  children,
  params,
}: OnboardingOrgLayoutProps) {
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
    redirect("/dashboard");
  }

  // Allow onboarding to proceed without checking completion status
  return <>{children}</>;
}
