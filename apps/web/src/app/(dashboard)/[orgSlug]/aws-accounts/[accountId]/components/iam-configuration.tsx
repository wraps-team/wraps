"use client";

import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type IAMConfigurationProps = {
  account: InferSelectModel<typeof awsAccount>;
};

export function IAMConfiguration({ account }: IAMConfigurationProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>IAM Role Configuration</CardTitle>
        <CardDescription>
          Your External ID for secure role assumption. Keep this secret and use
          it when updating your CloudFormation stack.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="mb-2 font-medium text-sm">External ID</h4>
            <code className="block break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {account.externalId}
            </code>
          </div>
          <Button
            onClick={() => copyToClipboard(account.externalId)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
