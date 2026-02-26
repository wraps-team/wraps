import type {
  Automation,
  AutomationStep,
  AutomationTransition,
} from "@wraps/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAutomationStore } from "../use-automation-store";

// Mock crypto.randomUUID for deterministic IDs
let uuidCounter = 0;
vi.stubGlobal("crypto", {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

describe("useAutomationStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useAutomationStore.setState({
      automation: null,
      isDirty: false,
      isSaving: false,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      validationResult: null,
    });
    uuidCounter = 0;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIAL STATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const state = useAutomationStore.getState();

      expect(state.automation).toBeNull();
      expect(state.isDirty).toBe(false);
      expect(state.isSaving).toBe(false);
      expect(state.nodes).toEqual([]);
      expect(state.edges).toEqual([]);
      expect(state.selectedNodeId).toBeNull();
      expect(state.validationResult).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // setAutomation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("setAutomation", () => {
    it("should convert steps to nodes and transitions to edges", () => {
      const mockWorkflow = createMockAutomation({
        steps: [
          {
            id: "step-1",
            type: "trigger",
            name: "Start",
            position: { x: 100, y: 100 },
            config: {
              type: "trigger",
              triggerType: "event",
              eventName: "signup",
            },
          },
          {
            id: "step-2",
            type: "send_email",
            name: "Welcome Email",
            position: { x: 100, y: 250 },
            config: { type: "send_email", templateId: "tmpl-1" },
          },
        ],
        transitions: [
          {
            id: "trans-1",
            fromStepId: "step-1",
            toStepId: "step-2",
          },
        ],
      });

      useAutomationStore.getState().setAutomation(mockWorkflow);
      const state = useAutomationStore.getState();

      // Check nodes
      expect(state.nodes).toHaveLength(2);
      expect(state.nodes[0]).toMatchObject({
        id: "step-1",
        type: "trigger",
        position: { x: 100, y: 100 },
        data: {
          stepId: "step-1",
          type: "trigger",
          name: "Start",
          config: {
            type: "trigger",
            triggerType: "event",
            eventName: "signup",
          },
          isValid: true,
        },
      });

      // Check edges
      expect(state.edges).toHaveLength(1);
      expect(state.edges[0]).toMatchObject({
        id: "trans-1",
        source: "step-1",
        target: "step-2",
      });

      // Check state flags
      expect(state.isDirty).toBe(false);
      expect(state.selectedNodeId).toBeNull();
    });

    it("should handle transitions with branch conditions", () => {
      const mockWorkflow = createMockAutomation({
        steps: [
          {
            id: "cond-1",
            type: "condition",
            name: "Check Field",
            position: { x: 0, y: 0 },
            config: {
              type: "condition",
              field: "email",
              operator: "contains",
              value: "@gmail.com",
            },
          },
          {
            id: "step-yes",
            type: "send_email",
            name: "Gmail User",
            position: { x: -100, y: 150 },
            config: { type: "send_email", templateId: "tmpl-gmail" },
          },
          {
            id: "step-no",
            type: "send_email",
            name: "Other User",
            position: { x: 100, y: 150 },
            config: { type: "send_email", templateId: "tmpl-other" },
          },
        ],
        transitions: [
          {
            id: "trans-yes",
            fromStepId: "cond-1",
            toStepId: "step-yes",
            condition: { branch: "yes" },
          },
          {
            id: "trans-no",
            fromStepId: "cond-1",
            toStepId: "step-no",
            condition: { branch: "no" },
          },
        ],
      });

      useAutomationStore.getState().setAutomation(mockWorkflow);
      const state = useAutomationStore.getState();

      expect(state.edges).toHaveLength(2);
      expect(state.edges[0]).toMatchObject({
        sourceHandle: "yes",
        data: { label: "yes" },
      });
      expect(state.edges[1]).toMatchObject({
        sourceHandle: "no",
        data: { label: "no" },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // addNode
  // ═══════════════════════════════════════════════════════════════════════════

  describe("addNode", () => {
    it("should add a trigger node with default config", () => {
      const id = useAutomationStore
        .getState()
        .addNode("trigger", { x: 100, y: 100 });
      const state = useAutomationStore.getState();

      expect(id).toBe("test-uuid-1");
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0]).toMatchObject({
        id: "test-uuid-1",
        type: "trigger",
        position: { x: 100, y: 100 },
        data: {
          stepId: "test-uuid-1",
          type: "trigger",
          name: "Trigger",
          config: { type: "trigger", triggerType: "event" },
          isValid: true,
        },
      });
      expect(state.isDirty).toBe(true);
      expect(state.selectedNodeId).toBe("test-uuid-1");
    });

    it("should add a send_email node with default config", () => {
      useAutomationStore.getState().addNode("send_email", { x: 200, y: 200 });
      const state = useAutomationStore.getState();

      expect(state.nodes[0].data.config).toEqual({
        type: "send_email",
        templateId: "",
      });
      expect(state.nodes[0].data.name).toBe("Send Email");
    });

    it("should add a delay node with default config", () => {
      useAutomationStore.getState().addNode("delay", { x: 0, y: 0 });
      const state = useAutomationStore.getState();

      expect(state.nodes[0].data.config).toEqual({
        type: "delay",
        amount: 1,
        unit: "days",
      });
      expect(state.nodes[0].data.name).toBe("Delay");
    });

    it("should add a condition node with default config", () => {
      useAutomationStore.getState().addNode("condition", { x: 0, y: 0 });
      const state = useAutomationStore.getState();

      expect(state.nodes[0].data.config).toEqual({
        type: "condition",
        field: "",
        operator: "equals",
        value: "",
      });
    });

    it("should add a webhook node with default config", () => {
      useAutomationStore.getState().addNode("webhook", { x: 0, y: 0 });
      const state = useAutomationStore.getState();

      expect(state.nodes[0].data.config).toEqual({
        type: "webhook",
        url: "",
        method: "POST",
      });
    });

    it("should add a wait_for_event node with default config", () => {
      useAutomationStore.getState().addNode("wait_for_event", { x: 0, y: 0 });
      const state = useAutomationStore.getState();

      expect(state.nodes[0].data.config).toEqual({
        type: "wait_for_event",
        eventName: "",
      });
    });

    it("should add a wait_for_email_engagement node with default timeout", () => {
      useAutomationStore
        .getState()
        .addNode("wait_for_email_engagement", { x: 0, y: 0 });
      const state = useAutomationStore.getState();

      expect(state.nodes[0].data.config).toEqual({
        type: "wait_for_email_engagement",
        timeoutSeconds: 259_200, // 3 days
      });
    });

    it("should add topic nodes with default config", () => {
      useAutomationStore.getState().addNode("subscribe_topic", { x: 0, y: 0 });
      let state = useAutomationStore.getState();

      expect(state.nodes[0].data.config).toEqual({
        type: "subscribe_topic",
        topicId: "",
        channel: "email",
      });

      useAutomationStore
        .getState()
        .addNode("unsubscribe_topic", { x: 100, y: 0 });
      state = useAutomationStore.getState();

      expect(state.nodes[1].data.config).toEqual({
        type: "unsubscribe_topic",
        topicId: "",
        channel: "email",
      });
    });

    it("should merge custom config with defaults", () => {
      useAutomationStore.getState().addNode(
        "send_email",
        { x: 0, y: 0 },
        {
          type: "send_email",
          templateId: "tmpl-custom",
        }
      );
      const state = useAutomationStore.getState();

      expect(state.nodes[0].data.config).toEqual({
        type: "send_email",
        templateId: "tmpl-custom",
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateNodeConfig
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateNodeConfig", () => {
    it("should update node config and mark dirty", () => {
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 0 });
      useAutomationStore.setState({ isDirty: false });

      useAutomationStore.getState().updateNodeConfig("test-uuid-1", {
        templateId: "tmpl-updated",
      });

      const state = useAutomationStore.getState();
      expect(state.nodes[0].data.config).toEqual({
        type: "send_email",
        templateId: "tmpl-updated",
      });
      expect(state.isDirty).toBe(true);
    });

    it("should only update the specified node", () => {
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 0 });
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 150 });

      useAutomationStore.getState().updateNodeConfig("test-uuid-1", {
        templateId: "first",
      });

      const state = useAutomationStore.getState();
      const config0 = state.nodes[0].data.config;
      const config1 = state.nodes[1].data.config;
      expect(config0.type === "send_email" && config0.templateId).toBe("first");
      expect(config1.type === "send_email" && config1.templateId).toBe("");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateNodeName
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateNodeName", () => {
    it("should update node name and mark dirty", () => {
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 0 });
      useAutomationStore.setState({ isDirty: false });

      useAutomationStore
        .getState()
        .updateNodeName("test-uuid-1", "Welcome Email");

      const state = useAutomationStore.getState();
      expect(state.nodes[0].data.name).toBe("Welcome Email");
      expect(state.isDirty).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteNode
  // ═══════════════════════════════════════════════════════════════════════════

  describe("deleteNode", () => {
    it("should remove node and connected edges", () => {
      // Add two nodes
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 150 });

      // Add edge between them
      useAutomationStore.getState().onConnect({
        source: "test-uuid-1",
        target: "test-uuid-2",
        sourceHandle: null,
        targetHandle: null,
      });

      // Delete the trigger node
      useAutomationStore.getState().deleteNode("test-uuid-1");

      const state = useAutomationStore.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0].id).toBe("test-uuid-2");
      expect(state.edges).toHaveLength(0);
    });

    it("should clear selectedNodeId if deleted node was selected", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      expect(useAutomationStore.getState().selectedNodeId).toBe("test-uuid-1");

      useAutomationStore.getState().deleteNode("test-uuid-1");

      expect(useAutomationStore.getState().selectedNodeId).toBeNull();
    });

    it("should preserve selectedNodeId if different node is deleted", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 150 });
      // First node is auto-selected, then second node becomes selected
      useAutomationStore.getState().selectNode("test-uuid-1");

      useAutomationStore.getState().deleteNode("test-uuid-2");

      expect(useAutomationStore.getState().selectedNodeId).toBe("test-uuid-1");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // onConnect
  // ═══════════════════════════════════════════════════════════════════════════

  describe("onConnect", () => {
    it("should add edge and mark dirty", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 150 });
      useAutomationStore.setState({ isDirty: false });

      useAutomationStore.getState().onConnect({
        source: "test-uuid-1",
        target: "test-uuid-2",
        sourceHandle: null,
        targetHandle: null,
      });

      const state = useAutomationStore.getState();
      expect(state.edges).toHaveLength(1);
      expect(state.edges[0]).toMatchObject({
        source: "test-uuid-1",
        target: "test-uuid-2",
      });
      expect(state.isDirty).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // selectNode
  // ═══════════════════════════════════════════════════════════════════════════

  describe("selectNode", () => {
    it("should update selectedNodeId", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.getState().selectNode("some-other-id");

      expect(useAutomationStore.getState().selectedNodeId).toBe(
        "some-other-id"
      );
    });

    it("should allow clearing selection with null", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.getState().selectNode(null);

      expect(useAutomationStore.getState().selectedNodeId).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateWorkflowSettings
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateAutomationSettings", () => {
    it("should update workflow metadata and mark dirty", () => {
      const mockWorkflow = createMockAutomation({ steps: [], transitions: [] });
      useAutomationStore.getState().setAutomation(mockWorkflow);

      useAutomationStore.getState().updateWorkflowSettings({
        name: "Updated Name",
        description: "Updated description",
      });

      const state = useAutomationStore.getState();
      expect(state.automation?.name).toBe("Updated Name");
      expect(state.automation?.description).toBe("Updated description");
      expect(state.isDirty).toBe(true);
    });

    it("should update trigger type and config", () => {
      const mockWorkflow = createMockAutomation({ steps: [], transitions: [] });
      useAutomationStore.getState().setAutomation(mockWorkflow);

      useAutomationStore.getState().updateWorkflowSettings({
        triggerType: "segment_entry",
        triggerConfig: { segmentId: "seg-123" },
      });

      const state = useAutomationStore.getState();
      expect(state.automation?.triggerType).toBe("segment_entry");
      expect(state.automation?.triggerConfig).toEqual({ segmentId: "seg-123" });
    });

    it("should not modify state if workflow is null", () => {
      useAutomationStore.getState().updateWorkflowSettings({ name: "Test" });

      const state = useAutomationStore.getState();
      expect(state.automation).toBeNull();
      expect(state.isDirty).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getWorkflowDefinition
  // ═══════════════════════════════════════════════════════════════════════════

  describe("getWorkflowDefinition", () => {
    it("should convert nodes back to steps", () => {
      useAutomationStore.getState().addNode("trigger", { x: 100, y: 100 });
      useAutomationStore
        .getState()
        .updateNodeName("test-uuid-1", "Entry Point");

      const definition = useAutomationStore.getState().getWorkflowDefinition();

      expect(definition.steps).toHaveLength(1);
      expect(definition.steps[0]).toEqual({
        id: "test-uuid-1",
        type: "trigger",
        name: "Entry Point",
        position: { x: 100, y: 100 },
        config: { type: "trigger", triggerType: "event" },
      });
    });

    it("should convert edges back to transitions", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 150 });
      useAutomationStore.getState().onConnect({
        source: "test-uuid-1",
        target: "test-uuid-2",
        sourceHandle: null,
        targetHandle: null,
      });

      const definition = useAutomationStore.getState().getWorkflowDefinition();

      expect(definition.transitions).toHaveLength(1);
      expect(definition.transitions[0]).toMatchObject({
        fromStepId: "test-uuid-1",
        toStepId: "test-uuid-2",
      });
    });

    it("should include branch condition from sourceHandle", () => {
      useAutomationStore.getState().addNode("condition", { x: 0, y: 0 });
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 150 });

      // Manually add edge with sourceHandle (simulating React Flow)
      useAutomationStore.setState((_state) => ({
        edges: [
          {
            id: "edge-1",
            source: "test-uuid-1",
            target: "test-uuid-2",
            sourceHandle: "yes",
          },
        ],
      }));

      const definition = useAutomationStore.getState().getWorkflowDefinition();

      expect(definition.transitions[0].condition).toEqual({ branch: "yes" });
    });

    it("should include default canvas viewport", () => {
      const definition = useAutomationStore.getState().getWorkflowDefinition();

      expect(definition.canvasViewport).toEqual({ x: 0, y: 0, zoom: 1 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // canvasViewport tracking
  // ═══════════════════════════════════════════════════════════════════════════

  describe("canvasViewport", () => {
    it("should have default viewport of {0, 0, 1}", () => {
      const state = useAutomationStore.getState();
      expect(state.canvasViewport).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it("should update viewport with setCanvasViewport", () => {
      useAutomationStore
        .getState()
        .setCanvasViewport({ x: 100, y: -50, zoom: 1.5 });
      const state = useAutomationStore.getState();

      expect(state.canvasViewport).toEqual({ x: 100, y: -50, zoom: 1.5 });
    });

    it("should initialize viewport from saved workflow data", () => {
      const mockWorkflow = createMockAutomation({
        steps: [],
        transitions: [],
        canvasViewport: { x: 200, y: 300, zoom: 0.8 },
      });

      useAutomationStore.getState().setAutomation(mockWorkflow);
      const state = useAutomationStore.getState();

      expect(state.canvasViewport).toEqual({ x: 200, y: 300, zoom: 0.8 });
    });

    it("should use default viewport when workflow has null canvasViewport", () => {
      const mockWorkflow = createMockAutomation({
        steps: [],
        transitions: [],
        canvasViewport: null as unknown as {
          x: number;
          y: number;
          zoom: number;
        },
      });

      useAutomationStore.getState().setAutomation(mockWorkflow);
      const state = useAutomationStore.getState();

      expect(state.canvasViewport).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it("should return tracked viewport from getWorkflowDefinition", () => {
      useAutomationStore
        .getState()
        .setCanvasViewport({ x: 42, y: -10, zoom: 2 });
      const definition = useAutomationStore.getState().getWorkflowDefinition();

      expect(definition.canvasViewport).toEqual({ x: 42, y: -10, zoom: 2 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Dirty state tracking
  // ═══════════════════════════════════════════════════════════════════════════

  describe("dirty state tracking", () => {
    it("should mark dirty when nodes change", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      expect(useAutomationStore.getState().isDirty).toBe(true);
    });

    it("should mark dirty when edges change", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 150 });
      useAutomationStore.setState({ isDirty: false });

      useAutomationStore.getState().onConnect({
        source: "test-uuid-1",
        target: "test-uuid-2",
        sourceHandle: null,
        targetHandle: null,
      });

      expect(useAutomationStore.getState().isDirty).toBe(true);
    });

    it("should clear dirty flag with markClean", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      expect(useAutomationStore.getState().isDirty).toBe(true);

      useAutomationStore.getState().markClean();
      expect(useAutomationStore.getState().isDirty).toBe(false);
    });

    it("should not mark dirty when loading workflow", () => {
      const mockWorkflow = createMockAutomation({ steps: [], transitions: [] });
      useAutomationStore.getState().setAutomation(mockWorkflow);

      expect(useAutomationStore.getState().isDirty).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateWorkflowAfterSave
  // ═══════════════════════════════════════════════════════════════════════════

  describe("updateAutomationAfterSave", () => {
    it("should update workflow metadata without marking dirty", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.setState({ isDirty: true });

      const updatedWorkflow = createMockAutomation({
        steps: [],
        transitions: [],
        name: "Saved Workflow",
      });

      useAutomationStore.getState().updateWorkflowAfterSave(updatedWorkflow);

      const state = useAutomationStore.getState();
      expect(state.automation?.name).toBe("Saved Workflow");
      expect(state.isDirty).toBe(false);
    });

    it("should preserve existing nodes/edges", () => {
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 150 });

      const updatedWorkflow = createMockAutomation({
        steps: [], // Different from current nodes
        transitions: [],
      });

      useAutomationStore.getState().updateWorkflowAfterSave(updatedWorkflow);

      const state = useAutomationStore.getState();
      // Nodes should not be replaced
      expect(state.nodes).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // runValidation
  // ═══════════════════════════════════════════════════════════════════════════

  describe("runValidation", () => {
    it("should run validation and store result", () => {
      // Empty workflow - should fail (no trigger)
      const result = useAutomationStore.getState().runValidation();

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(useAutomationStore.getState().validationResult).toBe(result);
    });

    it("should return valid for properly configured workflow", () => {
      // Add trigger with valid config
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.getState().updateNodeConfig("test-uuid-1", {
        type: "trigger",
        triggerType: "event",
        eventName: "signup",
      });

      // Add action step
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 150 });
      useAutomationStore.getState().updateNodeConfig("test-uuid-2", {
        type: "send_email",
        templateId: "tmpl-123",
      });

      // Connect them
      useAutomationStore.getState().onConnect({
        source: "test-uuid-1",
        target: "test-uuid-2",
        sourceHandle: null,
        targetHandle: null,
      });

      const result = useAutomationStore.getState().runValidation();

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should group errors by nodeId", () => {
      // Add trigger with missing config
      useAutomationStore.getState().addNode("trigger", { x: 0, y: 0 });
      useAutomationStore.getState().updateNodeConfig("test-uuid-1", {
        type: "trigger",
        triggerType: "event",
        // Missing eventName
      });

      // Add send_email with missing templateId
      useAutomationStore.getState().addNode("send_email", { x: 0, y: 150 });
      // templateId is already empty by default

      // Connect them
      useAutomationStore.getState().onConnect({
        source: "test-uuid-1",
        target: "test-uuid-2",
        sourceHandle: null,
        targetHandle: null,
      });

      const result = useAutomationStore.getState().runValidation();

      expect(result.errorsByNodeId.has("test-uuid-1")).toBe(true);
      expect(result.errorsByNodeId.has("test-uuid-2")).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Saving state
  // ═══════════════════════════════════════════════════════════════════════════

  describe("saving state", () => {
    it("should track saving state with setIsSaving", () => {
      expect(useAutomationStore.getState().isSaving).toBe(false);

      useAutomationStore.getState().setIsSaving(true);
      expect(useAutomationStore.getState().isSaving).toBe(true);

      useAutomationStore.getState().setIsSaving(false);
      expect(useAutomationStore.getState().isSaving).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function createMockAutomation(
  overrides: Partial<Automation> & {
    steps: AutomationStep[];
    transitions: AutomationTransition[];
  }
): Automation {
  const { steps, transitions, ...rest } = overrides;
  return {
    id: "wf-1",
    name: "Test Automation",
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
