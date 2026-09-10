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
  AlertDialogTrigger,
} from "@wraps/ui/components/ui/alert-dialog";
import { Checkbox } from "@wraps/ui/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeSuppression } from "@/actions/suppressions";
import { Button } from "@/components/ui/button";

type RemoveSuppressionButtonProps = {
  organizationId: string;
  awsAccountId: string;
  email: string;
  reason: "BOUNCE" | "COMPLAINT";
};

export function RemoveSuppressionButton({
  organizationId,
  awsAccountId,
  email,
  reason,
}: RemoveSuppressionButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const isComplaint = reason === "COMPLAINT";

  const handleRemove = () => {
    startTransition(async () => {
      const result = await removeSuppression(
        organizationId,
        awsAccountId,
        email,
        acknowledged
      );
      if (result.success) {
        toast.success(`${email} removed from the suppression list`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <AlertDialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setAcknowledged(false);
        }
      }}
      open={open}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Trash2 className="mr-2 h-4 w-4" />
          Unsuppress
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {email} from the suppression list?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isComplaint
              ? "This address was suppressed because the recipient reported a spam complaint. Removing it and sending again risks another complaint and can hurt your sender reputation."
              : "This address was suppressed after a bounce. Removing it lets Wraps send to it again."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isComplaint ? (
          <label className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
            />
            <span>
              I understand this address reported a spam complaint and want to
              remove it from the suppression list anyway.
            </span>
          </label>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending || (isComplaint && !acknowledged)}
            onClick={handleRemove}
          >
            {isPending ? "Removing..." : "Remove from suppression list"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
