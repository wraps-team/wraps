"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";

export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Determine label and color based on source handle
  let label = "";
  let labelColor = "bg-muted text-muted-foreground";

  if (sourceHandleId === "yes") {
    label = "Yes";
    labelColor =
      "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400";
  } else if (sourceHandleId === "no") {
    label = "No";
    labelColor = "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400";
  } else if (sourceHandleId === "timeout") {
    label = "Timeout";
    labelColor =
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400";
  } else if (sourceHandleId === "default") {
    label = "Default";
    labelColor = "bg-muted text-muted-foreground";
  } else if (sourceHandleId === "engaged") {
    label = "Engaged";
    labelColor =
      "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400";
  } else if (sourceHandleId === "exhausted") {
    label = "Exhausted";
    labelColor =
      "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-400";
  }

  // Determine stroke color
  let strokeColor = "var(--color-muted-foreground, #9ca3af)";
  if (sourceHandleId === "yes" || sourceHandleId === "engaged") {
    strokeColor = "var(--color-green-500, #22c55e)";
  } else if (sourceHandleId === "no") {
    strokeColor = "var(--color-red-500, #ef4444)";
  }

  return (
    <>
      <BaseEdge
        markerEnd={markerEnd}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: strokeColor,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            <div
              className={`rounded px-2 py-0.5 font-medium text-xs ${labelColor}`}
            >
              {label}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
