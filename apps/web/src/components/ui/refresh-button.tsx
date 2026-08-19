"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type RefreshButtonProps = {
  onRefresh: () => void | Promise<void>;
  className?: string;
  /** Name what is being refreshed - a page can hold several of these. */
  label?: string;
};

export function RefreshButton({
  onRefresh,
  className,
  label = "Refresh",
}: RefreshButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await onRefresh();
    });
  }

  return (
    <Button
      aria-label={label}
      className={className}
      disabled={isPending}
      onClick={handleClick}
      size="sm"
      variant="outline"
    >
      <RefreshCw className={cn("h-4 w-4", isPending && "animate-spin")} />
    </Button>
  );
}
