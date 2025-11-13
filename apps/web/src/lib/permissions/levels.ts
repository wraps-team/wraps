/**
 * Access levels for AWS accounts in the Wraps dashboard.
 * Each level grants a specific set of actions.
 */

/**
 * READ_ONLY: View metrics and email history
 * - View CloudWatch metrics
 * - View email send statistics
 * - View DynamoDB event data
 */
export const READ_ONLY_ACTIONS = ["aws-account:view"] as const;

/**
 * FULL_ACCESS: View + Send emails
 * - Everything in READ_ONLY
 * - Send emails via SES
 */
export const FULL_ACCESS_ACTIONS = [
  "aws-account:view",
  "aws-account:send",
] as const;

/**
 * ADMIN: Full management access
 * - Everything in FULL_ACCESS
 * - Add/remove AWS accounts
 * - Configure account settings
 * - Manage other users' access
 */
export const ADMIN_ACTIONS = [
  "aws-account:view",
  "aws-account:send",
  "aws-account:manage",
] as const;

/**
 * All available access levels
 */
export const ACCESS_LEVELS = {
  READ_ONLY: READ_ONLY_ACTIONS,
  FULL_ACCESS: FULL_ACCESS_ACTIONS,
  ADMIN: ADMIN_ACTIONS,
} as const;

export type AccessLevel = keyof typeof ACCESS_LEVELS;
export type Action = (typeof ADMIN_ACTIONS)[number];

/**
 * Helper to check if an action is included in an access level
 */
export function hasAction(level: AccessLevel, action: Action): boolean {
  return (ACCESS_LEVELS[level] as readonly string[]).includes(action);
}

/**
 * Get human-readable description for access level
 */
export function getAccessLevelDescription(level: AccessLevel): string {
  switch (level) {
    case "READ_ONLY":
      return "View metrics and email history";
    case "FULL_ACCESS":
      return "View metrics and send emails";
    case "ADMIN":
      return "Full management access (view, send, configure)";
  }
}

/**
 * Get actions for an access level
 */
export function getActionsForLevel(level: AccessLevel): readonly Action[] {
  return ACCESS_LEVELS[level];
}
