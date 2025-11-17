"use client";

import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  Loader2,
  Plus,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type AWSAccountWithCreator,
  listAWSAccounts,
} from "@/actions/aws-accounts";
import { ConnectAWSAccountForm } from "@/components/forms/connect-aws-account-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type OrganizationSettingsAwsAccountsProps = {
  organization: {
    id: string;
    name: string;
  };
  userRole: "owner" | "admin" | "member";
};

export function OrganizationSettingsAwsAccounts({
  organization,
  userRole,
}: OrganizationSettingsAwsAccountsProps) {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const [accounts, setAccounts] = useState<AWSAccountWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);

  const canEdit = userRole === "owner" || userRole === "admin";

  // Load AWS accounts
  useEffect(() => {
    loadData();
  }, [loadData]);

  async function loadData() {
    setLoading(true);
    const result = await listAWSAccounts(organization.id);
    if (result.success) {
      setAccounts(result.accounts);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  const formatDate = (date: Date | null) => {
    if (!date) {
      return "Never";
    }
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  function handleConnectSuccess() {
    setConnectDialogOpen(false);
    loadData(); // Reload accounts list
    toast.success("AWS account connected successfully");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connect Account Dialog */}
      <Dialog onOpenChange={setConnectDialogOpen} open={connectDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Connect AWS Account</DialogTitle>
            <DialogDescription>
              Connect a new AWS account to {organization.name}
            </DialogDescription>
          </DialogHeader>
          <ConnectAWSAccountForm
            onSuccess={handleConnectSuccess}
            organizationId={organization.id}
          />
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>AWS Accounts</CardTitle>
              <CardDescription>
                Manage AWS accounts connected to your organization.
              </CardDescription>
            </div>
            {canEdit && (
              <Button onClick={() => setConnectDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Connect Account
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Cloud className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 font-semibold text-lg">
                No AWS Accounts Connected
              </h3>
              <p className="mb-4 text-muted-foreground text-sm">
                Connect your first AWS account to start using Wraps.
              </p>
              {canEdit && (
                <Button onClick={() => setConnectDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Connect Account
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((account) => (
                <div
                  className="flex items-center justify-between rounded-lg border p-4"
                  key={account.id}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900">
                      <Cloud className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{account.name}</h4>
                        {account.isVerified ? (
                          <Badge
                            className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            variant="secondary"
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge
                            className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                            variant="secondary"
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            Pending
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-muted-foreground text-sm">
                        {account.accountId}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {account.region} • Added {formatDate(account.createdAt)}
                        {account.createdBy && ` by ${account.createdBy.name}`}
                      </p>
                    </div>
                  </div>
                  <Link href={`/${orgSlug}/aws-accounts/${account.id}`}>
                    <Button variant="outline">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Manage
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connection Guide</CardTitle>
          <CardDescription>
            How to connect your AWS account to Wraps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">Prerequisites</h4>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
              <li>AWS account with administrator access</li>
              <li>Permission to create IAM roles</li>
              <li>CloudFormation execution permissions</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Connection Process</h4>
            <ol className="list-inside list-decimal space-y-1 text-muted-foreground text-sm">
              <li>Click the "Connect Account" button above</li>
              <li>Launch the CloudFormation stack in your AWS account</li>
              <li>Copy the Role ARN from the stack outputs</li>
              <li>Complete the connection form with your account details</li>
              <li>Wraps will verify the connection automatically</li>
            </ol>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <h4 className="mb-2 font-medium text-blue-900 text-sm dark:text-blue-100">
              Why do we need an IAM role?
            </h4>
            <p className="text-blue-800 text-sm dark:text-blue-200">
              Wraps uses IAM roles with AssumeRole to securely access your AWS
              account. This means we never store your AWS credentials - we only
              temporarily assume a role when needed, with the minimum required
              permissions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
