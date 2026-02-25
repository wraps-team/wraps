"use client";

import { Handle, Position } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";

type ConditionNodeProps = {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
};

export function ConditionNode({ id, data, selected }: ConditionNodeProps) {
  const config = data.config;
  const { isValid, errorMessage } = useNodeValidation(id);
  let description = "Configure condition";

  if (config.type === "condition" && config.field) {
    const operatorLabels: Record<string, string> = {
      equals: "=",
      not_equals: "≠",
      contains: "contains",
      not_contains: "not contains",
      starts_with: "starts with",
      ends_with: "ends with",
      greater_than: ">",
      less_than: "<",
      is_set: "is set",
      is_not_set: "is not set",
    };
    const op = operatorLabels[config.operator] || config.operator;

    // Show human-readable field name (replace step UUIDs with short labels)
    let fieldLabel = config.field;
    if (fieldLabel.match(/^steps\.[a-f0-9-]+\./)) {
      fieldLabel = fieldLabel.replace(/^steps\.[a-f0-9-]+\./, "");
    }

    if (config.operator === "is_set" || config.operator === "is_not_set") {
      description = `${fieldLabel} ${op}`;
    } else {
      description = `${fieldLabel} ${op} ${config.value}`;
    }
  }

  return (
    <div className="relative">
      {/* Input handle at top */}
      <Handle
        className="!bg-muted-foreground !w-3 !h-3 !border-2 !border-background"
        position={Position.Top}
        type="target"
      />

      {/* Diamond shape container */}
      <div
        className={cn(
          "h-[90px] w-[90px] rotate-45 rounded-md border-2 bg-background shadow-sm",
          "flex items-center justify-center",
          "transition-all duration-150",
          selected ? "border-primary ring-2 ring-primary/20" : "border-border",
          !isValid && "border-destructive ring-2 ring-destructive/20"
        )}
      >
        {/* Content rotated back */}
        <div className="-rotate-45 flex flex-col items-center px-1 text-center">
          <div className="mb-0.5 flex h-6 w-6 items-center justify-center rounded bg-orange-500 text-white">
            <GitBranch className="h-3 w-3" />
          </div>
          <div className="max-w-[55px] truncate font-medium text-[10px] text-foreground">
            {data.name}
          </div>
          <div className="max-w-[55px] truncate text-[8px] text-muted-foreground">
            {description}
          </div>
        </div>
      </div>

      {/* Yes output - bottom left */}
      <div className="-bottom-5 absolute left-2 flex flex-col items-center">
        <span className="mb-0.5 font-medium text-[8px] text-green-600 dark:text-green-400">
          Yes
        </span>
        <Handle
          className="!relative !transform-none !bg-green-500 !w-2.5 !h-2.5 !border-2 !border-background"
          id="yes"
          position={Position.Bottom}
          type="source"
        />
      </div>

      {/* No output - bottom right */}
      <div className="-bottom-5 absolute right-2 flex flex-col items-center">
        <span className="mb-0.5 font-medium text-[8px] text-red-600 dark:text-red-400">
          No
        </span>
        <Handle
          className="!relative !transform-none !bg-red-500 !w-2.5 !h-2.5 !border-2 !border-background"
          id="no"
          position={Position.Bottom}
          type="source"
        />
      </div>

      {errorMessage && (
        <div className="-bottom-12 -translate-x-1/2 absolute left-1/2 whitespace-nowrap text-destructive text-xs">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
