import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AccountHeader } from "@/components/account-header";
import { GrantAccessForm } from "@/components/forms/grant-access-form";
import { PermissionsList } from "@/components/permissions-list";
import { checkAWSAccountAccess } from "@/lib/permissions/check-access";

interface PermissionsPageProps {
  params: Promise<{
    organizationId: string;
    accountId: string;
  }>;
}

export default async function PermissionsPage({
  params,
}: PermissionsPageProps) {
  const { organizationId, accountId } = await params;

  // Get session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth");
  }

  // Get AWS account
  const account = await db.query.awsAccount.findFirst({
    where: (a, { eq }) => eq(a.id, accountId),
  });

  if (!account || account.organizationId !== organizationId) {
    notFound();
  }

  // Check if user has manage permission
  const access = await checkAWSAccountAccess({
    userId: session.user.id,
    organizationId,
    awsAccountId: accountId,
    permission: "manage",
  });

  if (!access.authorized) {
    redirect(
      `/dashboard/organizations/${organizationId}/aws-accounts/${accountId}`
    );
  }

  // Get all permissions for this AWS account
  const permissions = await db.query.awsAccountPermission.findMany({
    where: (p, { eq }) => eq(p.awsAccountId, accountId),
    with: {
      user: true,
      grantedByUser: true,
    },
  });

  // Get all organization members for the grant form
  const members = await db.query.member.findMany({
    where: (m, { eq }) => eq(m.organizationId, organizationId),
    with: {
      user: true,
    },
  });

  // Check all permissions for current user
  const [viewAccess, sendAccess, manageAccess] = await Promise.all([
    checkAWSAccountAccess({
      userId: session.user.id,
      organizationId,
      awsAccountId: accountId,
      permission: "view",
    }),
    checkAWSAccountAccess({
      userId: session.user.id,
      organizationId,
      awsAccountId: accountId,
      permission: "send",
    }),
    checkAWSAccountAccess({
      userId: session.user.id,
      organizationId,
      awsAccountId: accountId,
      permission: "manage",
    }),
  ]);

  const userPermissions = {
    canView: viewAccess.authorized,
    canSend: sendAccess.authorized,
    canManage: manageAccess.authorized,
  };

  return (
    <div className="container mx-auto space-y-8 py-8">
      {/* Header */}
      <AccountHeader
        account={account}
        organizationId={organizationId}
        permissions={userPermissions}
      />

      {/* Permissions List */}
      <section>
        <h2 className="mb-4 font-semibold text-xl">Current Access</h2>
        {permissions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">
              No explicit permissions granted yet
            </p>
            <p className="mt-2 text-muted-foreground text-sm">
              Organization owners have full access by default
            </p>
          </div>
        ) : (
          <PermissionsList
            awsAccountId={accountId}
            organizationId={organizationId}
            permissions={permissions}
          />
        )}
      </section>

      {/* Grant Access Form */}
      <section>
        <h2 className="mb-4 font-semibold text-xl">Grant Access</h2>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <GrantAccessForm
            awsAccountId={accountId}
            members={members}
            organizationId={organizationId}
          />
        </div>
      </section>
    </div>
  );
}
