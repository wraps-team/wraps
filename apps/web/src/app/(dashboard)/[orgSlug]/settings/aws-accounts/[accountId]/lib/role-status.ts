import type { HealthLevel } from "@/app/(dashboard)/[orgSlug]/components/health-level";
import { ROLE_REACHABILITY_WINDOW_MS } from "@/lib/aws/account-status";
import { formatRelativeTime } from "@/lib/utils";
import { CURRENT_CONSOLE_POLICY_VERSION } from "../components/stale-policy-banner";

/** Badge variant for each status level, shared by the account pages. */
export const LEVEL_BADGE_VARIANT = {
  healthy: "success",
  warning: "warning",
  critical: "destructive",
  unknown: "secondary",
} as const satisfies Record<HealthLevel, string>;

export type RoleStatus = {
  level: HealthLevel;
  label: string;
  /** "Last reached 2h ago · policy v5 of 6 · checked 1h ago", or "" if nothing is known. */
  detail: string;
  /** Unreachable, or its policy is behind the current version. */
  needsRepair: boolean;
};

/**
 * Status of the wraps-console-access-role, from persisted columns only. The
 * role is account-scoped, so this takes no region.
 */
export function getRoleStatus({
  lastReachableAt,
  consolePolicyVersion,
  consolePolicyCheckedAt,
  now,
}: {
  lastReachableAt: Date | null;
  consolePolicyVersion: number | null;
  consolePolicyCheckedAt: Date | null;
  now: Date;
}): RoleStatus {
  const unreachable =
    lastReachableAt !== null &&
    now.getTime() - lastReachableAt.getTime() > ROLE_REACHABILITY_WINDOW_MS;
  const policyBehind =
    consolePolicyVersion !== null &&
    consolePolicyVersion < CURRENT_CONSOLE_POLICY_VERSION;

  let level: HealthLevel;
  let label: string;
  if (lastReachableAt === null) {
    level = "unknown";
    label = "Not checked yet";
  } else if (unreachable) {
    level = "critical";
    label = "Unreachable";
  } else if (policyBehind) {
    level = "warning";
    label = "Policy outdated";
  } else {
    level = "healthy";
    label = "Reachable";
  }

  const detail = [
    lastReachableAt
      ? `Last reached ${formatRelativeTime(lastReachableAt)}`
      : null,
    consolePolicyVersion !== null
      ? `policy v${consolePolicyVersion} of ${CURRENT_CONSOLE_POLICY_VERSION}`
      : null,
    consolePolicyCheckedAt
      ? `checked ${formatRelativeTime(consolePolicyCheckedAt)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return { level, label, detail, needsRepair: unreachable || policyBehind };
}
