import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { member, organization } from "@wraps/db/schema/auth";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    redirect("/auth");
  }

  // Check if user has an active organization in their session
  const activeOrgId = (session.session as { activeOrganizationId?: string })
    .activeOrganizationId;

  if (activeOrgId) {
    const activeOrg = await db.query.organization.findFirst({
      where: eq(organization.id, activeOrgId),
    });

    if (activeOrg?.slug) {
      redirect(`/${activeOrg.slug}`);
    }
  }

  // Get all organizations the user is a member of
  const userMemberships = await db.query.member.findMany({
    where: eq(member.userId, session.user.id),
    orderBy: (members, { asc }) => [asc(members.createdAt)],
  });

  // Get the full organization details for each membership
  const userOrgs = await Promise.all(
    userMemberships.map(async (m) => {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, m.organizationId),
      });
      return { organization: org, role: m.role };
    })
  );

  // Filter out any null organizations
  const validOrgs = userOrgs.filter(
    (
      item
    ): item is {
      organization: NonNullable<typeof item.organization>;
      role: string;
    } => item.organization !== null && item.organization !== undefined
  );

  // If user has exactly 1 org, redirect to it
  if (validOrgs.length === 1 && validOrgs[0].organization.slug) {
    redirect(`/${validOrgs[0].organization.slug}`);
  }

  // If user has multiple orgs, show organization selector
  if (validOrgs.length > 1) {
    return (
      <>
        <div className="px-4 lg:px-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-bold text-2xl tracking-tight">
              Select an Organization
            </h1>
            <p className="text-muted-foreground">
              Choose an organization to view its dashboard
            </p>
          </div>
        </div>

        <div className="@container/main px-4 lg:px-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {validOrgs.map(({ organization: org, role }) => (
              <a
                className="group relative rounded-lg border bg-card p-6 transition-colors hover:bg-accent"
                href={`/${org.slug}`}
                key={org.id}
              >
                <div className="flex items-start gap-4">
                  {org.logo ? (
                    <img
                      alt={org.name}
                      className="h-12 w-12 rounded-lg object-cover"
                      src={org.logo}
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">
                      {org.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold group-hover:text-foreground">
                      {org.name}
                    </h3>
                    <p className="text-muted-foreground text-sm capitalize">
                      {role}
                    </p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </>
    );
  }

  // If user has no orgs, show onboarding with create form
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">
            Welcome to Wraps
          </h1>
          <p className="text-muted-foreground">
            Get started by creating your first organization
          </p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6">
        <div className="mx-auto max-w-md">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="mb-6 text-center">
              <h2 className="mb-2 font-semibold text-xl">
                Create Your Organization
              </h2>
              <p className="text-muted-foreground text-sm">
                Organizations help you manage your team and email infrastructure
              </p>
            </div>
            <CreateOrganizationFormClient />
          </div>
        </div>
      </div>
    </>
  );
}

// Client component wrapper for the form
function CreateOrganizationFormClient() {
  const {
    CreateOrganizationForm,
  } = require("@/components/forms/create-organization-form");
  return <CreateOrganizationForm />;
}
