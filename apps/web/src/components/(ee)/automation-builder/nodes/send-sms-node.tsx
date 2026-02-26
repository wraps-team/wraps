"use client";

import { MessageSquare } from "lucide-react";
import type { AutomationNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";
import { BaseNode } from "./base-node";

type SendSmsNodeProps = {
  id: string;
  data: AutomationNodeData;
  selected?: boolean;
};

export function SendSmsNode({ id, data, selected }: SendSmsNodeProps) {
  const config = data.config;
  const { isValid, errorMessage } = useNodeValidation(id);
  let description = "No message configured";

  if (config.type === "send_sms" && config.body) {
    description =
      config.body.length > 30
        ? `${config.body.substring(0, 30)}...`
        : config.body;
  }

  return (
    <BaseNode
      accentColor="bg-green-500"
      description={description}
      errorMessage={errorMessage}
      hasInput={true}
      hasOutput={true}
      icon={<MessageSquare className="h-4 w-4" />}
      isValid={isValid}
      label={data.name}
      selected={selected}
    />
  );
}
