"use client";

import { cn } from "@/lib/utils";

type LoadingSpinnerProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

export function LoadingSpinner({
  className,
  size = "md",
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div
        className={cn(
          "animate-spin rounded-full border-primary border-b-2",
          sizeClasses[size],
          className
        )}
      />
    </div>
  );
}
