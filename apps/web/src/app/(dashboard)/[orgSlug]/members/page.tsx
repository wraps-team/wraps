import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { MembersPageContent } from "@/components/members/members-page-content";
import { getOrganizationWithMembership } from "@/lib/organization";

interface MembersPageProps {
  params: Promise<{
    orgSlug: string;
  }>;
}

export default async function MembersPage({ params }: MembersPageProps) {
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
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">Team Members</h1>
          <p className="text-muted-foreground">
            Manage your organization's team members and their roles
          </p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6">
        <MembersPageContent
          organizationId={orgWithMembership.id}
          organizationSlug={orgSlug}
          userRole={orgWithMembership.userRole}
        />
      </div>
    </>
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
      title: "Members",
    };
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    return {
      title: "Members Not Found",
    };
  }

  return {
    title: `Team Members | ${orgWithMembership.name} | Wraps`,
    description: `Manage team members for ${orgWithMembership.name}`,
  };
}
