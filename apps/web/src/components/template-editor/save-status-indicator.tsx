"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import { Check, Cloud, CloudOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type SaveStatus = "saved" | "saving" | "unsaved" | "offline" | "error";

type SaveStatusIndicatorProps = {
  status: SaveStatus;
  lastSavedAt?: Date;
  className?: string;
};

export function SaveStatusIndicator({
  status,
  lastSavedAt,
  className,
}: SaveStatusIndicatorProps) {
  const [showSavedCheck, setShowSavedCheck] = useState(false);

  // Show checkmark briefly when transitioning to saved state
  useEffect(() => {
    if (status === "saved") {
      setShowSavedCheck(true);
      const timer = setTimeout(() => setShowSavedCheck(false), 2000);
      return () => clearTimeout(timer);
    }
    setShowSavedCheck(false);
  }, [status]);

  const getStatusConfig = () => {
    switch (status) {
      case "saving":
        return {
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
          text: "Saving...",
          tooltip: "Saving changes to cloud",
          className: "text-muted-foreground",
        };
      case "saved":
        return {
          icon: showSavedCheck ? (
            <Check className="h-3.5 w-3.5 animate-in fade-in duration-200" />
          ) : (
            <Cloud className="h-3.5 w-3.5" />
          ),
          text: showSavedCheck ? "Saved" : "Saved",
          tooltip: lastSavedAt
            ? `Last saved ${formatRelativeTime(lastSavedAt)}`
            : "All changes saved",
          className: showSavedCheck ? "text-success" : "text-muted-foreground",
        };
      case "unsaved":
        return {
          icon: <Cloud className="h-3.5 w-3.5" />,
          text: "Unsaved",
          tooltip: "Changes will be saved automatically",
          className: "text-warning",
        };
      case "offline":
        return {
          icon: <CloudOff className="h-3.5 w-3.5" />,
          text: "Offline",
          tooltip: "Changes saved locally. Will sync when online.",
          className: "text-muted-foreground",
        };
      case "error":
        return {
          icon: <CloudOff className="h-3.5 w-3.5" />,
          text: "Save failed",
          tooltip: "Failed to save. Click to retry.",
          className: "text-destructive",
        };
      default:
        return {
          icon: <Cloud className="h-3.5 w-3.5" />,
          text: "",
          tooltip: "",
          className: "text-muted-foreground",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          aria-label={config.tooltip}
          aria-live="polite"
          className={cn(
            "flex items-center gap-1.5 text-xs transition-colors duration-200",
            config.className,
            className
          )}
          role="status"
        >
          <span aria-hidden="true">{config.icon}</span>
          <span className="hidden sm:inline">{config.text}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{config.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 10) {
    return "just now";
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return date.toLocaleDateString();
}
