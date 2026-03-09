import type {
  Workflow,
  WorkflowExecutionStatus,
  WorkflowStatus,
  WorkflowStepExecutionStatus,
} from "@wraps/db";

/**
 * Workflow status labels for display
 */
export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: "Draft",
  enabled: "Enabled",
  paused: "Paused",
  archived: "Archived",
};

/**
 * Workflow status colors for badges
 */
export const WORKFLOW_STATUS_COLORS: Record<WorkflowStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  enabled: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  archived: "bg-gray-100 text-gray-500",
};

export const EXECUTION_STATUS_LABELS: Record<WorkflowExecutionStatus, string> =
  {
    pending: "Pending",
    active: "Active",
    paused: "Paused",
    waiting: "Waiting",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  };

export const EXECUTION_STATUS_COLORS: Record<WorkflowExecutionStatus, string> =
  {
    pending: "bg-gray-100 text-gray-700",
    active: "bg-blue-100 text-blue-700",
    paused: "bg-yellow-100 text-yellow-700",
    waiting: "bg-purple-100 text-purple-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-500",
  };

export const STEP_STATUS_LABELS: Record<WorkflowStepExecutionStatus, string> = {
  pending: "Pending",
  executing: "Executing",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

export const STEP_STATUS_COLORS: Record<WorkflowStepExecutionStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  executing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
};

/**
 * Get the number of steps in a workflow (excluding trigger)
 */
export function getStepCount(workflow: Workflow): number {
  const steps = workflow.steps as Array<{ type: string }>;
  return steps.filter((s) => s.type !== "trigger").length;
}

/**
 * Get a human-readable trigger description
 */
export function getTriggerDescription(workflow: Workflow): string {
  const triggerType = workflow.triggerType;
  const config = workflow.triggerConfig as Record<string, unknown> | null;

  switch (triggerType) {
    case "contact_created":
      return "When contact is created";
    case "contact_updated":
      return "When contact is updated";
    case "event":
      return config?.eventName
        ? `When "${config.eventName}" occurs`
        : "Custom event (not configured)";
    case "segment_entry":
      return "When contact enters segment";
    case "segment_exit":
      return "When contact exits segment";
    case "schedule":
      return config?.schedule
        ? `On schedule: ${config.schedule}`
        : "Scheduled (not configured)";
    case "api":
      return "Manual API trigger";
    case "topic_subscribed":
      return config?.topicName
        ? `When subscribed to "${config.topicName}"`
        : "When subscribed to topic";
    case "topic_unsubscribed":
      return config?.topicName
        ? `When unsubscribed from "${config.topicName}"`
        : "When unsubscribed from topic";
    default:
      return "Unknown trigger";
  }
}
