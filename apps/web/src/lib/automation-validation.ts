import type {
  AutomationStep,
  AutomationStepConfig,
  AutomationTransition,
  CascadeChannelConfig,
} from "@wraps/db";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ValidationError = {
  nodeId?: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
};

export type ValidationResult = {
  isValid: boolean;
  errors: ValidationError[];
  errorsByNodeId: Map<string, ValidationError[]>;
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function validateAutomation(
  steps: AutomationStep[],
  transitions: AutomationTransition[]
): ValidationResult {
  const errors: ValidationError[] = [];

  // Structure validation
  errors.push(...validateStructure(steps, transitions));

  // Step-specific validation
  for (const step of steps) {
    errors.push(...validateStep(step));
  }

  // Group errors by nodeId
  const errorsByNodeId = new Map<string, ValidationError[]>();
  for (const error of errors) {
    if (error.nodeId) {
      const existing = errorsByNodeId.get(error.nodeId) || [];
      existing.push(error);
      errorsByNodeId.set(error.nodeId, existing);
    }
  }

  return {
    isValid: errors.filter((e) => e.severity === "error").length === 0,
    errors,
    errorsByNodeId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

function validateStructure(
  steps: AutomationStep[],
  transitions: AutomationTransition[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for trigger node
  const triggerSteps = steps.filter((s) => s.type === "trigger");
  if (triggerSteps.length === 0) {
    errors.push({
      message: "Automation must have a trigger node",
      severity: "error",
    });
  } else if (triggerSteps.length > 1) {
    errors.push({
      message: "Automation can only have one trigger node",
      severity: "error",
    });
  }

  // Check for at least one action step (not trigger, not exit)
  const actionSteps = steps.filter(
    (s) => s.type !== "trigger" && s.type !== "exit"
  );
  if (actionSteps.length === 0 && steps.length > 1) {
    errors.push({
      message: "Automation must have at least one action step",
      severity: "error",
    });
  }

  // Check for orphan nodes (not reachable from trigger)
  if (triggerSteps.length === 1) {
    const reachableIds = getReachableNodeIds(triggerSteps[0].id, transitions);
    const orphanSteps = steps.filter(
      (s) => s.type !== "trigger" && !reachableIds.has(s.id)
    );
    for (const orphan of orphanSteps) {
      errors.push({
        nodeId: orphan.id,
        message: `"${orphan.name}" is not connected to the automation`,
        severity: "warning",
      });
    }
  }

  // Check for invalid transition references
  const stepIds = new Set(steps.map((s) => s.id));
  for (const transition of transitions) {
    if (!stepIds.has(transition.fromStepId)) {
      errors.push({
        message: "Transition references non-existent source step",
        severity: "error",
      });
    }
    if (!stepIds.has(transition.toStepId)) {
      errors.push({
        message: "Transition references non-existent target step",
        severity: "error",
      });
    }
  }

  return errors;
}

function getReachableNodeIds(
  startId: string,
  transitions: AutomationTransition[]
): Set<string> {
  const reachable = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (reachable.has(currentId)) {
      continue;
    }
    reachable.add(currentId);

    // Find all nodes this one connects to
    const outgoing = transitions.filter((t) => t.fromStepId === currentId);
    for (const t of outgoing) {
      if (!reachable.has(t.toStepId)) {
        queue.push(t.toStepId);
      }
    }
  }

  return reachable;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP-SPECIFIC VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

function validateStep(step: AutomationStep): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = step.config;

  switch (config.type) {
    case "trigger":
      errors.push(...validateTrigger(step.id, config));
      break;
    case "send_email":
      errors.push(...validateSendEmail(step.id, config));
      break;
    case "condition":
      errors.push(...validateCondition(step.id, config));
      break;
    case "webhook":
      errors.push(...validateWebhook(step.id, config));
      break;
    case "subscribe_topic":
    case "unsubscribe_topic":
      errors.push(...validateTopic(step.id, config));
      break;
    case "wait_for_event":
      errors.push(...validateWaitForEvent(step.id, config));
      break;
    case "delay":
      errors.push(...validateDelay(step.id, config));
      break;
    // send_sms, exit, update_contact, wait_for_email_engagement - no required fields
  }

  return errors;
}

function validateTrigger(
  nodeId: string,
  config: Extract<AutomationStepConfig, { type: "trigger" }>
): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (config.triggerType) {
    case "event":
      if (!config.eventName?.trim()) {
        errors.push({
          nodeId,
          field: "eventName",
          message: "Trigger: event name is required",
          severity: "error",
        });
      }
      break;
    case "segment_entry":
    case "segment_exit":
      if (!config.segmentId?.trim()) {
        errors.push({
          nodeId,
          field: "segmentId",
          message: "Segment is required",
          severity: "error",
        });
      }
      break;
    case "topic_subscribed":
    case "topic_unsubscribed":
      if (!config.topicId?.trim()) {
        errors.push({
          nodeId,
          field: "topicId",
          message: "Topic is required",
          severity: "error",
        });
      }
      break;
    case "schedule":
      if (!config.schedule?.trim()) {
        errors.push({
          nodeId,
          field: "schedule",
          message: "Schedule (cron expression) is required",
          severity: "error",
        });
      }
      if (!config.timezone?.trim()) {
        errors.push({
          nodeId,
          field: "timezone",
          message: "Timezone is required",
          severity: "error",
        });
      }
      break;
    // contact_created, contact_updated, api - no additional config needed
  }

  return errors;
}

function validateSendEmail(
  nodeId: string,
  config: Extract<AutomationStepConfig, { type: "send_email" }>
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!config.templateId?.trim()) {
    errors.push({
      nodeId,
      field: "templateId",
      message: "Email template is required",
      severity: "error",
    });
  }

  return errors;
}

function validateCondition(
  nodeId: string,
  config: Extract<AutomationStepConfig, { type: "condition" }>
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!config.field?.trim()) {
    errors.push({
      nodeId,
      field: "field",
      message: "Condition field is required",
      severity: "error",
    });
  }

  if (!config.operator?.trim()) {
    errors.push({
      nodeId,
      field: "operator",
      message: "Condition operator is required",
      severity: "error",
    });
  }

  // Value is required unless operator doesn't need one
  const unaryOperators = ["is_set", "is_not_set", "is_true", "is_false"];
  if (
    !unaryOperators.includes(config.operator) &&
    (config.value === undefined || config.value === "")
  ) {
    errors.push({
      nodeId,
      field: "value",
      message: "Condition value is required",
      severity: "error",
    });
  }

  return errors;
}

function validateWebhook(
  nodeId: string,
  config: Extract<AutomationStepConfig, { type: "webhook" }>
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (config.url?.trim()) {
    // Basic URL validation
    try {
      new URL(config.url);
    } catch {
      errors.push({
        nodeId,
        field: "url",
        message: "Invalid URL format",
        severity: "error",
      });
    }
  } else {
    errors.push({
      nodeId,
      field: "url",
      message: "Webhook URL is required",
      severity: "error",
    });
  }

  return errors;
}

function validateTopic(
  nodeId: string,
  config: Extract<
    AutomationStepConfig,
    { type: "subscribe_topic" | "unsubscribe_topic" }
  >
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!config.topicId?.trim()) {
    errors.push({
      nodeId,
      field: "topicId",
      message: "Topic is required",
      severity: "error",
    });
  }

  return errors;
}

function validateWaitForEvent(
  nodeId: string,
  config: Extract<AutomationStepConfig, { type: "wait_for_event" }>
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!config.eventName?.trim()) {
    errors.push({
      nodeId,
      field: "eventName",
      message: "Wait for Event: event name is required",
      severity: "error",
    });
  }

  return errors;
}

function validateDelay(
  nodeId: string,
  config: Extract<AutomationStepConfig, { type: "delay" }>
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!config.amount || config.amount < 1) {
    errors.push({
      nodeId,
      field: "amount",
      message: "Delay duration must be at least 1",
      severity: "error",
    });
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// CASCADE CHANNEL VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates cascade channel configuration before expansion to primitive steps.
 * Called by the store on cascade nodes during automation definition generation.
 */
export function validateCascadeChannels(
  nodeId: string,
  channels: CascadeChannelConfig[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (channels.length === 0) {
    errors.push({
      nodeId,
      field: "channels",
      message: "Cascade must have at least one channel",
      severity: "error",
    });
    return errors;
  }

  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const isLast = i === channels.length - 1;

    if (channel.type === "email" && !channel.templateId?.trim()) {
      errors.push({
        nodeId,
        field: `channels[${i}].templateId`,
        message: `Channel ${i + 1}: Email template is required`,
        severity: "error",
      });
    }

    if (
      channel.type === "sms" &&
      !channel.body?.trim() &&
      !channel.templateId?.trim()
    ) {
      errors.push({
        nodeId,
        field: `channels[${i}].body`,
        message: `Channel ${i + 1}: SMS message or template is required`,
        severity: "error",
      });
    }

    if (
      !isLast &&
      channel.type === "email" &&
      (!channel.waitDuration || channel.waitDuration <= 0)
    ) {
      errors.push({
        nodeId,
        field: `channels[${i}].waitDuration`,
        message: `Channel ${i + 1}: Wait duration is required for non-final channels`,
        severity: "error",
      });
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARD-COMPAT ALIASES
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use validateAutomation */
export const validateWorkflow = validateAutomation;
