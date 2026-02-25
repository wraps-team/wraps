/**
 * Automations Push Command
 *
 * Alias for `wraps email workflows push`. The underlying implementation is identical.
 * This file exists so users can use either `wraps email automations push` or
 * `wraps email workflows push` (both work during the transition period).
 */
export {
  workflowsPush as automationsPush,
  workflowsPush,
} from "../workflows/push.js";
