"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { CascadeChannelConfig } from "@wraps/db";
import { Handle, Position } from "@xyflow/react";
import { Layers, Mail, MessageSquare } from "lucide-react";
import { useMemo } from "react";
import type { WorkflowNodeStepStats } from "@/actions/(ee)/workflows";
import { cn, formatDurationCompact } from "@/lib/utils";
import {
  getNodeStats,
  workflowNodeStatsKeys,
} from "../hooks/use-workflow-node-stats";
import type { WorkflowNodeData } from "../use-workflow-store";
import { useNodeValidation } from "../use-workflow-store";
import { useWorkflowData } from "../workflow-data-context";
import { StatsBadge } from "./stats-badge";

type CascadeNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function CascadeNode({ id, data, selected }: CascadeNodeProps) {
  const channels: CascadeChannelConfig[] = data.cascadeChannels ?? [];
  const { isValid, errorMessage } = useNodeValidation(id);
  const { showStats, workflowId } = useWorkflowData();
  const queryClient = useQueryClient();
  const allStats = queryClient.getQueryData<
    Record<string, WorkflowNodeStepStats>
  >(workflowNodeStatsKeys.detail(workflowId));

  const cascadePrimitiveIds = useMemo(() => {
    const chs = data.cascadeChannels ?? [];
    const ids: string[] = [];
    for (let i = 0; i < chs.length; i++) {
      ids.push(`${id}-send-${i}`);
      if (i < chs.length - 1) {
        ids.push(`${id}-cond-${i}`);
        ids.push(`${id}-wait-${i}`);
      }
    }
    return ids;
  }, [id, data.cascadeChannels]);

  const stats = getNodeStats(allStats, data.stepId, cascadePrimitiveIds);

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
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-r from-blue-500 to-green-700 text-white">
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
                    ? "bg-info/10 text-info"
                    : "bg-success/10 text-success"
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
        className="!h-3 !w-3 !border-2 !border-background !bg-success"
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

      {showStats && stats && (
        <div className="border-t px-3 py-1.5">
          <StatsBadge stats={stats} />
        </div>
      )}

      {errorMessage && (
        <div className="-bottom-10 -translate-x-1/2 absolute left-1/2 whitespace-nowrap text-destructive text-xs">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
