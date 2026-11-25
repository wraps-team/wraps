"use client";

import { cn } from "@/lib/utils";

type BillingInterval = "monthly" | "annual";

type BillingToggleProps = {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
  className?: string;
  compact?: boolean;
};

export function BillingToggle({
  value,
  onChange,
  className,
  compact,
}: BillingToggleProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* Segmented control */}
      <div
        aria-label="Billing frequency"
        className="relative inline-flex rounded-none border bg-muted/50 p-1"
        role="radiogroup"
      >
        {/* Sliding background */}
        <div
          className={cn(
            "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-none bg-background shadow-sm transition-transform duration-200 ease-out",
            value === "annual"
              ? "translate-x-[calc(100%+4px)]"
              : "translate-x-0"
          )}
        />

        {/* Monthly option */}
        <button
          aria-checked={value === "monthly"}
          className={cn(
            "relative z-10 rounded-none px-4 py-1.5 text-sm font-medium transition-colors",
            value === "monthly"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange("monthly")}
          role="radio"
          type="button"
        >
          Monthly
        </button>

        {/* Annual option */}
        <button
          aria-checked={value === "annual"}
          className={cn(
            "relative z-10 rounded-none px-4 py-1.5 text-sm font-medium transition-colors",
            value === "annual"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange("annual")}
          role="radio"
          type="button"
        >
          Annual
        </button>
      </div>

      {/* Savings note */}
      {!compact && (
        <p className="text-center text-success text-xs font-medium dark:text-success">
          Save with annual billing
        </p>
      )}
    </div>
  );
}
