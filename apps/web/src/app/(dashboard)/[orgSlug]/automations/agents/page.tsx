import { redirect } from "next/navigation";
import { AgentsList } from "@/components/agents-list";
import { getCurrentSession } from "@/lib/current-session";
import { getOrganizationWithMembership } from "@/lib/organization";

type AgentsPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function AgentsPage({ params }: AgentsPageProps) {
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
        <h1 className="font-bold text-3xl text-foreground">Agents</h1>
        <p className="text-muted-foreground">
          Give every agent an email address, with a leash. Manage sending
          agents, their policies, and the kill switch.
        </p>
      </div>

      <AgentsList
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
    return { title: "Agents" };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return { title: "Organization Not Found" };
  }

  return {
    title: `Agents | ${orgWithMembership.name} | Wraps`,
    description: `Manage sending agents for ${orgWithMembership.name}`,
  };
}
