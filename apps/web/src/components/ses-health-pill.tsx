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
import { hubHref } from "@/lib/emails-hub";
import { humanizeSesHealthReason } from "@/lib/ses-health-reasons";
import { formatRelativeTime } from "@/lib/utils";

function accountTooltipLine(account: SesHealthAccount): string {
  const reasons =
    account.reasons.length > 0
      ? account.reasons.map(humanizeSesHealthReason).join(", ")
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

  const badgeVariant =
    data.status === "in_danger"
      ? "destructive"
      : data.status === "at_risk"
        ? "warning"
        : data.status === "unknown"
          ? "secondary"
          : "outline";

  const problemAccounts = data.accounts.filter((a) => a.status !== "healthy");
  const checkedLine =
    data.checkedAt !== null
      ? `Checked ${formatRelativeTime(new Date(data.checkedAt))}`
      : "Never checked";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={hubHref(orgSlug, { tab: "deliverability" })}>
          <Badge variant={badgeVariant}>{label}</Badge>
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
