"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelWorkflowExecution } from "@/actions/workflows";
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

export function CancelButton({
  executionId,
  organizationId,
}: {
  executionId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelWorkflowExecution(executionId, organizationId);
      if (result.success) {
        setOpen(false);
        router.refresh();
        toast.success("Execution cancelled");
      } else {
        toast.error(result.error ?? "Failed to cancel execution");
      }
    });
  }

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button disabled={isPending} size="sm" variant="outline">
          <Ban className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel execution?</AlertDialogTitle>
          <AlertDialogDescription>
            This will stop the workflow execution. Any remaining steps will not
            be processed. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            Keep running
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              handleCancel();
            }}
          >
            {isPending ? "Cancelling\u2026" : "Cancel execution"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
