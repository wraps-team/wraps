"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  useReactFlow,
} from "@xyflow/react";
import { useDeferredValue, useMemo } from "react";
import { computeSmartPath } from "./compute-smart-path";
import { EdgeLabelPopover } from "./edge-label-popover";

export function LabeledEdge({
  id,
  source,
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
  const { getNodes } = useReactFlow();
  const nodes = getNodes();
  const deferredNodes = useDeferredValue(nodes);

  const { edgePath, labelX, labelY } = useMemo(() => {
    const smartResult = computeSmartPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      nodes: deferredNodes,
    });

    if (smartResult) {
      return {
        edgePath: smartResult.svgPath,
        labelX: smartResult.labelX,
        labelY: smartResult.labelY,
      };
    }

    const [path, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 16,
      offset: 25,
    });

    return { edgePath: path, labelX: lx, labelY: ly };
  }, [
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    deferredNodes,
  ]);

  // Determine label and color based on source handle
  let label = "";
  let labelColor = "bg-muted text-muted-foreground";

  if (sourceHandleId === "yes") {
    label = "Yes";
    labelColor = "bg-success/15 text-success";
  } else if (sourceHandleId === "no") {
    label = "No";
    labelColor = "bg-destructive/15 text-destructive";
  } else if (sourceHandleId === "timeout") {
    label = "Timeout";
    labelColor = "bg-warning/15 text-warning";
  } else if (sourceHandleId === "default") {
    label = "Default";
    labelColor = "bg-muted text-muted-foreground";
  } else if (sourceHandleId === "engaged") {
    label = "Engaged";
    labelColor = "bg-success/15 text-success";
  } else if (sourceHandleId === "exhausted") {
    label = "Exhausted";
    labelColor = "bg-muted text-muted-foreground";
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
            {sourceHandleId ? (
              <EdgeLabelPopover
                label={label}
                labelColor={labelColor}
                sourceHandleId={sourceHandleId}
                sourceNodeId={source}
              />
            ) : (
              <div
                className={`rounded px-2 py-0.5 font-medium text-xs ${labelColor}`}
              >
                {label}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
