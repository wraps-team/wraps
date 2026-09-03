"use client";

import type { awsAccount } from "@wraps/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import type { InferSelectModel } from "drizzle-orm";
import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildStacksConsoleUrl,
  CONSOLE_ACCESS_STACK_NAME,
  CONSOLE_ACCESS_TEMPLATE_URL,
} from "@/lib/aws/cloudformation-url";

type IAMConfigurationProps = {
  account: InferSelectModel<typeof awsAccount>;
  /**
   * True on self-hosted deployments, where the platform template would grant
   * the wrong account. The External ID still shows — only the stack flow is
   * withheld.
   */
  selfHosted: boolean;
};

type CopyField = "externalId" | "templateUrl";

export function IAMConfiguration({
  account,
  selfHosted,
}: IAMConfigurationProps) {
  const [copied, setCopied] = useState<CopyField | null>(null);

  const copyToClipboard = async (text: string, field: CopyField) => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card id="iam-role">
      <CardHeader>
        <CardTitle>IAM Role Configuration</CardTitle>
        <CardDescription>
          {selfHosted
            ? "Your External ID for secure role assumption. Keep this secret and use it when updating your CloudFormation stack."
            : "If Wraps can no longer reach this account, its role needs its trust policy and permissions rewritten. Either route below does that."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="mb-2 font-medium text-sm">External ID</h4>
            <code className="block break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {account.externalId}
            </code>
          </div>
          <Button
            onClick={() => copyToClipboard(account.externalId, "externalId")}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy className="h-4 w-4" />
            {copied === "externalId" ? "Copied!" : "Copy"}
          </Button>
        </div>

        {selfHosted ? null : (
          <div className="space-y-4 border-t pt-4">
            <div>
              <h4 className="mb-1 font-medium text-sm">
                If you deployed with CloudFormation
              </h4>
              <p className="text-muted-foreground text-sm">
                Open the{" "}
                <code className="font-mono">{CONSOLE_ACCESS_STACK_NAME}</code>{" "}
                stack, choose <strong>Update</strong> →{" "}
                <strong>Replace existing template</strong> →{" "}
                <strong>Amazon S3 URL</strong>, paste the template URL below,
                and keep the External ID as-is.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="mb-2 font-medium text-sm">Template URL</h4>
                <code className="block break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                  {CONSOLE_ACCESS_TEMPLATE_URL}
                </code>
              </div>
              <Button
                onClick={() =>
                  copyToClipboard(CONSOLE_ACCESS_TEMPLATE_URL, "templateUrl")
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Copy className="h-4 w-4" />
                {copied === "templateUrl" ? "Copied!" : "Copy"}
              </Button>
            </div>

            <Button asChild>
              <a
                href={buildStacksConsoleUrl(account.region)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open CloudFormation stacks
              </a>
            </Button>

            <div className="border-t pt-4">
              <h4 className="mb-1 font-medium text-sm">
                If you connected with the CLI
              </h4>
              <p className="text-muted-foreground text-sm">
                There is no stack to update — the role was created directly. Run{" "}
                <code className="font-mono">wraps platform update-role</code> to
                rewrite it, or{" "}
                <code className="font-mono">wraps platform connect</code> if it
                was deleted.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
