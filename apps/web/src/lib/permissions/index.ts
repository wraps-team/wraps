// Permission system for Wraps dashboard
// Implements Dynamic Access Control (DAC) using better-auth

// Check access
export {
  checkAWSAccountAccess,
  checkMultipleAccess,
  getEffectiveAccessLevel,
} from "./check-access";

// Grant access
export {
  grantAWSAccountAccess,
  grantDefaultAccessToMembers,
  updateAWSAccountAccess,
} from "./grant-access";
// Access levels
export {
  ACCESS_LEVELS,
  type AccessLevel,
  type Action,
  getAccessLevelDescription,
  getActionsForLevel,
  hasAction,
} from "./levels";
// Middleware
export {
  requireAWSAccountAccess,
  requireOrgMembership,
  requireOrgRole,
} from "./middleware";
// Revoke access
export {
  revokeAllOrgAWSAccess,
  revokeAWSAccountAccess,
  revokeBulkAWSAccountAccess,
} from "./revoke-access";
