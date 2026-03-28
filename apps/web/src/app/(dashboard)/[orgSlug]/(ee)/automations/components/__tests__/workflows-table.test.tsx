/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowWithMeta } from "@/actions/workflows";

const {
  mockDeleteWorkflow,
  mockDisableWorkflow,
  mockDuplicateWorkflow,
  mockEnableWorkflow,
  mockPush,
  mockRefresh,
} = vi.hoisted(() => ({
  mockDeleteWorkflow: vi.fn(),
  mockDisableWorkflow: vi.fn(),
  mockDuplicateWorkflow: vi.fn(),
  mockEnableWorkflow: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/actions/workflows", () => ({
  deleteWorkflow: mockDeleteWorkflow,
  disableWorkflow: mockDisableWorkflow,
  duplicateWorkflow: mockDuplicateWorkflow,
  enableWorkflow: mockEnableWorkflow,
}));

vi.mock("../create-workflow-dialog", () => ({
  CreateWorkflowDialog: () => null,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({
    children,
  }: {
    children: ReactElement;
    asChild?: boolean;
  }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    className,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  }) => (
    <button
      className={className}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

import { WorkflowsTable } from "../workflows-table";

function buildWorkflow(
  overrides: Partial<WorkflowWithMeta> = {}
): WorkflowWithMeta {
  const now = new Date("2026-03-28T10:00:00Z");

  return {
    id: "workflow-1",
    organizationId: "org-1",
    awsAccountId: null,
    name: "Order follow-up",
    description: "Send a reminder when a contact is created",
    topicId: null,
    canvasViewport: { x: 0, y: 0, zoom: 1 } as WorkflowWithMeta["canvasViewport"],
    status: "enabled",
    triggerType: "contact_created",
    triggerConfig: {} as WorkflowWithMeta["triggerConfig"],
    steps: [
      { id: "trigger-1", type: "trigger" },
      { id: "step-1", type: "wait" },
    ] as unknown as WorkflowWithMeta["steps"],
    transitions: [] as WorkflowWithMeta["transitions"],
    version: 1,
    allowReentry: false,
    reentryDelaySeconds: null,
    maxConcurrentExecutions: 1000,
    contactCooldownSeconds: null,
    totalExecutions: 42,
    activeExecutions: 2,
    completedExecutions: 35,
    failedExecutions: 1,
    droppedExecutions: 0,
    aiGenerated: false,
    aiPrompt: null,
    slug: null,
    sourceTs: null,
    sourceHash: null,
    pushedFromCli: false,
    lastPushedAt: null,
    cliProjectPath: null,
    lastEditedFrom: null,
    defaultFrom: null,
    defaultFromName: null,
    defaultReplyTo: null,
    defaultSenderId: null,
    lastTriggeredAt: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    createdByUser: null,
    ...overrides,
  };
}

describe("WorkflowsTable", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("navigates to executions when a workflow row is clicked", async () => {
    const user = userEvent.setup();

    render(
      <WorkflowsTable
        organizationId="org-1"
        orgSlug="acme"
        total={1}
        userRole="owner"
        workflows={[buildWorkflow()]}
      />
    );

    await user.click(screen.getByText("Order follow-up"));

    expect(mockPush.mock.calls).toEqual([
      ["/acme/automations/workflow-1/executions"],
    ]);
  });

  it("does not trigger row navigation when opening the actions menu", async () => {
    const user = userEvent.setup();

    render(
      <WorkflowsTable
        organizationId="org-1"
        orgSlug="acme"
        total={1}
        userRole="owner"
        workflows={[buildWorkflow()]}
      />
    );

    await user.click(screen.getByRole("button", { name: /open menu/i }));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates to the workflow editor from the actions menu without bubbling to the row", async () => {
    const user = userEvent.setup();

    render(
      <WorkflowsTable
        organizationId="org-1"
        orgSlug="acme"
        total={1}
        userRole="owner"
        workflows={[buildWorkflow()]}
      />
    );

    await user.click(screen.getByRole("button", { name: /edit workflow/i }));

    expect(mockPush.mock.calls).toEqual([["/acme/automations/workflow-1"]]);
  });

  it("navigates to executions from the actions menu with a single push", async () => {
    const user = userEvent.setup();

    render(
      <WorkflowsTable
        organizationId="org-1"
        orgSlug="acme"
        total={1}
        userRole="owner"
        workflows={[buildWorkflow()]}
      />
    );

    await user.click(screen.getByRole("button", { name: /view executions/i }));

    expect(mockPush.mock.calls).toEqual([
      ["/acme/automations/workflow-1/executions"],
    ]);
  });
});
