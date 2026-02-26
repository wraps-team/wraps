"use client";

import { Clock } from "lucide-react";
import type { AutomationNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";
import { BaseNode } from "./base-node";

type DelayNodeProps = {
  id: string;
  data: AutomationNodeData;
  selected?: boolean;
};

export function DelayNode({ id, data, selected }: DelayNodeProps) {
  const config = data.config;
  const { isValid, errorMessage } = useNodeValidation(id);
  let description = "Configure delay";

  if (config.type === "delay") {
    const amount = config.amount || 1;
    const unit = config.unit || "days";
    const plural = amount !== 1 ? "s" : "";
    description = `Wait ${amount} ${unit}${unit.endsWith("s") ? "" : plural}`;
  }

  return (
    <BaseNode
      accentColor="bg-purple-500"
      description={description}
      errorMessage={errorMessage}
      hasInput={true}
      hasOutput={true}
      icon={<Clock className="h-4 w-4" />}
      isValid={isValid}
      label={data.name}
      selected={selected}
    />
  );
}
