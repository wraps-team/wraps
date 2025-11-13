import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";

interface AWSAccountListProps {
  accounts: Array<
    InferSelectModel<typeof awsAccount> & {
      permissions: {
        canView: boolean;
        canSend: boolean;
        canManage: boolean;
      };
    }
  >;
  organizationId: string;
  orgSlug?: string;
}

export function AWSAccountList({
  accounts,
  organizationId,
  orgSlug,
}: AWSAccountListProps) {
  // Use slug-based URLs if orgSlug is provided, otherwise fall back to old format
  const baseUrl = orgSlug
    ? `/${orgSlug}/aws-accounts`
    : `/dashboard/organizations/${organizationId}/aws-accounts`;
  return (
    <div className="space-y-4">
      {accounts.map(({ permissions, ...account }) => (
        <div
          className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
          key={account.id}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">{account.name}</h3>
              <div className="flex items-center gap-3 text-muted-foreground text-sm">
                <span className="font-mono">{account.accountId}</span>
                <span>•</span>
                <span>{account.region}</span>
              </div>
            </div>

            {account.isVerified && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-green-800 text-xs">
                Verified
              </span>
            )}
          </div>

          {/* Permissions */}
          <div className="mt-4">
            <p className="mb-2 text-muted-foreground text-sm">Your access:</p>
            <div className="flex gap-2">
              {permissions.canView && (
                <span className="rounded-md bg-blue-100 px-2 py-1 text-blue-800 text-xs">
                  View
                </span>
              )}
              {permissions.canSend && (
                <span className="rounded-md bg-green-100 px-2 py-1 text-green-800 text-xs">
                  Send
                </span>
              )}
              {permissions.canManage && (
                <span className="rounded-md bg-purple-100 px-2 py-1 text-purple-800 text-xs">
                  Manage
                </span>
              )}
              {!(
                permissions.canView ||
                permissions.canSend ||
                permissions.canManage
              ) && (
                <span className="text-muted-foreground text-sm">No access</span>
              )}
            </div>
          </div>

          {/* Actions */}
          {permissions.canView && (
            <div className="mt-4 flex gap-2">
              <a
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                href={`${baseUrl}/${account.id}`}
              >
                View Details
              </a>
              {permissions.canManage && (
                <a
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  href={`${baseUrl}/${account.id}/permissions`}
                >
                  Manage Permissions
                </a>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
