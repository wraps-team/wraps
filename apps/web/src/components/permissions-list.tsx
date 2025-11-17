"use client";

import type { awsAccountPermission, user } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { useState } from "react";
import { toast } from "sonner";
import { revokeAccessAction } from "@/actions/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type PermissionWithUser = InferSelectModel<typeof awsAccountPermission> & {
  user: InferSelectModel<typeof user>;
  grantedByUser: InferSelectModel<typeof user> | null;
};

type PermissionsListProps = {
  permissions: PermissionWithUser[];
  awsAccountId: string;
  organizationId: string;
};

export function PermissionsList({
  permissions,
  awsAccountId,
  organizationId,
}: PermissionsListProps) {
  const [revoking, setRevoking] = useState<string | null>(null);

  const handleRevoke = async (userId: string) => {
    if (!confirm("Are you sure you want to revoke this user's access?")) {
      return;
    }

    setRevoking(userId);
    try {
      const result = await revokeAccessAction(userId, awsAccountId);
      if ("error" in result) {
        toast.error(`Error: ${result.error}`);
      } else {
        toast.success("Access revoked successfully");
        // Refresh the page to show updated permissions
        window.location.reload();
      }
    } catch (error) {
      console.error("Error revoking access:", error);
      toast.error("Failed to revoke access");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-3">
      {permissions.map((permission, index) => {
        const isExpired =
          permission.expiresAt && new Date(permission.expiresAt) < new Date();

        return (
          <div key={permission.id}>
            <div className="flex items-start justify-between py-3">
              <div className="flex-1 space-y-2">
                <div>
                  <h4 className="font-medium text-sm">
                    {permission.user.name}
                  </h4>
                  <p className="text-muted-foreground text-xs">
                    {permission.user.email}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {Array.isArray(permission.permissions) &&
                    permission.permissions.map((perm) => (
                      <Badge key={perm} variant="secondary">
                        {perm}
                      </Badge>
                    ))}
                  {isExpired && <Badge variant="destructive">Expired</Badge>}
                </div>

                <div className="space-y-0.5 text-muted-foreground text-xs">
                  <p>
                    Granted by {permission.grantedByUser?.name || "Unknown"} on{" "}
                    {new Date(permission.createdAt).toLocaleDateString()}
                  </p>
                  {permission.expiresAt && (
                    <p>
                      Expires{" "}
                      {new Date(permission.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              <Button
                disabled={revoking === permission.userId}
                loading={revoking === permission.userId}
                onClick={() => handleRevoke(permission.userId)}
                size="sm"
                type="button"
                variant="destructive"
              >
                Revoke
              </Button>
            </div>
            {index < permissions.length - 1 && <Separator />}
          </div>
        );
      })}
    </div>
  );
}
