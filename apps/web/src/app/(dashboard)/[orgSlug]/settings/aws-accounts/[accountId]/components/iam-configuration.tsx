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
import { resolveCloudFormationRepairRoute } from "@/lib/aws/cloudformation-url";
import { ConsolePolicyRecheck } from "./console-policy-recheck";

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
  // The External ID is the only record of how this role was created: the
  // infrastructure template sets it to the stack's own ARN. Without this the
  // card named a `wraps-console-access` stack these accounts never had.
  const repair = resolveCloudFormationRepairRoute(
    account.externalId,
    account.region
  );

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
            : "If Wraps can no longer reach this account, its role needs its trust policy and permissions rewritten. Any of the routes below does that."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="mb-2 font-medium text-sm">External ID</h4>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {account.externalId}
            </code>
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
        </div>

        {selfHosted ? null : (
          <div className="space-y-4 border-t pt-4">
            <ConsolePolicyRecheck
              awsAccountId={account.id}
              organizationId={account.organizationId}
            />

            <div className="border-t pt-4">
              <h4 className="mb-1 font-medium text-sm">
                The fastest fix, for any setup
              </h4>
              <p className="text-muted-foreground text-sm">
                Open the IAM console, find the{" "}
                <code className="font-mono">wraps-console-access-role</code>{" "}
                role, edit its inline policy, and replace it with the current
                policy document.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a
                  href="https://wraps.dev/byoc#what-syncs"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View the current policy document
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href="https://console.aws.amazon.com/iam/home#/roles/wraps-console-access-role"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open the role in the IAM console
                </a>
              </Button>
            </div>

            <div className="border-t pt-4">
              <h4 className="mb-1 font-medium text-sm">
                {repair.identified
                  ? "Your CloudFormation stack"
                  : "If you deployed with CloudFormation"}
              </h4>
              <p className="text-muted-foreground text-sm">
                {repair.identified
                  ? "This role was created by the "
                  : "Open the "}
                <code className="font-mono">{repair.stackName}</code> stack
                {repair.identified ? ". Open it" : ""}, choose{" "}
                <strong>Update</strong> →{" "}
                <strong>Replace existing template</strong> →{" "}
                <strong>Amazon S3 URL</strong>, paste the template URL below,
                and{" "}
                {repair.identified
                  ? "leave every parameter at its current value."
                  : "keep the External ID as-is."}
              </p>
              {repair.identified ? (
                <p className="mt-2 text-muted-foreground text-sm">
                  The URL below is the full email infrastructure template — the
                  one this stack already deploys. Updating it with any other
                  template would delete the rest of your email infrastructure.
                </p>
              ) : null}
            </div>

            <div>
              <h4 className="mb-2 font-medium text-sm">Template URL</h4>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                  {repair.templateUrl}
                </code>
                <Button
                  onClick={() =>
                    copyToClipboard(repair.templateUrl, "templateUrl")
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Copy className="h-4 w-4" />
                  {copied === "templateUrl" ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            <Button asChild>
              <a
                href={repair.stacksConsoleUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {repair.identified
                  ? `Open the ${repair.stackName} stack`
                  : "Open CloudFormation stacks"}
              </a>
            </Button>

            {repair.identified ? null : (
              <div className="border-t pt-4">
                <h4 className="mb-1 font-medium text-sm">
                  If you connected with the CLI
                </h4>
                <p className="text-muted-foreground text-sm">
                  There is no stack to update — the role was created directly.
                  Run{" "}
                  <code className="font-mono">wraps platform update-role</code>{" "}
                  to rewrite it, or{" "}
                  <code className="font-mono">wraps platform connect</code> if
                  it was deleted.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
