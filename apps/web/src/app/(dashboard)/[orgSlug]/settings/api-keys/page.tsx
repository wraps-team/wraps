import { redirect } from "next/navigation";
import { OrganizationSettingsApiKeys } from "@/components/organization-settings-api-keys";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";

type ApiKeysPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function ApiKeysPage({ params }: ApiKeysPageProps) {
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
        <h1 className="font-bold text-3xl">API Keys</h1>
        <p className="text-muted-foreground">
          Manage API keys for programmatic access to your organization.
        </p>
      </div>

      <OrganizationSettingsApiKeys
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
    return { title: "API Keys" };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return { title: "Organization Not Found" };
  }

  return {
    title: `API Keys | ${orgWithMembership.name} | Wraps`,
    description: `Manage API keys for ${orgWithMembership.name}`,
  };
}
