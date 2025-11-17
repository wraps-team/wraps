import { auth } from "@wraps/auth";
import type { awsAccountPermission, member, user } from "@wraps/db";
import { db } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AccountHeader } from "@/components/account-header";
import { getOrganizationBySlug } from "@/lib/organization";
import { checkAWSAccountAccess } from "@/lib/permissions/check-access";
import { CurrentAccess } from "./components/current-access";
import { GrantAccessCard } from "./components/grant-access";

type PermissionWithUser = InferSelectModel<typeof awsAccountPermission> & {
  user: InferSelectModel<typeof user>;
  grantedByUser: InferSelectModel<typeof user> | null;
};

type MemberWithUser = InferSelectModel<typeof member> & {
  user: InferSelectModel<typeof user>;
};

type PermissionsPageProps = {
  params: Promise<{
    orgSlug: string;
    accountId: string;
  }>;
};

export default async function PermissionsPage({
  params,
}: PermissionsPageProps) {
  const { orgSlug, accountId } = await params;

  // Get session
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    redirect("/auth");
  }

  // Get organization
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    redirect("/dashboard");
  }

  // Get AWS account
  const account = await db.query.awsAccount.findFirst({
    where: (a, { eq }) => eq(a.id, accountId),
  });

  if (!account || account.organizationId !== organization.id) {
    redirect(`/${orgSlug}/aws-accounts`);
  }

  // Check if user has manage permission
  const access = await checkAWSAccountAccess({
    userId: session.user.id,
    organizationId: organization.id,
    awsAccountId: accountId,
    permission: "manage",
  });

  if (!access.authorized) {
    redirect(`/${orgSlug}/aws-accounts/${accountId}`);
  }

  // Get all permissions for this AWS account
  const permissionsRaw = await db.query.awsAccountPermission.findMany({
    where: (p, { eq }) => eq(p.awsAccountId, accountId),
    with: {
      user: true,
      grantedByUser: true,
    },
  });

  // Type assertion for permissions
  const permissions = permissionsRaw as unknown as PermissionWithUser[];

  // Get all organization members for the grant form
  const membersRaw = await db.query.member.findMany({
    where: (m, { eq }) => eq(m.organizationId, organization.id),
    with: {
      user: true,
    },
  });

  // Type assertion for members
  const members = membersRaw as unknown as MemberWithUser[];

  // Check all permissions for current user
  const [viewAccess, sendAccess, manageAccess] = await Promise.all([
    checkAWSAccountAccess({
      userId: session.user.id,
      organizationId: organization.id,
      awsAccountId: accountId,
      permission: "view",
    }),
    checkAWSAccountAccess({
      userId: session.user.id,
      organizationId: organization.id,
      awsAccountId: accountId,
      permission: "send",
    }),
    checkAWSAccountAccess({
      userId: session.user.id,
      organizationId: organization.id,
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
    <div className="space-y-6 px-4 lg:px-6">
      {/* Header */}
      <AccountHeader
        account={account}
        orgSlug={orgSlug}
        permissions={userPermissions}
      />

      {/* Current Access */}
      <CurrentAccess
        awsAccountId={accountId}
        organizationId={organization.id}
        permissions={permissions}
      />

      {/* Grant Access */}
      <GrantAccessCard
        awsAccountId={accountId}
        members={members}
        organizationId={organization.id}
      />
    </div>
  );
}
