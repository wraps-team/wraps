/**
 * @deprecated Import from `./workflow-system-prompt` instead.
 * The workflow-system-prompt file remains authoritative — keeping it stable
 * avoids a rename that doesn't yet have a clear canonical home.
 */
export * from "./workflow-system-prompt";

// Re-export with new name for forward compat
export { buildWorkflowSystemPrompt as buildAutomationSystemPrompt } from "./workflow-system-prompt";
