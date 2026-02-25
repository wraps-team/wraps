"use client";

import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

type BaseNodeProps = {
  icon: React.ReactNode;
  label: string;
  description?: string;
  accentColor: string;
  hasInput?: boolean;
  hasOutput?: boolean;
  outputs?: { id: string; label: string }[];
  isValid?: boolean;
  errorMessage?: string;
  selected?: boolean;
};

export function BaseNode({
  icon,
  label,
  description,
  accentColor,
  hasInput = true,
  hasOutput = true,
  outputs,
  isValid = true,
  errorMessage,
  selected,
}: BaseNodeProps) {
  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border-2 bg-background px-4 py-3 shadow-sm",
        "transition-all duration-150",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
        !isValid && "border-destructive ring-2 ring-destructive/20"
      )}
    >
      {hasInput && (
        <Handle
          className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
          position={Position.Top}
          type="target"
        />
      )}

      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-white",
            accentColor
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground text-sm">
            {label}
          </div>
          {description && (
            <div className="truncate text-muted-foreground text-xs">
              {description}
            </div>
          )}
        </div>
      </div>

      {!isValid && errorMessage && (
        <div className="mt-2 text-destructive text-xs">{errorMessage}</div>
      )}

      {hasOutput && !outputs && (
        <Handle
          className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
          position={Position.Bottom}
          type="source"
        />
      )}

      {outputs?.map((output, index) => (
        <Handle
          className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
          id={output.id}
          key={output.id}
          position={Position.Bottom}
          style={{
            left: `${((index + 1) / (outputs.length + 1)) * 100}%`,
          }}
          type="source"
        />
      ))}
    </div>
  );
}
