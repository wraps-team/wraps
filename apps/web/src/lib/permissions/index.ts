// Permission system for Wraps dashboard
// Custom permission system with dedicated aws_account_permission table

// Check access
export { checkAWSAccountAccess } from "./check-access";

// Grant access
export { grantAWSAccountAccess } from "./grant-access";
export {
  ACCESS_LEVELS,
  type AccessLevel,
  type Action,
  getAccessLevelDescription,
  getActionsForLevel,
  hasAction,
} from "./levels";
// List permissions
export { listUserAWSAccountPermissions } from "./list-permissions";
// Middleware
export { requireAWSAccountAccess } from "./middleware";
// Revoke access
export { revokeAWSAccountAccess } from "./revoke-access";
// Permission levels and types
export {
  PERMISSION_LEVELS,
  type Permission,
  type PermissionLevel,
} from "./types";
