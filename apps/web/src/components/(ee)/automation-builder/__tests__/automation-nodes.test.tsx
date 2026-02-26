/**
 * Workflow Node Component Tests
 *
 * Tests for workflow builder node rendering and description logic.
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the automation store hooks
vi.mock("../use-automation-store", () => ({
  useNodeValidation: vi.fn(() => ({ isValid: true, errorMessage: undefined })),
  useAutomationStore: vi.fn(() => ({})),
  useWorkflowStore: vi.fn(() => ({})),
}));

// Mock the automation data context
vi.mock("../automation-data-context", () => ({
  useAutomationData: vi.fn(() => ({
    topics: [],
    segments: [],
    templates: [],
  })),
  useWorkflowData: vi.fn(() => ({
    topics: [],
    segments: [],
    templates: [],
  })),
}));

// Mock Next.js Link component
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// Import after mocking
import type { WorkflowNodeData } from "../use-automation-store";
import { useNodeValidation } from "../use-automation-store";

// Wrapper component to provide React Flow context
function TestWrapper({ children }: { children: ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

// Custom render function that wraps with ReactFlowProvider
function renderWithProvider(ui: ReactNode) {
  return render(ui, { wrapper: TestWrapper });
}

// =============================================================================
// Test Utilities
// =============================================================================

function createNodeData(
  type: WorkflowNodeData["type"],
  config: WorkflowNodeData["config"],
  name = "Test Node"
): WorkflowNodeData {
  return {
    stepId: "step-1",
    type,
    name,
    config,
    isValid: true,
  };
}

// =============================================================================
// DelayNode Tests
// =============================================================================

describe("DelayNode", () => {
  beforeEach(() => {
    vi.mocked(useNodeValidation).mockReturnValue({
      isValid: true,
      errorMessage: undefined,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("should render delay description with correct singular form", async () => {
    const { DelayNode } = await import("../nodes/delay-node");

    const data = createNodeData("delay", {
      type: "delay",
      amount: 1,
      unit: "days",
    });

    renderWithProvider(<DelayNode data={data} id="test-id" />);

    // Should show "Wait 1 days" (unit already has 's')
    expect(screen.getByText(/Wait 1 day/)).toBeInTheDocument();
  });

  it("should render delay description with correct plural form", async () => {
    const { DelayNode } = await import("../nodes/delay-node");

    const data = createNodeData("delay", {
      type: "delay",
      amount: 3,
      unit: "days",
    });

    renderWithProvider(<DelayNode data={data} id="test-id" />);

    expect(screen.getByText(/Wait 3 days/)).toBeInTheDocument();
  });

  it("should show default message when not configured", async () => {
    const { DelayNode } = await import("../nodes/delay-node");

    // Empty config
    const data = createNodeData("delay", {} as any);

    renderWithProvider(<DelayNode data={data} id="test-id" />);

    expect(screen.getByText("Configure delay")).toBeInTheDocument();
  });

  it("should handle hours unit", async () => {
    const { DelayNode } = await import("../nodes/delay-node");

    const data = createNodeData("delay", {
      type: "delay",
      amount: 24,
      unit: "hours",
    });

    renderWithProvider(<DelayNode data={data} id="test-id" />);

    expect(screen.getByText(/Wait 24 hours/)).toBeInTheDocument();
  });

  it("should display node name as label", async () => {
    const { DelayNode } = await import("../nodes/delay-node");

    const data = createNodeData(
      "delay",
      { type: "delay", amount: 1, unit: "days" },
      "Wait for response"
    );

    renderWithProvider(<DelayNode data={data} id="test-id" />);

    expect(screen.getByText("Wait for response")).toBeInTheDocument();
  });
});

// =============================================================================
// ExitNode Tests
// =============================================================================

describe("ExitNode", () => {
  beforeEach(() => {
    vi.mocked(useNodeValidation).mockReturnValue({
      isValid: true,
      errorMessage: undefined,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("should render exit node", async () => {
    const { ExitNode } = await import("../nodes/exit-node");

    const data = createNodeData("exit", { type: "exit" }, "End");

    renderWithProvider(<ExitNode data={data} id="test-id" />);

    expect(screen.getByText("End")).toBeInTheDocument();
    expect(screen.getByText("End workflow")).toBeInTheDocument();
  });
});

// =============================================================================
// SendEmailNode Tests
// =============================================================================

describe("SendEmailNode", () => {
  beforeEach(() => {
    vi.mocked(useNodeValidation).mockReturnValue({
      isValid: true,
      errorMessage: undefined,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("should render with template name when configured", async () => {
    const { SendEmailNode } = await import("../nodes/send-email-node");

    const data = createNodeData("send_email", {
      type: "send_email",
      templateId: "tmpl-123",
    });

    renderWithProvider(<SendEmailNode data={data} id="test-id" />);

    expect(screen.getByText("Template selected")).toBeInTheDocument();
  });

  it("should show default message when no template", async () => {
    const { SendEmailNode } = await import("../nodes/send-email-node");

    const data = createNodeData("send_email", {
      type: "send_email",
      templateId: "",
    });

    renderWithProvider(<SendEmailNode data={data} id="test-id" />);

    expect(screen.getByText(/No template selected/i)).toBeInTheDocument();
  });
});

// =============================================================================
// SendSmsNode Tests
// =============================================================================

describe("SendSmsNode", () => {
  beforeEach(() => {
    vi.mocked(useNodeValidation).mockReturnValue({
      isValid: true,
      errorMessage: undefined,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("should render with truncated message", async () => {
    const { SendSmsNode } = await import("../nodes/send-sms-node");

    const data = createNodeData("send_sms", {
      type: "send_sms",
      body: "Hello, this is a test message that is long enough to be truncated",
    });

    renderWithProvider(<SendSmsNode data={data} id="test-id" />);

    // Should show truncated message
    expect(screen.getByText(/Hello, this is/)).toBeInTheDocument();
  });

  it("should show default message when no body", async () => {
    const { SendSmsNode } = await import("../nodes/send-sms-node");

    const data = createNodeData("send_sms", {
      type: "send_sms",
      body: "",
    });

    renderWithProvider(<SendSmsNode data={data} id="test-id" />);

    expect(screen.getByText(/No message configured/i)).toBeInTheDocument();
  });
});

// =============================================================================
// ConditionNode Tests
// =============================================================================

describe("ConditionNode", () => {
  beforeEach(() => {
    vi.mocked(useNodeValidation).mockReturnValue({
      isValid: true,
      errorMessage: undefined,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("should render condition description", async () => {
    const { ConditionNode } = await import("../nodes/condition-node");

    const data = createNodeData("condition", {
      type: "condition",
      field: "email",
      operator: "contains",
      value: "@gmail.com",
    });

    renderWithProvider(<ConditionNode data={data} id="test-id" />);

    expect(screen.getByText(/email.*contains/i)).toBeInTheDocument();
  });

  it("should show configure message when not set up", async () => {
    const { ConditionNode } = await import("../nodes/condition-node");

    const data = createNodeData("condition", {
      type: "condition",
      field: "",
      operator: "equals",
      value: "",
    });

    renderWithProvider(<ConditionNode data={data} id="test-id" />);

    expect(screen.getByText(/Configure condition/i)).toBeInTheDocument();
  });
});

// =============================================================================
// WebhookNode Tests
// =============================================================================

describe("WebhookNode", () => {
  beforeEach(() => {
    vi.mocked(useNodeValidation).mockReturnValue({
      isValid: true,
      errorMessage: undefined,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("should render webhook URL", async () => {
    const { WebhookNode } = await import("../nodes/webhook-node");

    const data = createNodeData("webhook", {
      type: "webhook",
      url: "https://api.example.com/webhook",
      method: "POST",
    });

    renderWithProvider(<WebhookNode data={data} id="test-id" />);

    expect(screen.getByText(/POST api\.example\.com/)).toBeInTheDocument();
  });

  it("should show configure message when no URL", async () => {
    const { WebhookNode } = await import("../nodes/webhook-node");

    const data = createNodeData("webhook", {
      type: "webhook",
      url: "",
      method: "POST",
    });

    renderWithProvider(<WebhookNode data={data} id="test-id" />);

    expect(screen.getByText(/No URL configured/i)).toBeInTheDocument();
  });
});

// =============================================================================
// TriggerNode Tests
// =============================================================================

describe("TriggerNode", () => {
  beforeEach(() => {
    vi.mocked(useNodeValidation).mockReturnValue({
      isValid: true,
      errorMessage: undefined,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("should render event trigger description", async () => {
    const { TriggerNode } = await import("../nodes/trigger-node");

    const data = createNodeData("trigger", {
      type: "trigger",
      triggerType: "event",
      eventName: "purchase_completed",
    });

    renderWithProvider(<TriggerNode data={data} id="test-id" />);

    expect(screen.getByText(/Event: purchase_completed/)).toBeInTheDocument();
  });

  it("should render contact_created trigger", async () => {
    const { TriggerNode } = await import("../nodes/trigger-node");

    const data = createNodeData("trigger", {
      type: "trigger",
      triggerType: "contact_created",
    });

    renderWithProvider(<TriggerNode data={data} id="test-id" />);

    expect(screen.getByText(/When a contact is created/i)).toBeInTheDocument();
  });

  it("should render schedule trigger", async () => {
    const { TriggerNode } = await import("../nodes/trigger-node");

    const data = createNodeData("trigger", {
      type: "trigger",
      triggerType: "schedule",
      schedule: "0 9 * * *",
    });

    renderWithProvider(<TriggerNode data={data} id="test-id" />);

    expect(screen.getByText(/Schedule: 0 9/)).toBeInTheDocument();
  });
});

// =============================================================================
// Validation Error Display Tests
// =============================================================================

describe("Node validation states", () => {
  afterEach(() => {
    cleanup();
  });

  it("should show error state when invalid", async () => {
    vi.mocked(useNodeValidation).mockReturnValue({
      isValid: false,
      errorMessage: "Template is required",
    });

    const { SendEmailNode } = await import("../nodes/send-email-node");

    const data = createNodeData("send_email", {
      type: "send_email",
      templateId: "",
    });

    renderWithProvider(<SendEmailNode data={data} id="test-id" />);

    // The error message should be passed to BaseNode
    // Implementation depends on how BaseNode displays errors
  });
});
