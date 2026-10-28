import { redirect } from "next/navigation";
import { AgentApprovalQueue } from "@/components/agent-approval-queue";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";

type ApprovalsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function AgentApprovalsPage({
  params,
}: ApprovalsPageProps) {
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
        <h1 className="font-bold text-3xl text-foreground">Approval queue</h1>
        <p className="text-muted-foreground">
          Flagged agent sends awaiting your decision. Pending requests appear
          first.
        </p>
      </div>

      <AgentApprovalQueue
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
    return { title: "Approval queue" };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return { title: "Organization Not Found" };
  }

  return {
    title: `Approval queue | ${orgWithMembership.name} | Wraps`,
    description: `Review flagged agent sends for ${orgWithMembership.name}`,
  };
}
