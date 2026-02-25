"use client";

import { Bell } from "lucide-react";
import type { WorkflowNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";
import { useWorkflowData } from "../automation-data-context";
import { BaseNode } from "./base-node";

type TopicNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function TopicNode({ id, data, selected }: TopicNodeProps) {
  const config = data.config;
  const { topics } = useWorkflowData();
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
      accentColor="bg-emerald-500"
      description={description}
      errorMessage={errorMessage}
      hasInput={true}
      hasOutput={true}
      icon={<Bell className="h-4 w-4" />}
      isValid={isValid}
      label={data.name || action}
      selected={selected}
    />
  );
}
