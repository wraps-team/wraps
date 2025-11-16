"use client";

import type { awsAccountPermission, user } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { useState } from "react";
import { revokeAccessAction } from "@/actions/permissions";

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
        alert(`Error: ${result.error}`);
      } else {
        // Refresh the page to show updated permissions
        window.location.reload();
      }
    } catch (error) {
      console.error("Error revoking access:", error);
      alert("Failed to revoke access");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-4">
      {permissions.map((permission) => {
        const isExpired =
          permission.expiresAt && new Date(permission.expiresAt) < new Date();

        return (
          <div
            className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
            key={permission.id}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div>
                  <h3 className="font-semibold">{permission.user.name}</h3>
                  <p className="text-muted-foreground text-sm">
                    {permission.user.email}
                  </p>
                </div>

                <div className="flex gap-2">
                  {Array.isArray(permission.permissions) &&
                    permission.permissions.map((perm) => (
                      <span
                        className={`rounded-md px-2 py-1 text-xs ${
                          perm === "view"
                            ? "bg-blue-100 text-blue-800"
                            : perm === "send"
                              ? "bg-green-100 text-green-800"
                              : "bg-purple-100 text-purple-800"
                        }`}
                        key={perm}
                      >
                        {perm}
                      </span>
                    ))}
                  {isExpired && (
                    <span className="rounded-md bg-red-100 px-2 py-1 text-red-800 text-xs">
                      Expired
                    </span>
                  )}
                </div>

                <div className="text-muted-foreground text-xs">
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

              <button
                className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-red-700 text-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={revoking === permission.userId}
                onClick={() => handleRevoke(permission.userId)}
                type="button"
              >
                {revoking === permission.userId ? "Revoking..." : "Revoke"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
