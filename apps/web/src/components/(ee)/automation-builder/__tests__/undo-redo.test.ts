import type { Workflow, WorkflowStep, WorkflowTransition } from "@wraps/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflowStore } from "../use-automation-store";

// Mock crypto.randomUUID for deterministic IDs
let uuidCounter = 0;
vi.stubGlobal("crypto", {
  randomUUID: () => `undo-uuid-${++uuidCounter}`,
});

describe("undo/redo", () => {
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
    // Clear undo/redo history
    useWorkflowStore.temporal.getState().clear();
    uuidCounter = 0;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 1: temporal middleware tracks history on addNode
  // ═══════════════════════════════════════════════════════════════════════════

  describe("history tracking", () => {
    it("should have empty history initially", () => {
      const { pastStates, futureStates } = useWorkflowStore.temporal.getState();
      expect(pastStates).toHaveLength(0);
      expect(futureStates).toHaveLength(0);
    });

    it("should create a history entry when addNode is called", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });

      const { pastStates } = useWorkflowStore.temporal.getState();
      expect(pastStates).toHaveLength(1);
      expect(pastStates[0].nodes).toEqual([]);
      expect(pastStates[0].edges).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 2: undo() restores previous nodes/edges after addNode
  // ═══════════════════════════════════════════════════════════════════════════

  describe("undo after addNode", () => {
    it("should restore empty canvas after undoing addNode", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 100, y: 100 });
      expect(useWorkflowStore.getState().nodes).toHaveLength(1);

      useWorkflowStore.temporal.getState().undo();

      const state = useWorkflowStore.getState();
      expect(state.nodes).toHaveLength(0);
      expect(state.edges).toHaveLength(0);
    });

    it("should restore first node after undoing second addNode", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.getState().addNode("send_email", { x: 0, y: 150 });
      expect(useWorkflowStore.getState().nodes).toHaveLength(2);

      useWorkflowStore.temporal.getState().undo();

      const state = useWorkflowStore.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0].type).toBe("trigger");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 3: redo() re-applies undone addNode
  // ═══════════════════════════════════════════════════════════════════════════

  describe("redo after undo", () => {
    it("should re-apply undone addNode", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.temporal.getState().undo();
      expect(useWorkflowStore.getState().nodes).toHaveLength(0);

      useWorkflowStore.temporal.getState().redo();

      expect(useWorkflowStore.getState().nodes).toHaveLength(1);
      expect(useWorkflowStore.getState().nodes[0].type).toBe("trigger");
    });

    it("should clear future states when new action is taken after undo", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.temporal.getState().undo();

      // New action should clear redo stack
      useWorkflowStore.getState().addNode("delay", { x: 100, y: 100 });

      const { futureStates } = useWorkflowStore.temporal.getState();
      expect(futureStates).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 4: undo() restores state after deleteNode (with connected edges)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("undo after deleteNode", () => {
    it("should restore deleted node and its connected edges", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.getState().addNode("send_email", { x: 0, y: 150 });
      useWorkflowStore.getState().onConnect({
        source: "undo-uuid-1",
        target: "undo-uuid-2",
        sourceHandle: null,
        targetHandle: null,
      });

      expect(useWorkflowStore.getState().nodes).toHaveLength(2);
      expect(useWorkflowStore.getState().edges).toHaveLength(1);

      // Delete the send_email node (removes node + edge)
      useWorkflowStore.getState().deleteNode("undo-uuid-2");
      expect(useWorkflowStore.getState().nodes).toHaveLength(1);
      expect(useWorkflowStore.getState().edges).toHaveLength(0);

      // Undo should restore both node and edge
      useWorkflowStore.temporal.getState().undo();

      const state = useWorkflowStore.getState();
      expect(state.nodes).toHaveLength(2);
      expect(state.edges).toHaveLength(1);
      expect(state.nodes.find((n) => n.id === "undo-uuid-2")).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 5: undo() restores state after onConnect (edge addition)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("undo after onConnect", () => {
    it("should remove edge but keep nodes when undoing a connection", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.getState().addNode("send_email", { x: 0, y: 150 });
      useWorkflowStore.getState().onConnect({
        source: "undo-uuid-1",
        target: "undo-uuid-2",
        sourceHandle: null,
        targetHandle: null,
      });
      expect(useWorkflowStore.getState().edges).toHaveLength(1);

      useWorkflowStore.temporal.getState().undo();

      const state = useWorkflowStore.getState();
      expect(state.edges).toHaveLength(0);
      // Nodes should still be present (from previous state)
      expect(state.nodes).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 6: undo() restores state after updateNodeConfig
  // ═══════════════════════════════════════════════════════════════════════════

  describe("undo after updateNodeConfig", () => {
    it("should restore previous node config", () => {
      useWorkflowStore.getState().addNode("send_email", { x: 0, y: 0 });
      const originalConfig = useWorkflowStore.getState().nodes[0].data.config;

      useWorkflowStore
        .getState()
        .updateNodeConfig("undo-uuid-1", { templateId: "tmpl-new" });

      useWorkflowStore.temporal.getState().undo();

      const restoredConfig = useWorkflowStore.getState().nodes[0].data.config;
      expect(restoredConfig).toEqual(originalConfig);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 7: undo() restores state after updateNodeName
  // ═══════════════════════════════════════════════════════════════════════════

  describe("undo after updateNodeName", () => {
    it("should restore previous node name", () => {
      useWorkflowStore.getState().addNode("send_email", { x: 0, y: 0 });

      useWorkflowStore.getState().updateNodeName("undo-uuid-1", "Custom Name");
      expect(useWorkflowStore.getState().nodes[0].data.name).toBe(
        "Custom Name"
      );

      useWorkflowStore.temporal.getState().undo();

      expect(useWorkflowStore.getState().nodes[0].data.name).toBe("Send Email");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 8: undo() restores state after applyAIFlow
  // ═══════════════════════════════════════════════════════════════════════════

  describe("undo after applyAIFlow", () => {
    it("should restore previous canvas when undoing AI-generated flow", () => {
      // Set up existing canvas
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.getState().addNode("delay", { x: 0, y: 150 });
      expect(useWorkflowStore.getState().nodes).toHaveLength(2);

      // Apply AI flow (replaces everything)
      const aiSteps: WorkflowStep[] = [
        {
          id: "ai-step-1",
          type: "trigger",
          name: "AI Trigger",
          position: { x: 0, y: 0 },
          config: { type: "trigger", triggerType: "event" },
        },
        {
          id: "ai-step-2",
          type: "send_email",
          name: "AI Email",
          position: { x: 0, y: 150 },
          config: { type: "send_email", templateId: "ai-tmpl" },
        },
        {
          id: "ai-step-3",
          type: "exit",
          name: "AI Exit",
          position: { x: 0, y: 300 },
          config: { type: "exit" },
        },
      ];
      const aiTransitions: WorkflowTransition[] = [
        { id: "ai-t-1", fromStepId: "ai-step-1", toStepId: "ai-step-2" },
        { id: "ai-t-2", fromStepId: "ai-step-2", toStepId: "ai-step-3" },
      ];
      useWorkflowStore.getState().applyAIFlow(aiSteps, aiTransitions);
      expect(useWorkflowStore.getState().nodes).toHaveLength(3);

      // Undo should restore original 2 nodes
      useWorkflowStore.temporal.getState().undo();

      const state = useWorkflowStore.getState();
      expect(state.nodes).toHaveLength(2);
      expect(state.nodes[0].type).toBe("trigger");
      expect(state.nodes[1].type).toBe("delay");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 9: canUndo/canRedo return correct boolean state
  // ═══════════════════════════════════════════════════════════════════════════

  describe("canUndo and canRedo", () => {
    it("should both be false on fresh store", () => {
      const temporal = useWorkflowStore.temporal.getState();
      expect(temporal.pastStates).toHaveLength(0);
      expect(temporal.futureStates).toHaveLength(0);
    });

    it("should have canUndo true after an action", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });

      const { pastStates } = useWorkflowStore.temporal.getState();
      expect(pastStates.length > 0).toBe(true);
    });

    it("should have canRedo true after undo", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.temporal.getState().undo();

      const { futureStates } = useWorkflowStore.temporal.getState();
      expect(futureStates.length > 0).toBe(true);
    });

    it("should have canRedo false after undo then new action", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.temporal.getState().undo();
      useWorkflowStore.getState().addNode("delay", { x: 0, y: 0 });

      const { futureStates } = useWorkflowStore.temporal.getState();
      expect(futureStates).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 10: non-tracked changes skip history
  // ═══════════════════════════════════════════════════════════════════════════

  describe("non-tracked changes", () => {
    it("should NOT create history entry for selectNode", () => {
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      const countBefore =
        useWorkflowStore.temporal.getState().pastStates.length;

      useWorkflowStore.getState().selectNode("some-id");
      useWorkflowStore.getState().selectNode(null);

      const countAfter = useWorkflowStore.temporal.getState().pastStates.length;
      expect(countAfter).toBe(countBefore);
    });

    it("should NOT create history entry for setCanvasViewport", () => {
      const countBefore =
        useWorkflowStore.temporal.getState().pastStates.length;

      useWorkflowStore
        .getState()
        .setCanvasViewport({ x: 100, y: 200, zoom: 1.5 });

      const countAfter = useWorkflowStore.temporal.getState().pastStates.length;
      expect(countAfter).toBe(countBefore);
    });

    it("should NOT create history entry for toggleSettingsPanel", () => {
      const countBefore =
        useWorkflowStore.temporal.getState().pastStates.length;

      useWorkflowStore.getState().toggleSettingsPanel();

      const countAfter = useWorkflowStore.temporal.getState().pastStates.length;
      expect(countAfter).toBe(countBefore);
    });

    it("should NOT create history entry for setIsSaving", () => {
      const countBefore =
        useWorkflowStore.temporal.getState().pastStates.length;

      useWorkflowStore.getState().setIsSaving(true);
      useWorkflowStore.getState().setIsSaving(false);

      const countAfter = useWorkflowStore.temporal.getState().pastStates.length;
      expect(countAfter).toBe(countBefore);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 11: setWorkflow clears history
  // ═══════════════════════════════════════════════════════════════════════════

  describe("setWorkflow clears history", () => {
    it("should clear undo history when loading a workflow", () => {
      // Build up some history
      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.getState().addNode("send_email", { x: 0, y: 150 });
      expect(
        useWorkflowStore.temporal.getState().pastStates.length
      ).toBeGreaterThan(0);

      // Load a workflow
      const mockWorkflow = createMockWorkflow({
        steps: [
          {
            id: "loaded-step",
            type: "trigger",
            name: "Loaded",
            position: { x: 0, y: 0 },
            config: { type: "trigger", triggerType: "event" },
          },
        ],
        transitions: [],
      });
      useWorkflowStore.getState().setWorkflow(mockWorkflow);

      // History should be cleared
      const { pastStates, futureStates } = useWorkflowStore.temporal.getState();
      expect(pastStates).toHaveLength(0);
      expect(futureStates).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Unit 12: handleUndoRedo processes keyboard events correctly
  // ═══════════════════════════════════════════════════════════════════════════

  describe("handleUndoRedo keyboard handler", () => {
    // We test the exported handler function directly rather than
    // rendering React components — this tests the core logic.
    // The handler is imported and used in workflow-canvas.tsx.

    it("should undo on Cmd+Z (meta key)", async () => {
      const { handleUndoRedo } = await import("../use-workflow-store");

      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      expect(useWorkflowStore.getState().nodes).toHaveLength(1);

      handleUndoRedo({
        key: "z",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      });

      expect(useWorkflowStore.getState().nodes).toHaveLength(0);
    });

    it("should undo on Ctrl+Z", async () => {
      const { handleUndoRedo } = await import("../use-workflow-store");

      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });

      handleUndoRedo({
        key: "z",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      });

      expect(useWorkflowStore.getState().nodes).toHaveLength(0);
    });

    it("should redo on Cmd+Shift+Z", async () => {
      const { handleUndoRedo } = await import("../use-workflow-store");

      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.temporal.getState().undo();
      expect(useWorkflowStore.getState().nodes).toHaveLength(0);

      handleUndoRedo({
        key: "z",
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
      });

      expect(useWorkflowStore.getState().nodes).toHaveLength(1);
    });

    it("should redo on Ctrl+Y", async () => {
      const { handleUndoRedo } = await import("../use-workflow-store");

      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });
      useWorkflowStore.temporal.getState().undo();

      handleUndoRedo({
        key: "y",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      });

      expect(useWorkflowStore.getState().nodes).toHaveLength(1);
    });

    it("should not undo on plain Z key (no modifier)", async () => {
      const { handleUndoRedo } = await import("../use-workflow-store");

      useWorkflowStore.getState().addNode("trigger", { x: 0, y: 0 });

      handleUndoRedo({
        key: "z",
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      });

      expect(useWorkflowStore.getState().nodes).toHaveLength(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMockWorkflow(
  overrides: Partial<Workflow> & {
    steps: WorkflowStep[];
    transitions: WorkflowTransition[];
  }
): Workflow {
  const { steps, transitions, ...rest } = overrides;
  return {
    id: "wf-1",
    name: "Test Workflow",
    description: null,
    status: "draft",
    triggerType: "event",
    triggerConfig: { eventName: "signup" },
    allowReentry: false,
    reentryDelaySeconds: null,
    canvasViewport: { x: 0, y: 0, zoom: 1 },
    organizationId: "org-1",
    awsAccountId: null,
    topicId: null,
    maxConcurrentExecutions: 1000,
    contactCooldownSeconds: null,
    totalExecutions: 0,
    activeExecutions: 0,
    completedExecutions: 0,
    failedExecutions: 0,
    droppedExecutions: 0,
    aiGenerated: false,
    aiPrompt: null,
    defaultFrom: null,
    defaultFromName: null,
    defaultReplyTo: null,
    defaultSenderId: null,
    slug: null,
    sourceTs: null,
    sourceHash: null,
    pushedFromCli: false,
    lastPushedAt: null,
    cliProjectPath: null,
    lastEditedFrom: null,
    version: 1,
    lastTriggeredAt: null,
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    steps,
    transitions,
    ...rest,
  };
}
