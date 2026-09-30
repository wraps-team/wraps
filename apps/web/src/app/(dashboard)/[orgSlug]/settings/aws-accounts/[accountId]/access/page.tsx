import type { awsAccountPermission, member, user } from "@wraps/db";
import { db } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { loadAccountPage } from "../lib/load-account";
import { CurrentAccess } from "./components/current-access";
import { GrantAccessCard } from "./components/grant-access";

type PermissionWithUser = InferSelectModel<typeof awsAccountPermission> & {
  user: InferSelectModel<typeof user>;
  grantedByUser: InferSelectModel<typeof user> | null;
};

type MemberWithUser = InferSelectModel<typeof member> & {
  user: InferSelectModel<typeof user>;
};

type AccessPageProps = {
  params: Promise<{
    orgSlug: string;
    accountId: string;
  }>;
};

export default async function AccessPage({ params }: AccessPageProps) {
  const { orgSlug, accountId } = await params;

  // Account-scoped, so no `region`. Requires manage.
  const { organization } = await loadAccountPage({
    orgSlug,
    accountId,
    tab: "/access",
    require: "manage",
  });

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

  // Get organization owners (they have implicit full access)
  const owners = members.filter((m) => m.role === "owner");

  return (
    <div className="space-y-6">
      {/* Current Access */}
      <CurrentAccess
        awsAccountId={accountId}
        organizationId={organization.id}
        owners={owners}
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
