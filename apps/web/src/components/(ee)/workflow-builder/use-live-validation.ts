import { useDeferredValue, useEffect } from "react";
import { useWorkflowStore } from "./use-workflow-store";

/**
 * Re-validate the canvas whenever nodes or edges change (config edits,
 * new edges, deletions). Deferred so a drag doesn't validate every frame.
 */
export function useLiveValidation() {
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const runValidation = useWorkflowStore((state) => state.runValidation);
  const deferredNodes = useDeferredValue(nodes);
  const deferredEdges = useDeferredValue(edges);

  useEffect(() => {
    // Only run once the workflow is loaded
    if (deferredNodes.length > 0) {
      runValidation();
    }
  }, [runValidation, deferredNodes, deferredEdges]);
}
