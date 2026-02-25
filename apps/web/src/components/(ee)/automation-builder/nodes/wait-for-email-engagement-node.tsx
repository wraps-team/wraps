"use client";

import { Handle, Position } from "@xyflow/react";
import { MailOpen } from "lucide-react";
import { cn, formatDurationCompact } from "@/lib/utils";
import type { WorkflowNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";

type WaitForEmailEngagementNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function WaitForEmailEngagementNode({
  id,
  data,
  selected,
}: WaitForEmailEngagementNodeProps) {
  const config = data.config;
  const { isValid, errorMessage } = useNodeValidation(id);
  let timeoutDisplay = "No timeout";

  if (config.type === "wait_for_email_engagement" && config.timeoutSeconds) {
    timeoutDisplay = formatDurationCompact(config.timeoutSeconds);
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
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-purple-500 text-white">
            <MailOpen className="h-3 w-3" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground text-xs">
              {data.name}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              Wait {timeoutDisplay}
            </div>
          </div>
        </div>
      </div>

      {/* Four outputs at bottom */}
      <div className="-bottom-5 absolute right-0 left-0 flex justify-between px-2">
        {/* Opened */}
        <div className="flex flex-col items-center">
          <span className="mb-0.5 font-medium text-[7px] text-green-600 dark:text-green-400">
            Open
          </span>
          <Handle
            className="!relative !transform-none !bg-green-500 !w-2 !h-2 !border-2 !border-background"
            id="opened"
            position={Position.Bottom}
            type="source"
          />
        </div>

        {/* Clicked */}
        <div className="flex flex-col items-center">
          <span className="mb-0.5 font-medium text-[7px] text-blue-600 dark:text-blue-400">
            Click
          </span>
          <Handle
            className="!relative !transform-none !bg-blue-500 !w-2 !h-2 !border-2 !border-background"
            id="clicked"
            position={Position.Bottom}
            type="source"
          />
        </div>

        {/* Bounced */}
        <div className="flex flex-col items-center">
          <span className="mb-0.5 font-medium text-[7px] text-red-600 dark:text-red-400">
            Bounce
          </span>
          <Handle
            className="!relative !transform-none !bg-red-500 !w-2 !h-2 !border-2 !border-background"
            id="bounced"
            position={Position.Bottom}
            type="source"
          />
        </div>

        {/* Timeout */}
        <div className="flex flex-col items-center">
          <span className="mb-0.5 font-medium text-[7px] text-yellow-600 dark:text-yellow-400">
            None
          </span>
          <Handle
            className="!relative !transform-none !bg-yellow-500 !w-2 !h-2 !border-2 !border-background"
            id="timeout"
            position={Position.Bottom}
            type="source"
          />
        </div>
      </div>

      {errorMessage && (
        <div className="-bottom-10 -translate-x-1/2 absolute left-1/2 whitespace-nowrap text-destructive text-xs">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
