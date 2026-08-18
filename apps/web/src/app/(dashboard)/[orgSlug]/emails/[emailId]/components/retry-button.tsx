"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RetryButtonProps = {
  label?: string;
};

export function RetryButton({ label = "Try again" }: RetryButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Button disabled={isPending} onClick={handleClick} size="sm">
      <RotateCw className={cn("mr-2 h-4 w-4", isPending && "animate-spin")} />
      {isPending ? "Retrying..." : label}
    </Button>
  );
}
