"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { retryWorkflowExecution } from "@/actions/workflows";
import { Button } from "@/components/ui/button";

export function RetryButton({
  executionId,
  organizationId,
}: {
  executionId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRetry() {
    startTransition(async () => {
      const result = await retryWorkflowExecution(executionId, organizationId);
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to retry execution");
      }
    });
  }

  return (
    <Button disabled={isPending} onClick={handleRetry} size="sm">
      <RotateCcw className="mr-2 h-4 w-4" />
      {isPending ? "Retrying..." : "Retry"}
    </Button>
  );
}
