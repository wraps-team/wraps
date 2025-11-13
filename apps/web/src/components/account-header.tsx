import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import Link from "next/link";

interface AccountHeaderProps {
  account: InferSelectModel<typeof awsAccount>;
  permissions: {
    canView: boolean;
    canSend: boolean;
    canManage: boolean;
  };
  orgSlug: string;
}

export function AccountHeader({
  account,
  permissions,
  orgSlug,
}: AccountHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm">
        <Link
          className="text-muted-foreground hover:text-foreground"
          href={`/${orgSlug}/aws-accounts`}
        >
          AWS Accounts
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{account.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-bold text-3xl">{account.name}</h1>
          <div className="mt-2 flex items-center gap-3 text-muted-foreground text-sm">
            <span className="font-mono">{account.accountId}</span>
            <span>•</span>
            <span>{account.region}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {permissions.canManage && (
            <Link
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              href={`/${orgSlug}/aws-accounts/${account.id}/permissions`}
            >
              Manage Access
            </Link>
          )}
        </div>
      </div>

      {/* Permission badges */}
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
      </div>
    </div>
  );
}
