"use client";

import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UsageBannerData = {
  threshold: "normal" | "warning" | "critical" | "exceeded";
  warning: string | null;
  action: "upgrade" | "view_usage" | null;
};

type UsageBannerProps = {
  usage: UsageBannerData | undefined;
  upgradeHref: string;
};

const bgColors = {
  warning: "bg-warning/15 border-warning/30",
  critical: "bg-destructive/15 border-destructive/30",
  exceeded: "bg-destructive/15 border-destructive/30",
};

const textColors = {
  warning: "text-warning",
  critical: "text-destructive",
  exceeded: "text-destructive",
};

const iconColors = {
  warning: "text-warning",
  critical: "text-destructive",
  exceeded: "text-destructive",
};

export function UsageBanner({ usage, upgradeHref }: UsageBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!usage || usage.threshold === "normal") {
    return null;
  }

  if (usage.threshold === "warning" && dismissed) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b px-4 py-2",
        bgColors[usage.threshold as keyof typeof bgColors]
      )}
      role="alert"
    >
      <div
        className={cn(
          "flex items-center gap-2",
          textColors[usage.threshold as keyof typeof textColors]
        )}
      >
        <AlertTriangle
          className={cn(
            "h-4 w-4 shrink-0",
            iconColors[usage.threshold as keyof typeof iconColors]
          )}
        />
        <p className="text-sm">{usage.warning}</p>
      </div>
      <div className="flex items-center gap-2">
        {usage.action === "upgrade" && (
          <Button asChild size="sm" variant="outline">
            <Link href={upgradeHref}>Upgrade Plan</Link>
          </Button>
        )}
        {usage.threshold === "warning" && (
          <Button
            aria-label="Dismiss warning"
            onClick={() => setDismissed(true)}
            size="icon-sm"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
