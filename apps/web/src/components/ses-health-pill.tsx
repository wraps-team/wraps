"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import Link from "next/link";
import type { SesHealthAccount } from "@/hooks/use-ses-health-queries";
import { useSesHealth } from "@/hooks/use-ses-health-queries";
import { formatRelativeTime } from "@/lib/utils";

/** Humanizes the classifier's machine-readable reason codes for the tooltip. */
const REASON_LABELS: Record<string, string> = {
  sending_disabled: "SES has disabled sending",
  bounce_pause: "bounce rate above AWS's pause line",
  bounce_review: "bounce rate above AWS's review line",
  complaint_pause: "complaint rate above AWS's pause line",
  complaint_review: "complaint rate above AWS's review line",
  quota_high: "daily send quota nearly used up",
  enforcement_probation: "AWS enforcement status: PROBATION",
  enforcement_shutdown: "AWS enforcement status: SHUTDOWN",
};

function humanizeReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

function accountTooltipLine(account: SesHealthAccount): string {
  const reasons =
    account.reasons.length > 0
      ? account.reasons.map(humanizeReason).join(", ")
      : "unchecked";
  return `${account.name} (${account.region}) — ${reasons}`;
}

export function SesHealthPill({
  orgSlug,
}: {
  orgSlug: string | null | undefined;
}) {
  const { data, isLoading, isError } = useSesHealth(orgSlug);

  // A header element that flickers or shows an error on every page load is
  // worse than no header element.
  if (!orgSlug || isLoading || isError || !data) {
    return null;
  }

  // An org that has not connected AWS yet is being onboarded, not failing.
  if (data.accounts.length === 0) {
    return null;
  }

  // Green-when-fine is visual noise on every page; the pill exists to
  // surface trouble.
  if (data.status === "healthy") {
    return null;
  }

  const label =
    data.status === "in_danger"
      ? "SES needs attention"
      : data.status === "at_risk"
        ? "SES at risk"
        : "SES unchecked";

  const badgeClassName =
    data.status === "at_risk"
      ? "text-warning border-warning/50"
      : data.status === "unknown"
        ? "text-muted-foreground"
        : undefined;

  const problemAccounts = data.accounts.filter((a) => a.status !== "healthy");
  const checkedLine =
    data.checkedAt !== null
      ? `Checked ${formatRelativeTime(new Date(data.checkedAt))}`
      : "Never checked";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={`/${orgSlug}/emails/analytics`}>
          <Badge
            className={badgeClassName}
            variant={data.status === "in_danger" ? "destructive" : "outline"}
          >
            {label}
          </Badge>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-1">
          {problemAccounts.map((account) => (
            <span key={account.id}>{accountTooltipLine(account)}</span>
          ))}
          <span>{checkedLine}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
