"use client";

import { GripVertical } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type DragHandleProps = {
  className?: string;
};

/**
 * Drag handle component for TipTap node views.
 * Must have data-drag-handle attribute for TipTap to recognize it as a drag handle.
 */
export const DragHandle = forwardRef<HTMLDivElement, DragHandleProps>(
  ({ className }, ref) => (
    <div
      className={cn(
        "flex h-6 w-6 cursor-grab items-center justify-center rounded bg-secondary text-muted-foreground opacity-0 transition-opacity hover:bg-secondary/80 active:cursor-grabbing group-hover:opacity-100",
        className
      )}
      contentEditable={false}
      data-drag-handle
      ref={ref}
    >
      <GripVertical className="h-4 w-4" />
    </div>
  )
);

DragHandle.displayName = "DragHandle";
