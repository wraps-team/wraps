"use client";

import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type AccountDetailsProps = {
  account: InferSelectModel<typeof awsAccount>;
};

export function AccountDetails({ account }: AccountDetailsProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Details</CardTitle>
        <CardDescription>
          Information about your AWS account connection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Account Name */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div>
              <h4 className="font-medium text-sm">Account Name</h4>
              <p className="text-muted-foreground text-sm">{account.name}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* AWS Account ID */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm">AWS Account ID</h4>
            <p className="break-all font-mono text-muted-foreground text-sm">
              {account.accountId}
            </p>
          </div>
          <Button
            onClick={() => copyToClipboard(account.accountId, "accountId")}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy className="h-4 w-4" />
            {copiedField === "accountId" ? "Copied!" : "Copy"}
          </Button>
        </div>

        <Separator />

        {/* Region */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-medium text-sm">Region</h4>
            <p className="text-muted-foreground text-sm">{account.region}</p>
          </div>
        </div>

        <Separator />

        {/* Role ARN */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm">IAM Role ARN</h4>
            <p className="break-all font-mono text-muted-foreground text-sm">
              {account.roleArn}
            </p>
          </div>
          <Button
            onClick={() => copyToClipboard(account.roleArn, "roleArn")}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy className="h-4 w-4" />
            {copiedField === "roleArn" ? "Copied!" : "Copy"}
          </Button>
        </div>

        <Separator />

        {/* Status */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-medium text-sm">Verification Status</h4>
            <div className="mt-1">
              {account.isVerified ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 font-medium text-green-800 text-xs">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </span>
                  {account.lastVerifiedAt && (
                    <span className="text-muted-foreground text-xs">
                      Last verified{" "}
                      {new Date(account.lastVerifiedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ) : (
                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 font-medium text-xs text-yellow-800">
                  Pending Verification
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
