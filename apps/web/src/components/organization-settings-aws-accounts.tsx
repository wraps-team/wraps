"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wraps/ui/components/ui/alert-dialog";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import { Loader2, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteAWSAccount } from "@/actions/aws-accounts";
import { ConnectAWSAccountForm } from "@/components/forms/connect-aws-account-form";
import { Button } from "@/components/ui/button";
import type { AccountRow } from "@/lib/aws/account-status";
import { canAddAwsAccount, getAwsAccountLimit, type PlanId } from "@/lib/plans";

type OrganizationSettingsAwsAccountsProps = {
  accounts: AccountRow[];
  organization: {
    id: string;
    name: string;
  };
  userRole: string;
  planId?: PlanId | string;
  /** Self-hosted deployments are unlimited — no AWS account cap. */
  unlimited?: boolean;
  /**
   * True on self-hosted deployments. Required, and deliberately has no default:
   * defaulting to false fails open to the platform CloudFormation template,
   * which creates a role trusting the Wraps platform account. Must be threaded
   * from a server component calling `isSelfHosted()`; the license key must
   * never reach the client bundle.
   */
  selfHosted: boolean;
};

const LEVEL_BADGE_VARIANT = {
  healthy: "success",
  warning: "warning",
  critical: "destructive",
  unknown: "secondary",
} as const;

export function OrganizationSettingsAwsAccounts({
  accounts,
  organization,
  userRole,
  planId = "free",
  unlimited = false,
  selfHosted,
}: OrganizationSettingsAwsAccountsProps) {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<AccountRow | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  const canEdit = userRole === "owner" || userRole === "admin";
  const accountLimit = unlimited ? -1 : getAwsAccountLimit(planId);
  const canAddMore = unlimited || canAddAwsAccount(planId, accounts.length);
  const isAtLimit = !canAddMore && accountLimit !== -1;

  function handleConnectSuccess() {
    setConnectDialogOpen(false);
    router.refresh();
    toast.success("AWS account connected successfully");
  }

  function handleDeleteClick(account: AccountRow) {
    setAccountToDelete(account);
    setDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!accountToDelete) {
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteAWSAccount(
        accountToDelete.id,
        organization.id
      );

      if (result.success) {
        toast.success("AWS account removed from Wraps");
        setDeleteDialogOpen(false);
        setAccountToDelete(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch (_err) {
      toast.error(
        "Couldn't remove the AWS account — the request failed. Please try again, and if it keeps happening contact support."
      );
    } finally {
      setDeleting(false);
    }
  }

  const connectButton = canEdit ? (
    <Button
      disabled={isAtLimit}
      onClick={() => setConnectDialogOpen(true)}
      title={
        isAtLimit ? "Upgrade your plan to add more AWS accounts" : undefined
      }
    >
      <Plus className="mr-2 h-4 w-4" />
      Connect account
    </Button>
  ) : null;

  return (
    <div className="space-y-6">
      {/* Connect Account Dialog */}
      <Dialog onOpenChange={setConnectDialogOpen} open={connectDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Connect AWS Account</DialogTitle>
            <DialogDescription>
              Connect a new AWS account to {organization.name}
            </DialogDescription>
          </DialogHeader>
          <ConnectAWSAccountForm
            onSuccess={handleConnectSuccess}
            organizationId={organization.id}
            selfHosted={selfHosted}
          />
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <AlertDialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Wraps?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>{accountToDelete?.name}</strong> (
              {accountToDelete?.accountId}) from Wraps?
              <br />
              <br />
              This action cannot be undone. All associated data and
              configurations will be permanently removed from Wraps.
              <br />
              <br />
              <strong className="text-destructive">
                Note: This will NOT delete any resources in your AWS account.
                You'll need to manually delete the CloudFormation stack if you
                no longer need it.
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDeleteConfirm}
              variant="destructive"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove account"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <h2 className="mb-2 font-semibold text-lg">
            Connect your first AWS account
          </h2>
          <p className="mb-2 max-w-xl text-muted-foreground text-sm">
            Wraps deploys into your account and reads it through an IAM role you
            own. We never store AWS keys.
          </p>
          <p className="mb-4 max-w-xl text-muted-foreground text-sm">
            You'll need administrator access, permission to create IAM roles,
            and CloudFormation execution permissions.
          </p>
          {connectButton}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="text-muted-foreground text-sm">
              {accountLimit === -1
                ? `${accounts.length} connected`
                : `${accounts.length} of ${accountLimit} on your plan`}
              {isAtLimit && (
                <span className="mt-1 block text-warning">
                  You've reached your plan's AWS account limit.{" "}
                  <Link
                    className="underline hover:no-underline"
                    href={`/${orgSlug}/settings/billing`}
                  >
                    Upgrade your plan
                  </Link>{" "}
                  for more.
                </span>
              )}
            </div>
            {connectButton}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Account / Region</TableHead>
                <TableHead>Services</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Events</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => {
                const detailHref = `/${orgSlug}/settings/aws-accounts/${account.id}`;
                const hasServices = account.emailEnabled || account.smsEnabled;
                return (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">
                      <Link className="hover:underline" href={detailHref}>
                        {account.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-sm">
                        {account.accountId}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {account.region}
                      </div>
                    </TableCell>
                    <TableCell>
                      {hasServices ? (
                        <div className="flex gap-1">
                          {account.emailEnabled && (
                            <Badge variant="secondary">Email</Badge>
                          )}
                          {account.smsEnabled && (
                            <Badge variant="secondary">SMS</Badge>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <Badge
                            variant={LEVEL_BADGE_VARIANT[account.status.level]}
                          >
                            {account.status.label}
                          </Badge>
                          {account.status.detail && (
                            <div className="mt-1 text-muted-foreground text-xs">
                              {account.status.detail}
                            </div>
                          )}
                        </div>
                        {account.status.label === "Role unreachable" && (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`${detailHref}#iam-role`}>Fix</Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {account.lastEventAt ?? "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={`Actions for ${account.name}`}
                            size="icon"
                            variant="ghost"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={detailHref}>Open</Link>
                          </DropdownMenuItem>
                          {canEdit && (
                            <>
                              <DropdownMenuItem asChild>
                                <Link href={`${detailHref}/permissions`}>
                                  Access
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => handleDeleteClick(account)}
                                variant="destructive"
                              >
                                Remove from Wraps...
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
