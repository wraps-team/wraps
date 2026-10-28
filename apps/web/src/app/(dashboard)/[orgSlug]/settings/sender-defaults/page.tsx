import { awsAccount, db } from "@wraps/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSenderDefaultsAction } from "@/actions/organizations";
import { SenderDefaultsForm } from "@/components/sender-defaults-form";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";

type SenderDefaultsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function SenderDefaultsPage({
  params,
}: SenderDefaultsPageProps) {
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

  // Fetch AWS accounts for the organization
  const awsAccounts = await db.query.awsAccount.findMany({
    where: eq(awsAccount.organizationId, orgWithMembership.id),
    columns: {
      id: true,
      name: true,
      region: true,
      smsEnabled: true,
    },
  });

  // Fetch current sender defaults
  const defaultsResult = await getSenderDefaultsAction(orgSlug);
  const defaults = defaultsResult.success ? defaultsResult.defaults : null;

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Sender Defaults</h1>
        <p className="text-muted-foreground">
          Configure default sender information for emails and SMS. These
          defaults will be used when creating new workflows and broadcasts.
        </p>
      </div>

      <SenderDefaultsForm
        awsAccounts={awsAccounts}
        defaults={defaults}
        organizationId={orgWithMembership.id}
        orgSlug={orgSlug}
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
      title: "Sender Defaults",
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
    title: `Sender Defaults | ${orgWithMembership.name} | Wraps`,
    description: `Configure sender defaults for ${orgWithMembership.name}`,
  };
}
