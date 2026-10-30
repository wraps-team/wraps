"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
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

type TopicNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function TopicNode({ id, data, selected }: TopicNodeProps) {
  const config = data.config;
  const { topics, showStats, workflowId } = useWorkflowData();
  const queryClient = useQueryClient();
  const allStats = queryClient.getQueryData<
    Record<string, WorkflowNodeStepStats>
  >(workflowNodeStatsKeys.detail(workflowId));
  const nodeStats = getNodeStats(allStats, data.stepId);
  const { isValid, errorMessage } = useNodeValidation(id);
  let description = "Configure topic";
  let action = "Subscribe";

  if (config.type === "subscribe_topic") {
    action = "Subscribe";
    const topicName = topics.find((t) => t.id === config.topicId)?.name;
    description = topicName ? `Subscribe: ${topicName}` : "Select topic";
  } else if (config.type === "unsubscribe_topic") {
    action = "Unsubscribe";
    const topicName = topics.find((t) => t.id === config.topicId)?.name;
    description = topicName ? `Unsubscribe: ${topicName}` : "Select topic";
  }

  return (
    <BaseNode
      accentColor="bg-emerald-700"
      description={description}
      errorMessage={errorMessage}
      hasInput={true}
      hasOutput={true}
      icon={<Bell className="h-4 w-4" />}
      isValid={isValid}
      label={data.name || action}
      selected={selected}
    >
      {showStats && nodeStats && <StatsBadge stats={nodeStats} />}
    </BaseNode>
  );
}
