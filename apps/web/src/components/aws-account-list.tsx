import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

  // CloudFormation template URL for updating stacks
  const templateUrl =
    "https://wraps-assets.s3.amazonaws.com/cloudformation/wraps-console-access-role.yaml";

  return (
    <div className="space-y-4">
      {accounts.map(({ permissions, ...account }) => (
        <Card key={account.id}>
          <CardContent className="p-6">
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
                <Badge className="bg-green-50 text-green-700" variant="outline">
                  Verified
                </Badge>
              )}
            </div>

            {/* Permissions */}
            <div className="mt-4">
              <p className="mb-2 text-muted-foreground text-sm">Your access:</p>
              <div className="flex gap-2">
                {permissions.canView && (
                  <Badge className="bg-blue-50 text-blue-700" variant="outline">
                    View
                  </Badge>
                )}
                {permissions.canSend && (
                  <Badge
                    className="bg-green-50 text-green-700"
                    variant="outline"
                  >
                    Send
                  </Badge>
                )}
                {permissions.canManage && (
                  <Badge
                    className="bg-purple-50 text-purple-700"
                    variant="outline"
                  >
                    Manage
                  </Badge>
                )}
                {!(
                  permissions.canView ||
                  permissions.canSend ||
                  permissions.canManage
                ) && (
                  <span className="text-muted-foreground text-sm">
                    No access
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            {permissions.canView && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <a href={`${baseUrl}/${account.id}`}>View Details</a>
                </Button>
                {permissions.canManage && (
                  <>
                    <Button asChild variant="outline">
                      <a href={`${baseUrl}/${account.id}/permissions`}>
                        Manage Permissions
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a
                        href={`https://console.aws.amazon.com/cloudformation/home?region=${account.region}#/stacks/create/review?templateURL=${encodeURIComponent(templateUrl)}&stackName=wraps-console-access&param_ExternalId=${account.externalId}`}
                        rel="noopener noreferrer"
                        target="_blank"
                        title="Update CloudFormation stack with latest IAM permissions (will prompt to update existing stack)"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Update IAM Role
                      </a>
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
