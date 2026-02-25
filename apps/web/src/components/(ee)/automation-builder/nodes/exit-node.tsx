"use client";

import { LogOut } from "lucide-react";
import type { WorkflowNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";
import { BaseNode } from "./base-node";

type ExitNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function ExitNode({ id, data, selected }: ExitNodeProps) {
  const { isValid, errorMessage } = useNodeValidation(id);

  return (
    <BaseNode
      accentColor="bg-red-500"
      description="End workflow"
      errorMessage={errorMessage}
      hasInput={true}
      hasOutput={false}
      icon={<LogOut className="h-4 w-4" />}
      isValid={isValid}
      label={data.name}
      selected={selected}
    />
  );
}
