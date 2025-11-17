"use client";

import type { awsAccountPermission, member, user } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { PermissionsList } from "@/components/permissions-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <Card>
      <CardHeader>
        <CardTitle>Current Access</CardTitle>
        <CardDescription>
          Manage who has access to this AWS account and their permission levels.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasAnyAccess ? (
          <PermissionsList
            awsAccountId={awsAccountId}
            organizationId={organizationId}
            owners={owners}
            permissions={permissions}
          />
        ) : (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">No access configured</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
