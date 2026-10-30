"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Webhook } from "lucide-react";
import type { WorkflowNodeStepStats } from "@/actions/(ee)/workflows";
import {
  getNodeStats,
  workflowNodeStatsKeys,
} from "../hooks/use-workflow-node-stats";
import type { WorkflowNodeData } from "../use-workflow-store";
import { useNodeValidation } from "../use-workflow-store";
import { useWorkflowData } from "../workflow-data-context";
import { BaseNode } from "./base-node";
import { StatsBadge } from "./stats-badge";

type WebhookNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function WebhookNode({ id, data, selected }: WebhookNodeProps) {
  const config = data.config;
  const { isValid, errorMessage } = useNodeValidation(id);
  const { showStats, workflowId } = useWorkflowData();
  const queryClient = useQueryClient();
  const allStats = queryClient.getQueryData<
    Record<string, WorkflowNodeStepStats>
  >(workflowNodeStatsKeys.detail(workflowId));
  const stats = getNodeStats(allStats, data.stepId);
  let description = "No URL configured";

  if (config.type === "webhook" && config.url) {
    try {
      const url = new URL(config.url);
      description = `${config.method || "POST"} ${url.hostname}`;
    } catch {
      description = `${config.method || "POST"} ${config.url.substring(0, 20)}...`;
    }
  }

  return (
    <BaseNode
      accentColor="bg-cyan-700"
      description={description}
      errorMessage={errorMessage}
      hasInput={true}
      hasOutput={true}
      icon={<Webhook className="h-4 w-4" />}
      isValid={isValid}
      label={data.name}
      selected={selected}
    >
      {showStats && stats && <StatsBadge stats={stats} />}
    </BaseNode>
  );
}
