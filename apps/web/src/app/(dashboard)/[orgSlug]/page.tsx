import { auth } from "@wraps/auth";
import { redirect } from "next/navigation";
import { getOrganizationWithMembership } from "@/lib/organization";

type OrganizationDashboardProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function OrganizationDashboard({
  params,
}: OrganizationDashboardProps) {
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
    redirect("/emails");
  }

  return (
    <>
      {/* Page Title and Description */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">
            {orgWithMembership.name} Dashboard
          </h1>
          <p className="text-muted-foreground">
            Welcome to your organization dashboard
          </p>
        </div>
      </div>

      <div className="@container/main space-y-6 px-4 lg:px-6">
        {/* Organization dashboard content will go here */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-2 font-semibold text-lg">Quick Stats</h2>
          <p className="text-muted-foreground text-sm">
            Organization statistics and insights will appear here.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border bg-card p-6">
            <h3 className="mb-1 font-medium">AWS Accounts</h3>
            <p className="text-muted-foreground text-sm">
              Manage your connected AWS accounts
            </p>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <h3 className="mb-1 font-medium">Team Members</h3>
            <p className="text-muted-foreground text-sm">
              View and manage organization members
            </p>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <h3 className="mb-1 font-medium">Email Activity</h3>
            <p className="text-muted-foreground text-sm">
              Track your email sending activity
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
