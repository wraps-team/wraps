// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflowStore } from "../use-workflow-store";

let uuidCounter = 0;
vi.stubGlobal("crypto", {
  randomUUID: () => `live-uuid-${++uuidCounter}`,
});

const templateErrors = (nodeId: string) =>
  (
    useWorkflowStore.getState().validationResult?.errorsByNodeId.get(nodeId) ??
    []
  ).filter((e) => e.field === "templateId");

describe("useLiveValidation", () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      workflow: null,
      isDirty: false,
      isSaving: false,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      validationResult: null,
    });
    uuidCounter = 0;
  });

  it("validates once nodes are loaded", async () => {
    const { renderHook, waitFor } = await import("@testing-library/react");
    const { useLiveValidation } = await import("../use-live-validation");

    useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
    const { unmount } = renderHook(() => useLiveValidation());

    await waitFor(() => {
      expect(useWorkflowStore.getState().validationResult).not.toBeNull();
    });
    unmount();
  });

  it("clears a node error after a config edit without a node count change", async () => {
    const { renderHook, waitFor, act } = await import("@testing-library/react");
    const { useLiveValidation } = await import("../use-live-validation");

    useWorkflowStore.getState().addNode("send_email", { x: 0, y: 0 });
    const nodeId = useWorkflowStore.getState().nodes[0].id;
    useWorkflowStore.getState().updateNodeConfig(nodeId, { templateId: "" });

    const { unmount } = renderHook(() => useLiveValidation());

    await waitFor(() => {
      expect(templateErrors(nodeId).length).toBeGreaterThan(0);
    });

    act(() => {
      useWorkflowStore
        .getState()
        .updateNodeConfig(nodeId, { templateId: "tmpl-1" });
    });

    await waitFor(() => {
      expect(templateErrors(nodeId)).toHaveLength(0);
    });
    expect(useWorkflowStore.getState().nodes).toHaveLength(1);
    unmount();
  });

  it("does not validate with zero nodes", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useLiveValidation } = await import("../use-live-validation");

    const { unmount } = renderHook(() => useLiveValidation());

    expect(useWorkflowStore.getState().validationResult).toBeNull();
    unmount();
  });
});
