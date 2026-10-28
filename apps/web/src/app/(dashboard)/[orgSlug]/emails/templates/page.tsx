import { redirect } from "next/navigation";
import { TemplatesList } from "@/components/template-editor/templates-list";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";

type PageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function TemplatesPage({ params }: PageProps) {
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
    <div className="px-4 lg:px-6">
      <div className="mb-6">
        <h1 className="font-semibold text-2xl">Email Templates</h1>
        <p className="text-muted-foreground">
          Create and manage your email templates
        </p>
      </div>
      <TemplatesList organizationId={orgWithMembership.id} orgSlug={orgSlug} />
    </div>
  );
}
