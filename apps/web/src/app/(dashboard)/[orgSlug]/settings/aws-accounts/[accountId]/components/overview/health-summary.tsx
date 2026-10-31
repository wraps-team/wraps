"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { AccountFlags } from "@/app/(dashboard)/[orgSlug]/components/ses-survival-strip";
import { QuotaMeter, RateMeter } from "@/components/ses-meter";
import type { SesHealthDetail } from "@/hooks/use-ses-health-queries";
import type { AccountStatus } from "@/lib/aws/account-status";
import { humanizeSesHealthReason } from "@/lib/ses-health-reasons";
import { formatRelativeTime } from "@/lib/utils";
import { LEVEL_BADGE_VARIANT } from "../../lib/role-status";

type HealthSummaryProps = {
  orgSlug: string;
  region: string;
  status: AccountStatus;
  /** ISO time of the last hourly health sweep, or null if none has run. */
  healthCheckedAt: string | null;
  healthDetail: SesHealthDetail | null;
  reasons: string[];
};

/**
 * Sending health from the hourly sweep's persisted data. Makes no AWS calls.
 * An unmeasured account reads "Not checked yet", never healthy.
 */
export function HealthSummary({
  orgSlug,
  region,
  status,
  healthCheckedAt,
  healthDetail,
  reasons,
}: HealthSummaryProps) {
  const unmeasured = status.level === "unknown" && healthDetail === null;

  return (
    // Read from the hourly sweep of the customer's SES account.
    <Panel
      label={<PanelTitle>Sending health · {region}</PanelTitle>}
      meta={
        healthCheckedAt && (
          <span className="text-muted-foreground text-xs">
            checked {formatRelativeTime(new Date(healthCheckedAt))}
          </span>
        )
      }
      variant="own"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={LEVEL_BADGE_VARIANT[status.level]}>
            {status.label}
          </Badge>
          {status.detail && (
            <span className="text-muted-foreground text-sm">
              {status.detail}
            </span>
          )}
        </div>

        {unmeasured ? (
          <p className="text-muted-foreground text-sm">
            Not checked yet. Wraps checks every hour.
          </p>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-3">
              <RateMeter
                metric="bounce"
                value={healthDetail?.bounceRate ?? null}
              />
              <RateMeter
                metric="complaint"
                value={healthDetail?.complaintRate ?? null}
              />
              <QuotaMeter detail={healthDetail} />
            </div>
            {healthDetail && (
              <AccountFlags detail={healthDetail} orgSlug={orgSlug} />
            )}
          </>
        )}

        {reasons.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
            {reasons.map((reason) => (
              <li key={reason}>{humanizeSesHealthReason(reason)}</li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
