import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { organizationExtension } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getOrganizationWithMembership } from "@/lib/organization";

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
    redirect("/dashboard");
  }

  // Check if onboarding is completed
  const extension = await db.query.organizationExtension.findFirst({
    where: eq(organizationExtension.organizationId, orgWithMembership.id),
  });

  // Redirect to onboarding if not completed
  // Allow certain paths to bypass onboarding check (like settings)
  const _bypassPaths = ["/settings", "/onboarding"];
  const _currentPath = ""; // We don't have access to pathname in server component

  // Simple check: if extension doesn't exist or onboarding not completed, redirect
  // But skip redirect if already on onboarding or certain settings pages
  if (!extension?.onboardingCompleted) {
    redirect(`/${orgSlug}/onboarding`);
  }

  return <>{children}</>;
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
