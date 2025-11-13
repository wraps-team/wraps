/**
 * Permission types for the custom permission system.
 * Replaces Better-Auth DAC with a simple, testable permission model.
 */

/**
 * Individual permissions that can be granted
 */
export type Permission = "view" | "send" | "manage";

/**
 * Predefined permission levels
 */
export const PERMISSION_LEVELS = {
  READ_ONLY: ["view"],
  FULL_ACCESS: ["view", "send"],
  ADMIN: ["view", "send", "manage"],
} as const;

export type PermissionLevel = keyof typeof PERMISSION_LEVELS;

/**
 * Helper to check if a permission list includes a specific permission
 */
export function hasPermission(
  permissions: string[],
  permission: Permission
): boolean {
  return permissions.includes(permission);
}

/**
 * Get human-readable description for permission level
 */
export function getPermissionLevelDescription(level: PermissionLevel): string {
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
 * Get permissions array for a permission level
 */
export function getPermissionsForLevel(
  level: PermissionLevel
): readonly string[] {
  return PERMISSION_LEVELS[level];
}
