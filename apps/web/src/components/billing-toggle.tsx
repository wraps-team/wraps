"use client";

import type { BillingInterval } from "@/lib/plans";
import { cn } from "@/lib/utils";

type BillingToggleProps = {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
  className?: string;
};

export function BillingToggle({
  value,
  onChange,
  className,
}: BillingToggleProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* Segmented control */}
      <div className="relative inline-flex rounded-full border bg-muted/50 p-1">
        {/* Sliding background */}
        <div
          className={cn(
            "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-background shadow-sm transition-transform duration-200 ease-out",
            value === "annual"
              ? "translate-x-[calc(100%+4px)]"
              : "translate-x-0"
          )}
        />

        {/* Monthly option */}
        <button
          className={cn(
            "relative z-10 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            value === "monthly"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange("monthly")}
          type="button"
        >
          Monthly
        </button>

        {/* Annual option */}
        <button
          className={cn(
            "relative z-10 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            value === "annual"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange("annual")}
          type="button"
        >
          Annual
        </button>
      </div>

      {/* Savings note */}
      <p className="text-center text-success text-xs font-medium">
        Save 2 months with annual billing
      </p>
    </div>
  );
}
