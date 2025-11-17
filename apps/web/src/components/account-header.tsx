"use client";

import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
      {/* Back Button */}
      <div className="px-4 lg:px-6">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/${orgSlug}/settings?tab=aws-accounts`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Settings
          </Link>
        </Button>
      </div>

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
    </div>
  );
}
