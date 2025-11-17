"use client";

import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AccountHeaderProps = {
  account: InferSelectModel<typeof awsAccount>;
  permissions: {
    canView: boolean;
    canSend: boolean;
    canManage: boolean;
  };
  orgSlug: string;
};

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
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="font-bold text-3xl">{account.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Manage your AWS account connection and email sending infrastructure.
          </p>
          <div className="mt-3 flex items-center gap-3 text-muted-foreground text-sm">
            <span className="font-mono">{account.accountId}</span>
            <span>•</span>
            <span>{account.region}</span>
          </div>
        </div>

        {/* Actions */}
        {permissions.canManage && (
          <Button asChild variant="outline">
            <Link href={`/${orgSlug}/aws-accounts/${account.id}/permissions`}>
              Manage Access
            </Link>
          </Button>
        )}
      </div>

      {/* Permission badges */}
      <div className="flex gap-2">
        {permissions.canView && <Badge variant="secondary">View Access</Badge>}
        {permissions.canSend && <Badge variant="secondary">Send Access</Badge>}
        {permissions.canManage && (
          <Badge variant="secondary">Manage Access</Badge>
        )}
      </div>
    </div>
  );
}
