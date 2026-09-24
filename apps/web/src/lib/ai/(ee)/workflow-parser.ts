// apps/web/src/lib/ai/workflow-parser.ts

import type {
  WorkflowStep,
  WorkflowStepType,
  WorkflowTransition,
} from "@wraps/db";
import { logger } from "@/lib/logger";

/**
 * Valid step types that the AI can generate
 */
const VALID_STEP_TYPES: WorkflowStepType[] = [
  "trigger",
  "send_email",
  "send_sms",
  "delay",
  "exit",
  "condition",
  "webhook",
  "update_contact",
  "wait_for_event",
  "wait_for_email_engagement",
  "subscribe_topic",
  "unsubscribe_topic",
];

/**
 * Result of parsing an AI response
 */
export type ParsedWorkflow = {
  steps: WorkflowStep[];
  transitions: WorkflowTransition[];
};

/**
 * Extract workflow JSON from an AI response message.
 * The AI may include the JSON in a code block or as raw JSON.
 *
 * @param content - The AI response content
 * @returns Parsed workflow or null if invalid
 */
export function extractWorkflowFromMessage(
  content: string
): ParsedWorkflow | null {
  try {
    // Try to find JSON in a markdown code block first
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);

    let jsonStr: string;
    if (codeBlockMatch?.[1]) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      // Try to find raw JSON object
      const rawJsonMatch = content.match(
        /\{[\s\S]*"steps"[\s\S]*"transitions"[\s\S]*\}/
      );
      if (!rawJsonMatch) {
        console.warn("[workflow-parser] No JSON found in AI response");
        return null;
      }
      jsonStr = rawJsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    // Validate basic structure
    if (!parsed || typeof parsed !== "object") {
      console.warn("[workflow-parser] Parsed result is not an object");
      return null;
    }

    if (!Array.isArray(parsed.steps)) {
      console.warn("[workflow-parser] 'steps' is not an array");
      return null;
    }

    if (!Array.isArray(parsed.transitions)) {
      console.warn("[workflow-parser] 'transitions' is not an array");
      return null;
    }

    // Validate and normalize steps
    const steps = validateSteps(parsed.steps);
    if (!steps) {
      return null;
    }

    // Validate transitions
    const stepIds = new Set(steps.map((s) => s.id));
    const transitions = validateTransitions(parsed.transitions, stepIds);
    if (!transitions) {
      return null;
    }

    return { steps, transitions };
  } catch (error) {
    logger.warn(
      { error: String(error) },
      "workflow parser could not parse AI response"
    );
    return null;
  }
}

/**
 * Validate and normalize steps array
 */
function validateSteps(steps: unknown[]): WorkflowStep[] | null {
  const validated: WorkflowStep[] = [];

  for (const step of steps) {
    if (!step || typeof step !== "object") {
      console.warn("[workflow-parser] Invalid step: not an object");
      return null;
    }

    const s = step as Record<string, unknown>;

    // Required fields
    if (typeof s.id !== "string" || !s.id) {
      console.warn("[workflow-parser] Step missing id");
      return null;
    }

    if (
      typeof s.type !== "string" ||
      !VALID_STEP_TYPES.includes(s.type as WorkflowStepType)
    ) {
      console.warn(`[workflow-parser] Invalid step type: ${s.type}`);
      return null;
    }

    if (typeof s.name !== "string") {
      console.warn("[workflow-parser] Step missing name");
      return null;
    }

    // Position validation
    if (!s.position || typeof s.position !== "object") {
      console.warn("[workflow-parser] Step missing position");
      return null;
    }

    const pos = s.position as Record<string, unknown>;
    if (typeof pos.x !== "number" || typeof pos.y !== "number") {
      console.warn("[workflow-parser] Invalid position coordinates");
      return null;
    }

    // Config validation
    if (!s.config || typeof s.config !== "object") {
      console.warn("[workflow-parser] Step missing config");
      return null;
    }

    const config = s.config as Record<string, unknown>;
    if (config.type !== s.type) {
      // Fix common AI mistake: config.type should match step.type
      config.type = s.type;
    }

    validated.push({
      id: s.id,
      type: s.type as WorkflowStepType,
      name: s.name,
      position: { x: pos.x, y: pos.y },
      config: config as WorkflowStep["config"],
    });
  }

  // Must have exactly one trigger
  const triggers = validated.filter((s) => s.type === "trigger");
  if (triggers.length !== 1) {
    console.warn(
      `[workflow-parser] Expected 1 trigger, found ${triggers.length}`
    );
    return null;
  }

  return validated;
}

/**
 * Validate transitions array
 */
function validateTransitions(
  transitions: unknown[],
  validStepIds: Set<string>
): WorkflowTransition[] | null {
  const validated: WorkflowTransition[] = [];

  for (const transition of transitions) {
    if (!transition || typeof transition !== "object") {
      console.warn("[workflow-parser] Invalid transition: not an object");
      return null;
    }

    const t = transition as Record<string, unknown>;

    // Required fields
    if (typeof t.id !== "string" || !t.id) {
      console.warn("[workflow-parser] Transition missing id");
      return null;
    }

    if (typeof t.fromStepId !== "string" || !validStepIds.has(t.fromStepId)) {
      console.warn(`[workflow-parser] Invalid fromStepId: ${t.fromStepId}`);
      return null;
    }

    if (typeof t.toStepId !== "string" || !validStepIds.has(t.toStepId)) {
      console.warn(`[workflow-parser] Invalid toStepId: ${t.toStepId}`);
      return null;
    }

    const validatedTransition: WorkflowTransition = {
      id: t.id,
      fromStepId: t.fromStepId,
      toStepId: t.toStepId,
    };

    // Optional condition
    if (t.condition && typeof t.condition === "object") {
      const cond = t.condition as Record<string, unknown>;
      if (typeof cond.branch === "string") {
        validatedTransition.condition = {
          branch: cond.branch as NonNullable<
            WorkflowTransition["condition"]
          >["branch"],
        };
      }
    }

    validated.push(validatedTransition);
  }

  return validated;
}

/**
 * Check if content appears to contain a workflow JSON
 * Useful for detecting when the AI has finished generating
 */
export function containsWorkflowJson(content: string): boolean {
  return (
    content.includes('"steps"') &&
    content.includes('"transitions"') &&
    (content.includes("```json") || content.includes('"type": "trigger"'))
  );
}
