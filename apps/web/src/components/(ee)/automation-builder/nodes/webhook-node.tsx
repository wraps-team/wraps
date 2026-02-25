"use client";

import { Webhook } from "lucide-react";
import type { WorkflowNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";
import { BaseNode } from "./base-node";

type WebhookNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function WebhookNode({ id, data, selected }: WebhookNodeProps) {
  const config = data.config;
  const { isValid, errorMessage } = useNodeValidation(id);
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
      accentColor="bg-cyan-500"
      description={description}
      errorMessage={errorMessage}
      hasInput={true}
      hasOutput={true}
      icon={<Webhook className="h-4 w-4" />}
      isValid={isValid}
      label={data.name}
      selected={selected}
    />
  );
}
