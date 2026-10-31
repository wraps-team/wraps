"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import Link from "next/link";
import { QuotaMeter, RateMeter } from "@/components/ses-meter";
import type {
  SesHealthAccount,
  SesHealthDetail,
} from "@/hooks/use-ses-health-queries";
import { useSesHealth } from "@/hooks/use-ses-health-queries";
import { formatRelativeTime } from "@/lib/utils";

/**
 * The states that decide whether this account can send at all, as opposed to
 * how close it is to being stopped. Each renders only when it is true, so a
 * healthy production account shows nothing here.
 */
export function AccountFlags({
  detail,
  orgSlug,
}: {
  detail: SesHealthDetail;
  orgSlug: string;
}) {
  const flags: React.ReactNode[] = [];

  if (detail.sendingEnabled === false) {
    flags.push(
      <Badge key="sending" variant="destructive">
        Sending disabled by SES
      </Badge>
    );
  }

  if (
    detail.enforcementStatus !== null &&
    detail.enforcementStatus !== "HEALTHY"
  ) {
    flags.push(
      <Badge key="enforcement" variant="destructive">
        AWS enforcement: {detail.enforcementStatus}
      </Badge>
    );
  }

  if (detail.productionAccessEnabled === false) {
    flags.push(
      <Badge key="sandbox" variant="warning">
        SES sandbox
      </Badge>
    );
  }

  if (detail.reviewStatus !== null && detail.reviewStatus !== "GRANTED") {
    flags.push(
      <Badge key="review" variant="outline">
        Production access {detail.reviewStatus.toLowerCase()}
        {detail.reviewCaseId && ` · case ${detail.reviewCaseId}`}
      </Badge>
    );
  }

  if (flags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      {flags}
      <Link
        className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
        href={`/${orgSlug}/settings/aws-accounts`}
      >
        Manage account
      </Link>
    </div>
  );
}

function AccountBlock({
  account,
  orgSlug,
  showName,
}: {
  account: SesHealthAccount;
  orgSlug: string;
  showName: boolean;
}) {
  const detail = account.detail;

  return (
    <div className="space-y-3">
      {showName && (
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{account.name}</p>
          <span className="text-muted-foreground text-xs">
            {account.region}
          </span>
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-3">
        <RateMeter metric="bounce" value={detail?.bounceRate ?? null} />
        <RateMeter metric="complaint" value={detail?.complaintRate ?? null} />
        <QuotaMeter detail={detail} />
      </div>
      {detail && <AccountFlags detail={detail} orgSlug={orgSlug} />}
    </div>
  );
}

/**
 * Account survival: the numbers that decide whether AWS keeps letting this
 * account send, against AWS's own lines.
 *
 * Every figure comes from `aws_account.healthDetail`, written by the hourly
 * account-health sweep — this component makes no AWS calls and adds no query
 * beyond the health endpoint the header pill already polls.
 */
export function SesSurvivalStrip({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading } = useSesHealth(orgSlug);

  if (isLoading || !data || data.accounts.length === 0) {
    return null;
  }

  const checkedLine =
    data.checkedAt === null
      ? "Never checked"
      : `Checked ${formatRelativeTime(new Date(data.checkedAt))}`;

  // SES account survival is read live from the customer's AWS account, so the
  // panel is the dashed "own" one.
  return (
    <Panel
      label={<PanelTitle>Account survival</PanelTitle>}
      meta={
        <span className="text-muted-foreground text-xs">{checkedLine}</span>
      }
      variant="own"
    >
      <div className="space-y-6">
        {data.accounts.map((account) => (
          <AccountBlock
            account={account}
            key={account.id}
            orgSlug={orgSlug}
            showName={data.accounts.length > 1}
          />
        ))}
      </div>
    </Panel>
  );
}
