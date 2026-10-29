"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import Link from "next/link";
import { type ComponentProps, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  AttributionCounts,
  AttributionGroup,
} from "@/lib/analytics-drilldown-rank";
import type {
  DrilldownBy,
  DrilldownMetric,
} from "@/lib/analytics-drilldown-window";
import { formatThreshold, SES_THRESHOLDS } from "@/lib/ses-thresholds";
import { cn } from "@/lib/utils";

/** The bar column's header. It names the scale the bars are drawn against. */
function barHeading(metric: DrilldownMetric): string {
  if (metric === "suppression") {
    return "Share of max";
  }
  return `vs SES line (${formatThreshold(SES_THRESHOLDS[metric].review)})`;
}

/** The sentence under the table that explains the bar scale. */
function scaleNote(metric: DrilldownMetric): string {
  if (metric === "suppression") {
    return "Bars are relative to the highest rate in this table.";
  }
  const line = formatThreshold(SES_THRESHOLDS[metric].review);
  return `Each bar runs from 0 to twice the SES review line; the tick is the line itself (${line}). Bars turn amber past half the line and red at it.`;
}

const METRIC_NAME: Record<DrilldownMetric, string> = {
  bounce: "bounce",
  complaint: "complaint",
  suppression: "suppression",
};

export type RateTone = "success" | "warning" | "destructive" | "muted";

const TONE_FILL: Record<RateTone, string> = {
  success: "fill-success",
  warning: "fill-warning",
  destructive: "fill-destructive",
  muted: "fill-muted-foreground",
};

/** The SES review line for a metric in percent, or null for suppression. */
export function reviewPercentOf(metric: DrilldownMetric): number | null {
  if (metric === "suppression") {
    return null;
  }
  return Number((SES_THRESHOLDS[metric].review * 100).toFixed(3));
}

/**
 * Bar geometry for one rate. Bounce and complaint bars run to twice the review
 * line, with the review line at the middle. Suppression bars scale to the
 * largest rate in the table and always use the neutral tone.
 */
export function rateBar(
  metric: DrilldownMetric,
  rate: number | null,
  maxRate: number
): { fillPct: number; tone: RateTone; reviewTick: boolean } {
  const review = reviewPercentOf(metric);
  if (rate === null) {
    return { fillPct: 0, tone: "muted", reviewTick: review !== null };
  }
  if (review === null) {
    const fillPct = maxRate > 0 ? Math.min(rate / maxRate, 1) * 100 : 0;
    return { fillPct, tone: "muted", reviewTick: false };
  }
  const fillPct = Math.min(rate / (2 * review), 1) * 100;
  let tone: RateTone = "destructive";
  if (rate < review / 2) {
    tone = "success";
  } else if (rate < review) {
    tone = "warning";
  }
  return { fillPct, tone, reviewTick: true };
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** The tooltip sentence for a bar: the counts, the rate, and the line. */
function barTip(
  metric: DrilldownMetric,
  events: number,
  sent: number,
  rate: number | null
): string {
  const counted = `${formatCount(events)} of ${formatCount(sent)} sends`;
  const percent = rate === null ? "no rate" : `${rate.toFixed(2)}%`;
  if (metric === "suppression") {
    return `${counted} were suppressed (${percent}).`;
  }
  const verb = metric === "bounce" ? "bounced" : "received a complaint";
  const line = formatThreshold(SES_THRESHOLDS[metric].review);
  return `${counted} ${verb} (${percent}). SES reviews accounts at ${line}.`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

const NOUN: Record<DrilldownBy, string> = {
  broadcast: "broadcast",
  workflow: "workflow",
  template: "template",
  from: "from address",
};

type GroupTitle = { title: string; detail: string | null };

function groupTitle(by: DrilldownBy, group: AttributionGroup): GroupTitle {
  const sources =
    group.sourceTypes.length > 0
      ? `Sources: ${group.sourceTypes.join(", ")}`
      : null;
  if (by === "from") {
    return {
      title:
        group.key === null ? "No from address recorded" : (group.label ?? ""),
      detail: sources,
    };
  }
  const named: Record<
    Exclude<DrilldownBy, "from">,
    { untitled: string; none: string }
  > = {
    broadcast: { untitled: "Untitled broadcast", none: "Not from a broadcast" },
    workflow: { untitled: "Untitled workflow", none: "Not from a workflow" },
    template: { untitled: "Unnamed template", none: "No template" },
  };
  if (group.key === null) {
    return {
      title: named[by].none,
      detail: [`Includes sends whose ${NOUN[by]} was deleted.`, sources]
        .filter(Boolean)
        .join(" "),
    };
  }
  return {
    title: group.label ?? named[by].untitled,
    detail: sources,
  };
}

function groupLink(
  orgSlug: string,
  by: DrilldownBy,
  group: AttributionGroup,
  workflowLinks: boolean
): { href: string; label: string } | null {
  if (group.key === null) {
    return null;
  }
  if (by === "broadcast") {
    return {
      href: `/${orgSlug}/emails/broadcasts/${group.key}`,
      label: "Open broadcast",
    };
  }
  if (by === "template") {
    return {
      href: `/${orgSlug}/emails/templates/${group.key}`,
      label: "Open template",
    };
  }
  if (by === "workflow" && workflowLinks) {
    return {
      href: `/${orgSlug}/automations/${group.key}`,
      label: "Open workflow",
    };
  }
  return null;
}

/** The accessible text for one bar: the group, the rate, and the review line. */
function barLabel(
  name: string,
  metric: DrilldownMetric,
  rate: number | null
): string {
  const noun = METRIC_NAME[metric];
  if (rate === null) {
    return `${name} has no ${noun} rate`;
  }
  const value = Number(rate.toFixed(2));
  const review = reviewPercentOf(metric);
  return review === null
    ? `${name} ${noun} rate ${value} percent`
    : `${name} ${noun} rate ${value} percent, SES review line ${review} percent`;
}

/**
 * A horizontal meter. The fill is an SVG rect whose width is an attribute, so
 * no inline style is needed. The track and tones are theme tokens.
 */
export function Meter({
  fillPct,
  fillClass,
  reviewTick = false,
  ...rest
}: {
  fillPct: number;
  fillClass: string;
  reviewTick?: boolean;
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      {...rest}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        rest.className
      )}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 1"
      >
        <rect className={fillClass} height="1" width={fillPct} />
      </svg>
      {reviewTick ? (
        <div className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground" />
      ) : null}
    </div>
  );
}

function RateBar({
  name,
  metric,
  events,
  sent,
  rate,
  maxRate,
}: {
  name: string;
  metric: DrilldownMetric;
  events: number;
  sent: number;
  rate: number | null;
  maxRate: number;
}) {
  const { fillPct, tone, reviewTick } = rateBar(metric, rate, maxRate);
  const tip = barTip(metric, events, sent, rate);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block w-full">
            <Meter
              aria-label={`${barLabel(name, metric, rate)}. ${tip}`}
              fillClass={TONE_FILL[tone]}
              fillPct={fillPct}
              reviewTick={reviewTick}
              role="img"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function BarRows({
  orgSlug,
  by,
  metric,
  groups,
  maxRate,
  workflowLinks,
  muted,
}: {
  orgSlug: string;
  by: DrilldownBy;
  metric: DrilldownMetric;
  groups: AttributionGroup[];
  maxRate: number;
  workflowLinks: boolean;
  muted: boolean;
}) {
  return (
    <TableBody>
      {groups.map((group) => {
        const { title, detail } = groupTitle(by, group);
        const link = groupLink(orgSlug, by, group, workflowLinks);
        return (
          <TableRow
            className={muted ? "text-muted-foreground" : undefined}
            key={`${muted ? "below" : "ranked"}-${group.key ?? "none"}`}
          >
            <TableCell className="whitespace-normal">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{title}</span>
                {detail ? (
                  <span className="text-muted-foreground text-xs">
                    {detail}
                  </span>
                ) : null}
                {link ? (
                  <Link
                    className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatCount(group.sent)}
            </TableCell>
            <TableCell>
              <RateBar
                events={group.events}
                maxRate={maxRate}
                metric={metric}
                name={title}
                rate={group.rate}
                sent={group.sent}
              />
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              <div>{formatPercent(group.rate)}</div>
              <div className="text-muted-foreground text-xs">
                {`${formatCount(group.events)} of ${formatCount(group.sent)}`}
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
}

export type RateBarTableProps = {
  orgSlug: string;
  by: DrilldownBy;
  metric: DrilldownMetric;
  floor: number;
  workflowLinks: boolean;
  ranked: AttributionGroup[];
  belowFloor: AttributionGroup[];
  belowFloorOpen: boolean;
  omitted: AttributionCounts & { groups: number };
  /** The totals sentence. It captions the ranked table. */
  caption: string;
};

/**
 * What's driving the rate, one row per group: the group, its sends, a bar
 * against the SES review line, and its rate. Below-floor groups follow the
 * ranked ones, muted and behind a disclosure.
 */
export function RateBarTable({
  orgSlug,
  by,
  metric,
  floor,
  workflowLinks,
  ranked,
  belowFloor,
  belowFloorOpen,
  omitted,
  caption,
}: RateBarTableProps) {
  const [showBelow, setShowBelow] = useState(belowFloorOpen);
  const maxRate = Math.max(
    0,
    ...[...ranked, ...belowFloor].map((group) => group.rate ?? 0)
  );
  const header = (
    <TableHeader>
      <TableRow>
        <TableHead>Group</TableHead>
        <TableHead className="text-right">Sends</TableHead>
        <TableHead>{barHeading(metric)}</TableHead>
        <TableHead className="text-right">Rate</TableHead>
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="flex flex-col gap-6">
      {ranked.length > 0 ? (
        <Table>
          <caption className="caption-top mb-3 text-left text-sm">
            {caption}
          </caption>
          {header}
          <BarRows
            by={by}
            groups={ranked}
            maxRate={maxRate}
            metric={metric}
            muted={false}
            orgSlug={orgSlug}
            workflowLinks={workflowLinks}
          />
        </Table>
      ) : (
        <p className="text-sm">{caption}</p>
      )}

      <p className="text-muted-foreground text-xs">{scaleNote(metric)}</p>

      {belowFloor.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              Under {formatCount(floor)} sends. Not ranked.
            </p>
            <Button
              aria-expanded={showBelow}
              onClick={() => setShowBelow((open) => !open)}
              size="sm"
              variant="outline"
            >
              {showBelow
                ? "Hide groups"
                : `Show ${formatCount(belowFloor.length)} groups`}
            </Button>
          </div>
          {showBelow ? (
            <Table>
              {header}
              <BarRows
                by={by}
                groups={belowFloor}
                maxRate={maxRate}
                metric={metric}
                muted
                orgSlug={orgSlug}
                workflowLinks={workflowLinks}
              />
            </Table>
          ) : null}
        </div>
      ) : null}

      {omitted.groups > 0 ? (
        <p className="text-muted-foreground text-sm">
          {formatCount(omitted.groups)} more groups not shown. They are included
          in the totals above.
        </p>
      ) : null}
    </div>
  );
}
