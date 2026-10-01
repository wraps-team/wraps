import type { HealthLevel } from "@/app/(dashboard)/[orgSlug]/components/health-level";
import { humanizeSesHealthReason } from "@/lib/ses-health-reasons";
import { formatRelativeTime } from "@/lib/utils";

/** Three missed hourly sweeps. */
export const ROLE_REACHABILITY_WINDOW_MS = 3 * 60 * 60 * 1000;

export type AccountStatusInput = {
  /** Account-scoped: the IAM role is global per AWS account. */
  role: { lastReachableAt: Date | null };
  /** Region-scoped: SES health and event streaming. One entry today; a list after multi-region. */
  regional: {
    healthStatus: "healthy" | "at_risk" | "in_danger" | null;
    healthReasons: string[];
    eventFeedStaleSince: Date | null;
    lastEventReceivedAt: Date | null;
  };
  now: Date;
};

export type AccountStatus = {
  level: HealthLevel;
  label: string;
  detail: string | null;
};

/** Serialisable row the accounts list renders. */
export type AccountRow = {
  id: string;
  name: string;
  accountId: string;
  region: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  status: AccountStatus;
  lastEventAt: string | null;
};

function firstReason(reasons: string[]): string | null {
  return reasons[0] ? humanizeSesHealthReason(reasons[0]) : null;
}

/**
 * Worst verdict wins. The role beats health: the sweep leaves the previous
 * verdict in place when the role fails, so a stale "healthy" can outlive a
 * broken role. A role that has never been reached is silent (unfinished
 * setup), matching the sweep. No measurement is never "healthy".
 */
export function getAccountStatus({
  role,
  regional,
  now,
}: AccountStatusInput): AccountStatus {
  if (
    role.lastReachableAt !== null &&
    now.getTime() - role.lastReachableAt.getTime() > ROLE_REACHABILITY_WINDOW_MS
  ) {
    return {
      level: "critical",
      label: "Role unreachable",
      detail: `Last reached ${formatRelativeTime(role.lastReachableAt)}`,
    };
  }
  if (regional.healthStatus === "in_danger") {
    return {
      level: "critical",
      label: "In danger",
      detail: firstReason(regional.healthReasons),
    };
  }
  if (regional.eventFeedStaleSince !== null) {
    return {
      level: "warning",
      label: "Events stopped",
      detail: regional.lastEventReceivedAt
        ? `Last event ${formatRelativeTime(regional.lastEventReceivedAt)}`
        : null,
    };
  }
  if (regional.healthStatus === "at_risk") {
    return {
      level: "warning",
      label: "At risk",
      detail: firstReason(regional.healthReasons),
    };
  }
  if (regional.healthStatus === "healthy") {
    return { level: "healthy", label: "Healthy", detail: null };
  }
  return { level: "unknown", label: "Not checked yet", detail: null };
}
