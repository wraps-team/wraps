"use client";

import { Zap } from "lucide-react";
import type { WorkflowNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";
import { useWorkflowData } from "../automation-data-context";
import { BaseNode } from "./base-node";

type TriggerNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function TriggerNode({ id, data, selected }: TriggerNodeProps) {
  const config = data.config;
  const { topics, segments } = useWorkflowData();
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
      accentColor="bg-yellow-500"
      description={description}
      errorMessage={errorMessage}
      hasInput={false}
      hasOutput={true}
      icon={<Zap className="h-4 w-4" />}
      isValid={isValid}
      label={data.name}
      selected={selected}
    />
  );
}
