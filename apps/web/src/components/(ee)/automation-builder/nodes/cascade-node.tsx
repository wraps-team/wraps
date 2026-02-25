"use client";

import type { CascadeChannelConfig } from "@wraps/db";
import { Handle, Position } from "@xyflow/react";
import { Layers, Mail, MessageSquare } from "lucide-react";
import { cn, formatDurationCompact } from "@/lib/utils";
import type { WorkflowNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";

type CascadeNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function CascadeNode({ id, data, selected }: CascadeNodeProps) {
  const channels: CascadeChannelConfig[] = data.cascadeChannels ?? [];
  const { isValid, errorMessage } = useNodeValidation(id);

  return (
    <div
      className={cn(
        "min-w-[200px] max-w-[240px] rounded-lg border-2 bg-background shadow-sm",
        "transition-all duration-150",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
        !isValid && "border-destructive ring-2 ring-destructive/20"
      )}
    >
      {/* Input handle */}
      <Handle
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
        position={Position.Top}
        type="target"
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-r from-blue-500 to-green-500 text-white">
          <Layers className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground text-sm">
            {data.name || "Cascade"}
          </div>
          <div className="text-muted-foreground text-xs">
            {channels.length} channel{channels.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Channel list */}
      {channels.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1.5">
          {channels.map((channel, index) => (
            <div
              className="flex items-center gap-2 text-xs"
              key={`${channel.type}-${index}`}
            >
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded",
                  channel.type === "email"
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "bg-green-500/10 text-green-600 dark:text-green-400"
                )}
              >
                {channel.type === "email" ? (
                  <Mail className="h-3 w-3" />
                ) : (
                  <MessageSquare className="h-3 w-3" />
                )}
              </div>
              <span className="flex-1 truncate text-foreground">
                {channel.templateId
                  ? channel.type === "email"
                    ? "Email"
                    : "SMS"
                  : channel.body
                    ? "SMS"
                    : "Configure..."}
              </span>
              {channel.waitDuration && index < channels.length - 1 ? (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-[10px]">
                  {formatDurationCompact(channel.waitDuration)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Output handles */}
      <Handle
        className="!h-3 !w-3 !border-2 !border-background !bg-green-500"
        id="engaged"
        position={Position.Bottom}
        style={{ left: "35%" }}
        type="source"
      />
      <Handle
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
        id="exhausted"
        position={Position.Bottom}
        style={{ left: "65%" }}
        type="source"
      />

      {errorMessage && (
        <div className="-bottom-10 -translate-x-1/2 absolute left-1/2 whitespace-nowrap text-destructive text-xs">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
