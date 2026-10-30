"use client";

import type { awsAccountPermission, member, user } from "@wraps/db";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import type { InferSelectModel } from "drizzle-orm";
import { PermissionsList } from "@/components/permissions-list";

type PermissionWithUser = InferSelectModel<typeof awsAccountPermission> & {
  user: InferSelectModel<typeof user>;
  grantedByUser: InferSelectModel<typeof user> | null;
};

type MemberWithUser = InferSelectModel<typeof member> & {
  user: InferSelectModel<typeof user>;
};

type CurrentAccessProps = {
  permissions: PermissionWithUser[];
  owners: MemberWithUser[];
  awsAccountId: string;
  organizationId: string;
};

export function CurrentAccess({
  permissions,
  owners,
  awsAccountId,
  organizationId,
}: CurrentAccessProps) {
  const hasAnyAccess = owners.length > 0 || permissions.length > 0;

  return (
    // Who has access is Wraps' own record (members and grants), not data
    // read from the customer's AWS account, so this panel stays default.
    <Panel
      description="Manage who has access to this AWS account and their permission levels."
      label={<PanelTitle>Current Access</PanelTitle>}
    >
      {hasAnyAccess ? (
        <PermissionsList
          awsAccountId={awsAccountId}
          organizationId={organizationId}
          owners={owners}
          permissions={permissions}
        />
      ) : (
        <div className="border p-12 text-center">
          <p className="text-muted-foreground">No access configured</p>
        </div>
      )}
    </Panel>
  );
}
