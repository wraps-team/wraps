import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { OrganizationSettingsForm } from "@/components/organization-settings-form";
import { getOrganizationWithMembership } from "@/lib/organization";

type OrganizationSettingsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function OrganizationSettingsPage({
  params,
}: OrganizationSettingsPageProps) {
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
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Organization Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization settings and preferences.
        </p>
      </div>

      <OrganizationSettingsForm
        organization={orgWithMembership}
        userRole={orgWithMembership.userRole}
      />
    </div>
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
      title: "Organization Settings",
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
    title: `Settings | ${orgWithMembership.name} | Wraps`,
    description: `Manage settings for ${orgWithMembership.name}`,
  };
}
