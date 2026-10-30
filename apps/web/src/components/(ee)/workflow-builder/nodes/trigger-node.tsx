"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
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

type TriggerNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function TriggerNode({ id, data, selected }: TriggerNodeProps) {
  const config = data.config;
  const { topics, segments, showStats, workflowId } = useWorkflowData();
  const queryClient = useQueryClient();
  const allStats = queryClient.getQueryData<
    Record<string, WorkflowNodeStepStats>
  >(workflowNodeStatsKeys.detail(workflowId));
  const nodeStats = getNodeStats(allStats, data.stepId);
  const { isValid, errorMessage } = useNodeValidation(id);
  let description = "When triggered";

  if (config.type === "trigger") {
    switch (config.triggerType) {
      case "contact_created":
        description = "When a contact is created";
        break;
      case "contact_updated":
        description = "When a contact is updated";
        break;
      case "event":
        description = config.eventName
          ? `Event: ${config.eventName}`
          : "Custom event (not configured)";
        break;
      case "segment_entry": {
        const segmentName = segments.find(
          (s) => s.id === config.segmentId
        )?.name;
        description = segmentName ? `Enters: ${segmentName}` : "Segment entry";
        break;
      }
      case "segment_exit": {
        const segmentName = segments.find(
          (s) => s.id === config.segmentId
        )?.name;
        description = segmentName ? `Exits: ${segmentName}` : "Segment exit";
        break;
      }
      case "topic_subscribed": {
        const topicName = topics.find((t) => t.id === config.topicId)?.name;
        description = topicName
          ? `Subscribes: ${topicName}`
          : "Topic subscribed";
        break;
      }
      case "topic_unsubscribed": {
        const topicName = topics.find((t) => t.id === config.topicId)?.name;
        description = topicName
          ? `Unsubscribes: ${topicName}`
          : "Topic unsubscribed";
        break;
      }
      case "schedule":
        description = config.schedule
          ? `Schedule: ${config.schedule}`
          : "Scheduled";
        break;
      case "api":
        description = "API trigger";
        break;
    }
  }

  return (
    <BaseNode
      accentColor="bg-yellow-700"
      description={description}
      errorMessage={errorMessage}
      hasInput={false}
      hasOutput={true}
      icon={<Zap className="h-4 w-4" />}
      isValid={isValid}
      label={data.name}
      selected={selected}
    >
      {showStats && nodeStats && <StatsBadge stats={nodeStats} />}
    </BaseNode>
  );
}
