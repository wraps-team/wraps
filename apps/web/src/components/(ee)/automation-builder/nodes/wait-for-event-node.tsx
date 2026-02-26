"use client";

import { Handle, Position } from "@xyflow/react";
import { Hourglass } from "lucide-react";
import { cn, formatDurationVerbose } from "@/lib/utils";
import type { AutomationNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";

type WaitForEventNodeProps = {
  id: string;
  data: AutomationNodeData;
  selected?: boolean;
};

export function WaitForEventNode({
  id,
  data,
  selected,
}: WaitForEventNodeProps) {
  const config = data.config;
  const { isValid, errorMessage } = useNodeValidation(id);
  let eventDisplay = "Configure event";
  let timeoutDisplay = "No timeout";

  if (config.type === "wait_for_event") {
    if (config.eventName) {
      eventDisplay = config.eventName;
    }
    if (config.timeoutSeconds) {
      timeoutDisplay = formatDurationVerbose(config.timeoutSeconds);
    }
  }

  return (
    <div className="relative">
      {/* Input handle at top */}
      <Handle
        className="!bg-muted-foreground !w-3 !h-3 !border-2 !border-background"
        position={Position.Top}
        type="target"
      />

      {/* Compact card */}
      <div
        className={cn(
          "w-[160px] rounded-lg border-2 bg-background shadow-sm",
          "px-3 py-2",
          "transition-all duration-150",
          selected ? "border-primary ring-2 ring-primary/20" : "border-border",
          !isValid && "border-destructive ring-2 ring-destructive/20"
        )}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-amber-500 text-white">
            <Hourglass className="h-3 w-3" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground text-xs">
              {data.name}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {eventDisplay} • {timeoutDisplay}
            </div>
          </div>
        </div>
      </div>

      {/* Three outputs at bottom */}
      <div className="-bottom-5 absolute right-0 left-0 flex justify-between px-3">
        {/* Event received - left */}
        <div className="flex flex-col items-center">
          <span className="mb-0.5 font-medium text-[8px] text-green-600 dark:text-green-400">
            Event
          </span>
          <Handle
            className="!relative !transform-none !bg-green-500 !w-2.5 !h-2.5 !border-2 !border-background"
            id="yes"
            position={Position.Bottom}
            type="source"
          />
        </div>

        {/* No match - center */}
        <div className="flex flex-col items-center">
          <span className="mb-0.5 font-medium text-[8px] text-muted-foreground">
            No Match
          </span>
          <Handle
            className="!relative !transform-none !bg-muted-foreground !w-2.5 !h-2.5 !border-2 !border-background"
            id="no"
            position={Position.Bottom}
            type="source"
          />
        </div>

        {/* Timeout - right */}
        <div className="flex flex-col items-center">
          <span className="mb-0.5 font-medium text-[8px] text-yellow-600 dark:text-yellow-400">
            Timeout
          </span>
          <Handle
            className="!relative !transform-none !bg-yellow-500 !w-2.5 !h-2.5 !border-2 !border-background"
            id="timeout"
            position={Position.Bottom}
            type="source"
          />
        </div>
      </div>

      {errorMessage && (
        <div className="-bottom-12 -translate-x-1/2 absolute left-1/2 whitespace-nowrap text-destructive text-xs">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
