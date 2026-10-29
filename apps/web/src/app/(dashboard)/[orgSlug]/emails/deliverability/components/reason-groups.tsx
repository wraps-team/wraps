"use client";

import type { DiagnosticSeverity } from "@wraps/core/email-diagnostics";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export type ReasonsMetric = "bounce" | "complaint";

// Response of GET /api/[orgSlug]/analytics/drilldown/reasons. Shared by the
// route (type only) and the tab. No field holds a recipient address.
export type ReasonGroup = {
  receiverDomain: string;
  /** The SES bounce type (Permanent, Transient, Undetermined); null for complaints and legacy rows without one. */
  bounceType: string | null;
  title: string;
  explanation: string | null;
  suggestedAction: string | null;
  provider: string | null;
  severity: DiagnosticSeverity;
  rawCode: string | null; // stored receiver text, shown on request
  feedbackType: string | null; // complaints only
  count: number;
  share: number | null; // percent of the window total, two decimals
  distinctRecipients: number;
  firstSeen: string | null; // ISO
  lastSeen: string | null; // ISO
  hasDetail: boolean; // false for rows recorded before reasons were stored
};

export type ReasonsResponse = {
  mode: "detailed" | "legacy";
  metric: ReasonsMetric;
  totalCount: number;
  fallbackSince: string | null; // ISO, org-scoped
  windowHasFallbackRows: boolean;
  groups: ReasonGroup[];
  otherCount: number;
  suppressionReconciliation: number; // bounce metric only
};

const NOUN: Record<ReasonsMetric, string> = {
  bounce: "bounces",
  complaint: "complaints",
};

function formatDay(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** The one banner for the window, or null. Legacy mode always has one. */
function fallbackBanner(
  response: ReasonsResponse,
  metric: ReasonsMetric,
  tz: string
): string | null {
  if (response.mode === "legacy") {
    return "Detailed reasons are not available yet. Showing receiver categories only.";
  }
  if (!response.windowHasFallbackRows) {
    return null;
  }
  const noun = NOUN[metric];
  if (response.fallbackSince) {
    return `Detailed reasons are recorded for ${noun} received after ${formatDay(response.fallbackSince, tz)}.`;
  }
  return `Detailed reasons are not recorded yet for your ${noun}. They appear for ${noun} received from now on.`;
}

function ReasonRow({
  group,
  metric,
  tz,
}: {
  group: ReasonGroup;
  metric: ReasonsMetric;
  tz: string;
}) {
  const noun = NOUN[metric];
  const domain = group.receiverDomain || "unknown domain";
  const recipients =
    group.distinctRecipients === 1
      ? "1 recipient"
      : `${group.distinctRecipients.toLocaleString("en-US")} recipients`;
  const share = group.share === null ? "" : ` (${group.share.toFixed(2)}%)`;
  const seen =
    group.firstSeen && group.lastSeen
      ? ` · first ${formatDay(group.firstSeen, tz)}, last ${formatDay(group.lastSeen, tz)}`
      : "";

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{group.title}</h3>
        {group.provider ? (
          <Badge variant="secondary">{group.provider}</Badge>
        ) : null}
        {group.hasDetail ? null : (
          <span className="text-muted-foreground text-xs">
            No reason recorded
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-xs">Receiver: {domain}</p>
      <p className="text-sm">
        {`${group.count.toLocaleString("en-US")} ${noun}${share} · ${recipients}${seen}`}
      </p>
      {group.explanation ? (
        <p className="text-sm">{group.explanation}</p>
      ) : null}
      {group.suggestedAction ? (
        <p className="text-muted-foreground text-sm">{group.suggestedAction}</p>
      ) : null}
      {group.rawCode ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            What the receiver said
          </summary>
          <code className="mt-2 block break-all font-mono">
            {group.rawCode}
          </code>
        </details>
      ) : null}
    </li>
  );
}

/**
 * Reasons for one metric in one window: the banner, the group list, the
 * other-reasons count and the suppression footnote. Takes its response as
 * props, so it has no data hook.
 */
export function ReasonGroups({
  metric,
  response,
  tz,
}: {
  metric: ReasonsMetric;
  response: ReasonsResponse;
  tz: string;
}) {
  const banner = fallbackBanner(response, metric, tz);
  const noun = NOUN[metric];
  const showFootnote =
    metric === "bounce" && response.suppressionReconciliation > 0;

  return (
    <div className="flex flex-col gap-6">
      {banner ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">{banner}</p>
      ) : null}

      {response.totalCount === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{`No ${noun} in this window`}</EmptyTitle>
            <EmptyDescription>
              {`Nothing ${metric === "bounce" ? "bounced" : "was reported as a complaint"} in this window, so there are no reasons to show.`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="text-sm">
            {`${response.totalCount.toLocaleString("en-US")} ${noun} in this window, grouped by receiver domain and reason.`}
          </p>
          <ul className="flex flex-col gap-3">
            {response.groups.map((group, index) => (
              <ReasonRow
                group={group}
                key={`${group.receiverDomain}|${group.title}|${index}`}
                metric={metric}
                tz={tz}
              />
            ))}
          </ul>
          {response.otherCount > 0 ? (
            <p className="text-muted-foreground text-sm">
              {`Other reasons: ${response.otherCount.toLocaleString("en-US")}`}
            </p>
          ) : null}
        </>
      )}

      {showFootnote ? (
        <p className="text-muted-foreground text-xs">
          {`${response.suppressionReconciliation.toLocaleString("en-US")} bounces in this window were suppression events recorded by the send path. They are counted as bounces on the bounce chart and are not listed here.`}
        </p>
      ) : null}
    </div>
  );
}
