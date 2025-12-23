import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { listAWSAccounts } from "@/actions/aws-accounts";
import { listTemplatesForBatch } from "@/actions/batch";
import { getOrganizationWithMembership } from "@/lib/organization";
import { BatchForm } from "./components/batch-form";

type NewBatchPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function NewBatchPage({ params }: NewBatchPageProps) {
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
    redirect("/");
  }

  // Only owners and admins can create batch sends
  if (!["owner", "admin"].includes(orgWithMembership.userRole)) {
    redirect(`/${orgSlug}/send`);
  }

  // Fetch AWS accounts and templates in parallel
  const [awsAccountsResult, templatesResult] = await Promise.all([
    listAWSAccounts(orgWithMembership.id),
    listTemplatesForBatch(orgWithMembership.id),
  ]);

  const awsAccounts = awsAccountsResult.success
    ? awsAccountsResult.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        region: a.region,
      }))
    : [];

  const templates = templatesResult.success ? templatesResult.templates : [];

  return (
    <div className="px-4 lg:px-6">
      <BatchForm
        awsAccounts={awsAccounts}
        organizationId={orgWithMembership.id}
        orgSlug={orgSlug}
        templates={templates}
      />
    </div>
  );
}
