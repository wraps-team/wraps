import type { Automation, AutomationStatus } from "@wraps/db";

/**
 * Automation status labels for display
 */
export const AUTOMATION_STATUS_LABELS: Record<AutomationStatus, string> = {
  draft: "Draft",
  enabled: "Enabled",
  paused: "Paused",
  archived: "Archived",
};

/**
 * Automation status colors for badges
 */
export const AUTOMATION_STATUS_COLORS: Record<AutomationStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  enabled: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  archived: "bg-gray-100 text-gray-500",
};

/**
 * Get the number of steps in an automation (excluding trigger)
 */
export function getStepCount(automation: Automation): number {
  const steps = automation.steps as Array<{ type: string }>;
  return steps.filter((s) => s.type !== "trigger").length;
}

/**
 * Get a human-readable trigger description
 */
export function getTriggerDescription(automation: Automation): string {
  const triggerType = automation.triggerType;
  const config = automation.triggerConfig as Record<string, unknown> | null;

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

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARD-COMPAT ALIASES
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use AUTOMATION_STATUS_LABELS */
export const WORKFLOW_STATUS_LABELS = AUTOMATION_STATUS_LABELS;

/** @deprecated Use AUTOMATION_STATUS_COLORS */
export const WORKFLOW_STATUS_COLORS = AUTOMATION_STATUS_COLORS;
