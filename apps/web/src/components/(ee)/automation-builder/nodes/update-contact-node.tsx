"use client";

import { UserCog } from "lucide-react";
import type { WorkflowNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";
import { BaseNode } from "./base-node";

type UpdateContactNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function UpdateContactNode({
  id,
  data,
  selected,
}: UpdateContactNodeProps) {
  const config = data.config;
  const { isValid, errorMessage } = useNodeValidation(id);
  let description = "No updates configured";

  if (config.type === "update_contact" && config.updates?.length > 0) {
    const count = config.updates.length;
    description = `${count} field${count !== 1 ? "s" : ""} to update`;
  }

  return (
    <BaseNode
      accentColor="bg-indigo-500"
      description={description}
      errorMessage={errorMessage}
      hasInput={true}
      hasOutput={true}
      icon={<UserCog className="h-4 w-4" />}
      isValid={isValid}
      label={data.name}
      selected={selected}
    />
  );
}
