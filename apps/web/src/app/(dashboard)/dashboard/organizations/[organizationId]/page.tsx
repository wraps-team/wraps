import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AWSAccountList } from "@/components/aws-account-list";
import { ConnectAWSAccountForm } from "@/components/forms/connect-aws-account-form";
import { OrganizationSwitcher } from "@/components/organization-switcher";

interface OrganizationPageProps {
  params: Promise<{
    organizationId: string;
  }>;
}

export default async function OrganizationPage({
  params,
}: OrganizationPageProps) {
  const { organizationId } = await params;

  // Get session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth");
  }

  // Check if user is member of this organization
  const membership = await db.query.member.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.userId, session.user.id), eq(m.organizationId, organizationId)),
  });

  if (!membership) {
    notFound();
  }

  // Get organization details
  const organization = await db.query.organization.findFirst({
    where: (o, { eq }) => eq(o.id, organizationId),
  });

  if (!organization) {
    notFound();
  }

  // Get all organizations user is a member of (for switcher)
  const allMemberships = await db.query.member.findMany({
    where: (m, { eq }) => eq(m.userId, session.user.id),
    with: {
      organization: true,
    },
  });

  const userOrganizations = allMemberships.map((m) => m.organization);

  // Get AWS accounts for this organization
  const awsAccounts = await db.query.awsAccount.findMany({
    where: (a, { eq }) => eq(a.organizationId, organizationId),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });

  const canManageAccounts = ["owner", "admin"].includes(membership.role);

  // Check permissions for each AWS account
  const { checkAWSAccountAccess } = await import(
    "@/lib/permissions/check-access"
  );

  const accountsWithPermissions = await Promise.all(
    awsAccounts.map(async (account) => {
      // Owners have all permissions
      if (membership.role === "owner") {
        return {
          ...account,
          permissions: {
            canView: true,
            canSend: true,
            canManage: true,
          },
        };
      }

      // Check each permission for non-owners
      const [viewAccess, sendAccess, manageAccess] = await Promise.all([
        checkAWSAccountAccess({
          userId: session.user.id,
          organizationId,
          awsAccountId: account.id,
          permission: "view",
        }),
        checkAWSAccountAccess({
          userId: session.user.id,
          organizationId,
          awsAccountId: account.id,
          permission: "send",
        }),
        checkAWSAccountAccess({
          userId: session.user.id,
          organizationId,
          awsAccountId: account.id,
          permission: "manage",
        }),
      ]);

      return {
        ...account,
        permissions: {
          canView: viewAccess.authorized,
          canSend: sendAccess.authorized,
          canManage: manageAccess.authorized,
        },
      };
    })
  );

  return (
    <div className="container mx-auto space-y-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-4">
          <OrganizationSwitcher
            activeOrganizationId={organizationId}
            organizations={userOrganizations}
          />
          <div>
            <h1 className="font-bold text-3xl">{organization.name}</h1>
            <p className="text-muted-foreground">
              Manage AWS accounts and permissions
            </p>
          </div>
        </div>
        {canManageAccounts && (
          <div>
            <a
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
              href={"#connect-account"}
            >
              Connect AWS Account
            </a>
          </div>
        )}
      </div>

      {/* AWS Accounts List */}
      <section>
        <h2 className="mb-4 font-semibold text-xl">AWS Accounts</h2>
        {accountsWithPermissions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="mb-4 text-muted-foreground">
              No AWS accounts connected yet
            </p>
            {canManageAccounts && (
              <p className="text-muted-foreground text-sm">
                Connect your first AWS account to get started
              </p>
            )}
          </div>
        ) : (
          <AWSAccountList
            accounts={accountsWithPermissions}
            organizationId={organizationId}
          />
        )}
      </section>

      {/* Connect AWS Account Form */}
      {canManageAccounts && (
        <section id="connect-account">
          <h2 className="mb-4 font-semibold text-xl">Connect New Account</h2>
          <ConnectAWSAccountForm
            onSuccess={() => {
              // Refresh the page to show the new account
              window.location.reload();
            }}
            organizationId={organizationId}
          />
        </section>
      )}
    </div>
  );
}
