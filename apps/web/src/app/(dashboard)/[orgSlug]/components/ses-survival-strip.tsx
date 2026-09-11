"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import Link from "next/link";
import type {
  SesHealthAccount,
  SesHealthDetail,
} from "@/hooks/use-ses-health-queries";
import { useSesHealth } from "@/hooks/use-ses-health-queries";
import {
  formatRate,
  formatThreshold,
  type MeterLevel,
  meterGeometry,
  SES_THRESHOLDS,
} from "@/lib/ses-thresholds";
import { cn, formatRelativeTime } from "@/lib/utils";

const LEVEL_FILL: Record<MeterLevel, string> = {
  ok: "bg-foreground",
  review: "bg-warning",
  pause: "bg-destructive",
};

const LEVEL_TEXT: Record<MeterLevel, string> = {
  ok: "text-foreground",
  review: "text-warning",
  pause: "text-destructive",
};

/**
 * One rate drawn against AWS's own review and pause lines.
 *
 * The lines are the point of the component: a bounce rate of 4% means nothing
 * on its own and everything next to "AWS reviews at 5%". A bare colour would
 * say "bad" without ever saying how much room is left.
 */
function RateMeter({
  label,
  value,
  review,
  pause,
  digits,
}: {
  label: string;
  value: number | null;
  review: number;
  pause: number;
  digits?: number;
}) {
  if (value === null) {
    return (
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-semibold text-lg text-muted-foreground">—</p>
        <p className="text-muted-foreground text-xs">
          No metrics published yet
        </p>
      </div>
    );
  }

  const { valuePct, reviewPct, pausePct, level } = meterGeometry(
    value,
    review,
    pause
  );

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn("font-semibold text-lg tabular-nums", LEVEL_TEXT[level])}
      >
        {formatRate(value, digits)}
      </p>
      <div className="relative h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", LEVEL_FILL[level])}
          style={{ width: `${valuePct}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute top-[-2px] h-[10px] w-px bg-warning/70"
          style={{ left: `${reviewPct}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute top-[-2px] h-[10px] w-px bg-destructive/70"
          style={{ left: `${pausePct}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs tabular-nums">
        review {formatThreshold(review)} · pause {formatThreshold(pause)}
      </p>
    </div>
  );
}

/** Quota has no AWS enforcement line — running out is just running out. */
function QuotaMeter({ detail }: { detail: SesHealthDetail }) {
  const { sentLast24Hours, max24HourSend, maxSendRate, quotaUsedRatio } =
    detail;

  if (sentLast24Hours === null || max24HourSend === null) {
    return (
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs">24h quota</p>
        <p className="font-semibold text-lg text-muted-foreground">—</p>
        <p className="text-muted-foreground text-xs">Quota not reported</p>
      </div>
    );
  }

  // SES reports an unlimited-in-practice quota as -1 on some account types.
  const isUnlimited = max24HourSend < 0;
  const ratio = quotaUsedRatio ?? 0;
  const isHigh = !isUnlimited && ratio >= SES_THRESHOLDS.quotaWarnRatio;

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs">24h quota</p>
      <p
        className={cn(
          "font-semibold text-lg tabular-nums",
          isHigh ? "text-warning" : "text-foreground"
        )}
      >
        {sentLast24Hours.toLocaleString()}
        <span className="font-normal text-muted-foreground text-sm">
          {isUnlimited ? " sent" : ` / ${max24HourSend.toLocaleString()}`}
        </span>
      </p>
      {isUnlimited ? (
        <div className="h-1.5" />
      ) : (
        <div className="relative h-1.5 w-full rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              isHigh ? "bg-warning" : "bg-foreground"
            )}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute top-[-2px] h-[10px] w-px bg-warning/70"
            style={{ left: `${SES_THRESHOLDS.quotaWarnRatio * 100}%` }}
          />
        </div>
      )}
      <p className="text-muted-foreground text-xs tabular-nums">
        {isUnlimited ? "No daily cap" : `${formatRate(ratio, 1)} used`}
        {maxSendRate !== null && ` · ${maxSendRate}/s max rate`}
      </p>
    </div>
  );
}

/**
 * The states that decide whether this account can send at all, as opposed to
 * how close it is to being stopped. Each renders only when it is true, so a
 * healthy production account shows nothing here.
 */
function AccountFlags({
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
      <Badge
        className="text-warning border-warning/50"
        key="sandbox"
        variant="outline"
      >
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
        <RateMeter
          label="Bounce rate"
          pause={SES_THRESHOLDS.bounce.pause}
          review={SES_THRESHOLDS.bounce.review}
          value={detail?.bounceRate ?? null}
        />
        <RateMeter
          digits={2}
          label="Complaint rate"
          pause={SES_THRESHOLDS.complaint.pause}
          review={SES_THRESHOLDS.complaint.review}
          value={detail?.complaintRate ?? null}
        />
        {detail ? (
          <QuotaMeter detail={detail} />
        ) : (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs">24h quota</p>
            <p className="font-semibold text-lg text-muted-foreground">—</p>
          </div>
        )}
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Account survival</CardTitle>
        <CardAction className="self-center text-muted-foreground text-xs">
          {checkedLine}
        </CardAction>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
