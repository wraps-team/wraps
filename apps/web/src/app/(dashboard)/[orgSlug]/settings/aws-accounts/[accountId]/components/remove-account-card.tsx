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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Label } from "@wraps/ui/components/ui/label";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteAWSAccount } from "@/actions/aws-accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RemoveAccountCardProps = {
  awsAccountId: string;
  organizationId: string;
  accountName: string;
  orgSlug: string;
};

export function RemoveAccountCard({
  awsAccountId,
  organizationId,
  accountName,
  orgSlug,
}: RemoveAccountCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [removing, setRemoving] = useState(false);

  async function handleConfirm() {
    setRemoving(true);
    try {
      const result = await deleteAWSAccount(awsAccountId, organizationId);

      if (result.success) {
        toast.success("AWS account removed from Wraps");
        setOpen(false);
        router.push(`/${orgSlug}/settings/aws-accounts`);
      } else {
        toast.error(result.error);
      }
    } catch (_err) {
      toast.error(
        "Couldn't remove the AWS account — the request failed. Please try again, and if it keeps happening contact support."
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Remove from Wraps</CardTitle>
        <CardDescription>
          Wraps stops reading and sending through this account. Nothing in your
          AWS account is deleted. Remove the CloudFormation stack yourself or
          run <code className="font-mono">wraps destroy</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={() => {
            setTypedName("");
            setOpen(true);
          }}
          variant="destructive"
        >
          Remove account...
        </Button>
      </CardContent>

      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Wraps?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{accountName}</strong> from Wraps. This
              action cannot be undone. All associated data and configurations
              will be permanently removed from Wraps.
              <br />
              <br />
              <strong className="text-destructive">
                Nothing in your AWS account is deleted. You'll need to manually
                delete the CloudFormation stack if you no longer need it.
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-account-name">
              Type the account name to confirm
            </Label>
            <Input
              autoComplete="off"
              id="confirm-account-name"
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={accountName}
              value={typedName}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing || typedName !== accountName}
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              variant="destructive"
            >
              {removing ? (
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
    </Card>
  );
}
