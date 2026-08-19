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
  /**
   * Height, for sitting inside a `ButtonGroup` whose other members set their
   * own. Defaults to the touch-sized variant.
   */
  size?: "sm" | "touch";
};

export function RefreshButton({
  onRefresh,
  className,
  label = "Refresh",
  size = "touch",
}: RefreshButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    // Guard here rather than with `disabled`, so a second click during the
    // fetch is ignored without the button leaving the tab order.
    if (isPending) {
      return;
    }

    startTransition(async () => {
      await onRefresh();
    });
  }

  return (
    <Button
      aria-busy={isPending}
      aria-label={label}
      className={className}
      onClick={handleClick}
      size={size}
      variant="outline"
    >
      {/*
        Deliberately not `disabled`. A focused element that becomes disabled is
        removed from the tab order, and the browser drops focus to <body> - so
        a keyboard user who pressed Refresh was returned to the top of the
        document with nothing announced. `aria-busy` says the same thing to
        assistive tech and keeps the element focusable; the caller owns the
        "refreshed" announcement, which is the part a spinner cannot convey.
      */}
      <RefreshCw className={cn("h-4 w-4", isPending && "animate-spin")} />
    </Button>
  );
}
