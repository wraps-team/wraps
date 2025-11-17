"use client";

import type { awsAccountPermission, user } from "@wraps/db";
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

type CurrentAccessProps = {
  permissions: PermissionWithUser[];
  awsAccountId: string;
  organizationId: string;
};

export function CurrentAccess({
  permissions,
  awsAccountId,
  organizationId,
}: CurrentAccessProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Access</CardTitle>
        <CardDescription>
          Manage who has access to this AWS account and their permission levels.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
            awsAccountId={awsAccountId}
            organizationId={organizationId}
            permissions={permissions}
          />
        )}
      </CardContent>
    </Card>
  );
}
