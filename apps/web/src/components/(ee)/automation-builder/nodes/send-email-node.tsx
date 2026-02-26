"use client";

import { Mail } from "lucide-react";
import type { AutomationNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";
import { BaseNode } from "./base-node";

type SendEmailNodeProps = {
  id: string;
  data: AutomationNodeData;
  selected?: boolean;
};

export function SendEmailNode({ id, data, selected }: SendEmailNodeProps) {
  const config = data.config;
  const { isValid, errorMessage } = useNodeValidation(id);
  let description = "No template selected";

  if (config.type === "send_email" && config.templateId) {
    description = "Template selected";
  }

  return (
    <BaseNode
      accentColor="bg-blue-500"
      description={description}
      errorMessage={errorMessage}
      hasInput={true}
      hasOutput={true}
      icon={<Mail className="h-4 w-4" />}
      isValid={isValid}
      label={data.name}
      selected={selected}
    />
  );
}
