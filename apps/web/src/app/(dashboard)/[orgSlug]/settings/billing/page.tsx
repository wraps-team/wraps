import { redirect } from "next/navigation";
import { OrganizationSettingsBilling } from "@/components/organization-settings-billing";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";

type BillingPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function BillingPage({ params }: BillingPageProps) {
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
        <h1 className="font-bold text-3xl">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and billing information.
        </p>
      </div>

      <OrganizationSettingsBilling
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
    return { title: "Billing" };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return { title: "Organization Not Found" };
  }

  return {
    title: `Billing | ${orgWithMembership.name} | Wraps`,
    description: `Manage billing for ${orgWithMembership.name}`,
  };
}
