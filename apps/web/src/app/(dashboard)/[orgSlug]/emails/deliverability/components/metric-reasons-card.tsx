"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { useQueryStates } from "nuqs";
import * as React from "react";
import {
  browserTimeZone,
  type DrilldownWindow,
  parseDrilldownWindow,
} from "@/lib/analytics-drilldown-window";
import { useAnalyticsOverview } from "../../analytics/hooks/use-analytics";
import {
  type ReasonMetric,
  useDrilldownReasons,
} from "../hooks/use-drilldown-reasons";
import { useDeliverabilityDays } from "../lib/params";
import {
  ADDRESSES_TO_REVIEW_ID,
  reviewListParser,
  reviewReasonParser,
} from "../lib/review-params";
import { Meter } from "./rate-bar-table";
import type { ReasonGroup } from "./reason-groups";

/** How many reasons are listed before the rest fold into "Other". */
const TOP_REASONS = 5;

const COPY: Record<
  ReasonMetric,
  {
    title: string;
    subtitle: string;
    empty: string;
    footnote: string;
    noun: string;
  }
> = {
  bounce: {
    title: "Bounces",
    subtitle: "What SES rejected, and why.",
    empty: "No bounces in this window.",
    footnote:
      "SES suppresses hard bounces for you. Repeat soft bounces are not, so they keep counting against you.",
    noun: "bounces",
  },
  complaint: {
    title: "Complaints",
    subtitle: "Who marked your email as spam, and how.",
    empty: "No complaints in this window.",
    footnote:
      "Suppress every complaint: mailing these people again is the fastest way to a reputation review.",
    noun: "complaints",
  },
};

/** Hard for a permanent bounce, soft for a transient or undetermined one. */
function bounceKind(bounceType: string | null): "hard" | "soft" | null {
  if (bounceType === "Permanent") {
    return "hard";
  }
  if (bounceType === "Transient" || bounceType === "Undetermined") {
    return "soft";
  }
  return null;
}

type Row = {
  key: string;
  label: string;
  count: number;
  kind: "hard" | "soft" | null;
  other: boolean;
};

/**
 * The reason rows. The reasons route returns one group per receiver domain and
 * reason, so the same reason repeats across domains. Groups with the same
 * title and bounce type are merged first, then ranked by their summed count.
 * The top reasons are listed and the rest, plus the receiver's other count,
 * fold into "Other".
 */
export function reasonRows(
  groups: ReasonGroup[],
  otherCount: number,
  metric: ReasonMetric
): Row[] {
  const merged = new Map<string, Row>();
  for (const group of groups) {
    const kind = metric === "bounce" ? bounceKind(group.bounceType) : null;
    const key = `${group.title}|${group.bounceType ?? ""}`;
    const existing = merged.get(key);
    if (existing) {
      existing.count += group.count;
    } else {
      merged.set(key, {
        key,
        label: group.title,
        count: group.count,
        kind,
        other: false,
      });
    }
  }
  const ranked = [...merged.values()].sort((a, b) => b.count - a.count);
  const top = ranked.slice(0, TOP_REASONS);
  const rest = ranked
    .slice(TOP_REASONS)
    .reduce((sum, row) => sum + row.count, 0);
  const other = rest + otherCount;
  return other > 0
    ? [
        ...top,
        { key: "other", label: "Other", count: other, kind: null, other: true },
      ]
    : top;
}

function barFill(row: Row, metric: ReasonMetric): string {
  if (row.other) {
    return "fill-muted-foreground";
  }
  if (metric === "complaint") {
    return "fill-destructive";
  }
  if (row.kind === "hard") {
    return "fill-destructive";
  }
  if (row.kind === "soft") {
    return "fill-warning";
  }
  return "fill-muted-foreground";
}

/**
 * The side card beside the driving panel: the total for the metric in the
 * window, the rate of sends, and the top reasons. It covers the whole window
 * and ignores the panel's day, so its total matches its rate.
 */
export function MetricReasonsCard({
  orgSlug,
  metric,
}: {
  orgSlug: string;
  metric: ReasonMetric;
}) {
  const days = useDeliverabilityDays();
  const [tz, setTz] = React.useState<string | null>(null);
  React.useEffect(() => {
    setTz(browserTimeZone());
  }, []);
  const window: DrilldownWindow | null = React.useMemo(
    () =>
      tz === null
        ? null
        : parseDrilldownWindow(
            { days: String(days), day: null, tz },
            new Date()
          ),
    [days, tz]
  );

  const query = useDrilldownReasons(orgSlug, metric, window);
  const [, setReview] = useQueryStates({
    list: reviewListParser,
    reason: reviewReasonParser,
  });

  /** Opens Addresses to review on the row's list, narrowed to its reason. */
  const showAddresses = (row: Row) => {
    if (row.kind === null) {
      return;
    }
    setReview({ list: row.kind, reason: row.label });
    document
      .getElementById(ADDRESSES_TO_REVIEW_ID)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const sends = useAnalyticsOverview(orgSlug, days).data?.totalSent ?? null;
  const copy = COPY[metric];

  const response = query.data;
  const total = response?.totalCount ?? null;
  const rate =
    total === null || sends === null || sends === 0
      ? "—"
      : `${((total / sends) * 100).toFixed(1)}% of sends`;

  let body: React.ReactNode;
  if (query.isError) {
    body = (
      <p className="text-muted-foreground text-sm">
        Could not load the {copy.noun} for this window.
      </p>
    );
  } else if (!response) {
    body = <Skeleton className="h-40 w-full" />;
  } else if (response.totalCount === 0) {
    body = <p className="text-muted-foreground text-sm">{copy.empty}</p>;
  } else {
    const rows = reasonRows(response.groups, response.otherCount, metric);
    const max = Math.max(1, ...rows.map((row) => row.count));
    body = (
      <>
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-3">
            <span className="font-semibold text-3xl tabular-nums leading-none">
              {response.totalCount.toLocaleString("en-US")}
            </span>
            <span className="font-mono text-muted-foreground text-sm tabular-nums">
              {rate}
            </span>
          </div>
        </div>

        {metric === "bounce" ? (
          <p className="text-sm">
            The receiving server rejected the email.{" "}
            <strong className="font-semibold">Hard</strong> means the address
            doesn't exist. <strong className="font-semibold">Soft</strong> means
            a temporary problem.
          </p>
        ) : null}

        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              className="relative isolate flex flex-col gap-1.5"
              key={row.key}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {row.kind !== null && !row.other ? (
                    // The button's ::after covers the whole row, so the bar
                    // and count are part of the target too.
                    <button
                      aria-label={`Show addresses that bounced for ${row.label}`}
                      className="truncate text-left underline decoration-muted-foreground/40 underline-offset-4 after:absolute after:inset-0 after:z-10 hover:decoration-foreground focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      onClick={() => showAddresses(row)}
                      type="button"
                    >
                      {row.label}
                    </button>
                  ) : (
                    <span className="truncate">{row.label}</span>
                  )}
                  {row.kind === "hard" ? (
                    <Badge variant="destructive">hard</Badge>
                  ) : null}
                  {row.kind === "soft" ? (
                    <Badge variant="warning">soft</Badge>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums">
                  {row.count.toLocaleString("en-US")}
                </span>
              </div>
              <Meter
                aria-hidden="true"
                className="h-1"
                fillClass={barFill(row, metric)}
                fillPct={(row.count / max) * 100}
              />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section aria-label={copy.title} className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">{copy.title}</h2>
        <p className="text-muted-foreground text-sm">{copy.subtitle}</p>
      </div>
      <Panel
        className="@container/card"
        label={<PanelTitle level={3}>Top reasons</PanelTitle>}
      >
        <div className="space-y-5">
          {body}
          <p className="border-t pt-4 text-muted-foreground text-xs">
            {copy.footnote}
          </p>
        </div>
      </Panel>
    </section>
  );
}
