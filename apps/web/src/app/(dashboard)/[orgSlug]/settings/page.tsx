import { redirect } from "next/navigation";
import { OrganizationSettingsGeneral } from "@/components/organization-settings-general";
import { getCurrentSession } from "@/lib/current-session";
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
  const session = await getCurrentSession();

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

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">General Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization name, slug, and branding.
        </p>
      </div>

      <OrganizationSettingsGeneral
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
  const session = await getCurrentSession();

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
