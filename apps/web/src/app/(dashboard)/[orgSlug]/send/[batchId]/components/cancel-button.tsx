"use client";

import { XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelBatchSend } from "@/actions/batch";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type CancelBatchButtonProps = {
  batchId: string;
  organizationId: string;
};

export function CancelBatchButton({
  batchId,
  organizationId,
}: CancelBatchButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const handleCancel = () => {
    startTransition(async () => {
      const result = await cancelBatchSend(batchId, organizationId);
      if (result.success) {
        toast.success("Broadcast cancelled");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <XCircle className="mr-2 h-4 w-4" />
          Cancel Broadcast
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Broadcast?</AlertDialogTitle>
          <AlertDialogDescription>
            This will stop the broadcast. Any emails that have already been sent
            cannot be recalled. Are you sure you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Sending</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={handleCancel}
          >
            {isPending ? "Cancelling..." : "Cancel Broadcast"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
