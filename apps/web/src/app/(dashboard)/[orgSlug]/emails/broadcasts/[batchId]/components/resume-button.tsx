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
import { PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resumeBatchSend } from "@/actions/batch";
import { Button } from "@/components/ui/button";

type ResumeBatchButtonProps = {
  batchId: string;
  organizationId: string;
  status: string;
};

export function ResumeBatchButton({
  batchId,
  organizationId,
  status,
}: ResumeBatchButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const handleResume = () => {
    startTransition(async () => {
      const result = await resumeBatchSend(batchId, organizationId);
      if (result.success) {
        toast.success("Broadcast resumed", {
          description: `Sending picks up from chunk ${result.fromChunkIndex}.`,
        });
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Couldn't resume this broadcast", {
          description: result.error,
        });
      }
    });
  };

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <PlayCircle className="mr-2 h-4 w-4" />
          Resume sending
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resume this broadcast?</AlertDialogTitle>
          <AlertDialogDescription>
            {status === "failed"
              ? "Sending restarts from the last chunk that completed. Recipients already sent to are not sent to again."
              : "Sending restarts from the last chunk that completed. Use this when a broadcast has stopped making progress. Recipients already sent to are not sent to again."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Leave it</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={handleResume}>
            {isPending ? "Resuming..." : "Resume sending"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
