"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
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

type SendSmsNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function SendSmsNode({ id, data, selected }: SendSmsNodeProps) {
  const config = data.config;
  const { isValid, errorMessage } = useNodeValidation(id);
  const { showStats, workflowId } = useWorkflowData();
  const queryClient = useQueryClient();
  const allStats = queryClient.getQueryData<
    Record<string, WorkflowNodeStepStats>
  >(workflowNodeStatsKeys.detail(workflowId));
  const stats = getNodeStats(allStats, data.stepId);
  let description = "No message configured";

  if (config.type === "send_sms" && config.body) {
    description =
      config.body.length > 30
        ? `${config.body.substring(0, 30)}...`
        : config.body;
  }

  return (
    <BaseNode
      accentColor="bg-green-700"
      description={description}
      errorMessage={errorMessage}
      hasInput={true}
      hasOutput={true}
      icon={<MessageSquare className="h-4 w-4" />}
      isValid={isValid}
      label={data.name}
      selected={selected}
    >
      {showStats && stats && <StatsBadge stats={stats} />}
    </BaseNode>
  );
}
