/**
 * Workflow Properties Panel Tests
 *
 * Tests for the workflow properties panel component.
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the workflow store hooks
const mockUseSelectedNode = vi.fn();
const mockUseValidationResult = vi.fn();
const mockUseWorkflowStore = vi.fn();

vi.mock("../use-workflow-store", () => ({
  useSelectedNode: () => mockUseSelectedNode(),
  useValidationResult: () => mockUseValidationResult(),
  useWorkflowStore: (selector: (state: unknown) => unknown) =>
    mockUseWorkflowStore(selector),
}));

// Mock the useTemplates hook
vi.mock("@/hooks/use-template-queries", () => ({
  useTemplates: vi.fn(() => ({ data: [], isLoading: false })),
}));

// Mock the template editor dialog
vi.mock("@/components/template-editor/wrappers/template-editor-dialog", () => ({
  TemplateEditorDialog: () => null,
}));

// Mock the aws-accounts server actions
vi.mock("@/actions/aws-accounts", () => ({
  getVerifiedDomains: vi.fn(() =>
    Promise.resolve({ success: true, identities: [] })
  ),
}));

// Import after mocking
import { WorkflowPropertiesPanel } from "../automation-properties-panel";

// =============================================================================
// Empty State Tests
// =============================================================================

describe("WorkflowPropertiesPanel", () => {
  beforeEach(() => {
    // Default to no node selected
    mockUseSelectedNode.mockReturnValue(null);
    mockUseValidationResult.mockReturnValue({
      errors: [],
      errorsByNodeId: new Map(),
    });
    mockUseWorkflowStore.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("should render empty state when no node is selected", () => {
    render(
      <WorkflowPropertiesPanel orgSlug="test-org" segments={[]} topics={[]} />
    );

    expect(screen.getByText("Select a node to configure")).toBeInTheDocument();
  });

  it("should show settings icon in empty state", () => {
    render(
      <WorkflowPropertiesPanel orgSlug="test-org" segments={[]} topics={[]} />
    );

    // The component has an SVG with the Settings icon
    const container = screen
      .getByText("Select a node to configure")
      .closest("div");
    expect(container?.querySelector("svg")).toBeInTheDocument();
  });
});

// =============================================================================
// Selected Node Tests
// =============================================================================

describe("WorkflowPropertiesPanel with selected node", () => {
  beforeEach(() => {
    mockUseValidationResult.mockReturnValue({
      errors: [],
      errorsByNodeId: new Map(),
    });
    mockUseWorkflowStore.mockImplementation(
      (_selector: (state: unknown) => unknown) => {
        // Return mock functions for store selectors
        return vi.fn();
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("should render Properties header when node is selected", () => {
    mockUseSelectedNode.mockReturnValue({
      id: "node-1",
      data: {
        stepId: "step-1",
        type: "delay",
        name: "Wait 1 day",
        config: { type: "delay", amount: 1, unit: "days" },
        isValid: true,
      },
    });

    render(
      <WorkflowPropertiesPanel orgSlug="test-org" segments={[]} topics={[]} />
    );

    expect(screen.getByText("Properties")).toBeInTheDocument();
  });

  it("should render Name input when node is selected", () => {
    mockUseSelectedNode.mockReturnValue({
      id: "node-1",
      data: {
        stepId: "step-1",
        type: "delay",
        name: "Wait 1 day",
        config: { type: "delay", amount: 1, unit: "days" },
        isValid: true,
      },
    });

    render(
      <WorkflowPropertiesPanel orgSlug="test-org" segments={[]} topics={[]} />
    );

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Wait 1 day")).toBeInTheDocument();
  });

  it("should show delete button for non-trigger nodes", () => {
    mockUseSelectedNode.mockReturnValue({
      id: "node-1",
      data: {
        stepId: "step-1",
        type: "delay",
        name: "Wait 1 day",
        config: { type: "delay", amount: 1, unit: "days" },
        isValid: true,
      },
    });

    render(
      <WorkflowPropertiesPanel orgSlug="test-org" segments={[]} topics={[]} />
    );

    expect(screen.getByText("Delete Node")).toBeInTheDocument();
  });

  it("should NOT show delete button for trigger nodes", () => {
    mockUseSelectedNode.mockReturnValue({
      id: "node-1",
      data: {
        stepId: "step-1",
        type: "trigger",
        name: "Start",
        config: { type: "trigger", triggerType: "contact_created" },
        isValid: true,
      },
    });

    render(
      <WorkflowPropertiesPanel orgSlug="test-org" segments={[]} topics={[]} />
    );

    expect(screen.queryByText("Delete Node")).not.toBeInTheDocument();
  });
});

// =============================================================================
// Validation Error Tests
// =============================================================================

describe("WorkflowPropertiesPanel validation errors", () => {
  beforeEach(() => {
    mockUseWorkflowStore.mockImplementation(() => vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("should show existing from address when no verified domains exist", () => {
    const mockState = {
      selectNode: vi.fn(),
      updateNodeConfig: vi.fn(),
      updateNodeName: vi.fn(),
      deleteNode: vi.fn(),
      workflow: null, // no awsAccountId → skips domain fetch
    };
    mockUseWorkflowStore.mockImplementation(
      (selector: (state: typeof mockState) => unknown) => selector(mockState)
    );

    mockUseSelectedNode.mockReturnValue({
      id: "node-1",
      data: {
        stepId: "step-1",
        type: "send_email",
        name: "Send Email",
        config: {
          type: "send_email",
          templateId: "tpl-1",
          from: "hello@financeforge.com",
        },
        isValid: true,
      },
    });

    mockUseValidationResult.mockReturnValue({
      errors: [],
      errorsByNodeId: new Map(),
    });

    render(
      <WorkflowPropertiesPanel orgSlug="test-org" segments={[]} topics={[]} />
    );

    // The from address should be visible even with no verified domains
    expect(
      screen.getByDisplayValue("hello@financeforge.com")
    ).toBeInTheDocument();
  });

  it("should show unverified domain warning when domain list is empty", () => {
    const mockState = {
      selectNode: vi.fn(),
      updateNodeConfig: vi.fn(),
      updateNodeName: vi.fn(),
      deleteNode: vi.fn(),
      workflow: null,
    };
    mockUseWorkflowStore.mockImplementation(
      (selector: (state: typeof mockState) => unknown) => selector(mockState)
    );

    mockUseSelectedNode.mockReturnValue({
      id: "node-1",
      data: {
        stepId: "step-1",
        type: "send_email",
        name: "Send Email",
        config: {
          type: "send_email",
          templateId: "tpl-1",
          from: "hello@financeforge.com",
        },
        isValid: true,
      },
    });

    mockUseValidationResult.mockReturnValue({
      errors: [],
      errorsByNodeId: new Map(),
    });

    render(
      <WorkflowPropertiesPanel orgSlug="test-org" segments={[]} topics={[]} />
    );

    expect(
      screen.getByText(/financeforge\.com.+is not verified/i)
    ).toBeInTheDocument();
  });

  it("should show 'No verified domains' when from is empty and no domains", () => {
    const mockState = {
      selectNode: vi.fn(),
      updateNodeConfig: vi.fn(),
      updateNodeName: vi.fn(),
      deleteNode: vi.fn(),
      workflow: null,
    };
    mockUseWorkflowStore.mockImplementation(
      (selector: (state: typeof mockState) => unknown) => selector(mockState)
    );

    mockUseSelectedNode.mockReturnValue({
      id: "node-1",
      data: {
        stepId: "step-1",
        type: "send_email",
        name: "Send Email",
        config: {
          type: "send_email",
          templateId: "tpl-1",
        },
        isValid: true,
      },
    });

    mockUseValidationResult.mockReturnValue({
      errors: [],
      errorsByNodeId: new Map(),
    });

    render(
      <WorkflowPropertiesPanel orgSlug="test-org" segments={[]} topics={[]} />
    );

    expect(screen.getByText(/No verified domains/i)).toBeInTheDocument();
  });

  it("should show validation errors when present", () => {
    const errorsByNodeId = new Map();
    errorsByNodeId.set("node-1", [
      { message: "Template is required", severity: "error" },
    ]);

    mockUseSelectedNode.mockReturnValue({
      id: "node-1",
      data: {
        stepId: "step-1",
        type: "send_email",
        name: "Send Email",
        config: { type: "send_email", templateId: "" },
        isValid: false,
      },
    });

    mockUseValidationResult.mockReturnValue({
      errors: [{ message: "Template is required", severity: "error" }],
      errorsByNodeId,
    });

    render(
      <WorkflowPropertiesPanel orgSlug="test-org" segments={[]} topics={[]} />
    );

    expect(screen.getByText("• Template is required")).toBeInTheDocument();
  });
});
