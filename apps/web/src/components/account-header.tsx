"use client";

import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

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

      {/* CloudFormation Update Info (only for managers) */}
      {permissions.canManage && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="text-base">IAM Role Configuration</CardTitle>
            <CardDescription>
              Your External ID for secure role assumption. Keep this secret.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <label className="font-medium text-muted-foreground text-sm">
                External ID
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                  {account.externalId}
                </code>
                <Button
                  onClick={() =>
                    copyToClipboard(account.externalId, "externalId")
                  }
                  size="sm"
                  variant="outline"
                >
                  <Copy className="h-4 w-4" />
                  {copiedField === "externalId" ? "Copied!" : "Copy"}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                This ID is used when updating your CloudFormation stack.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
