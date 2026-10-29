"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  AttributionCounts,
  AttributionGroup,
} from "@/lib/analytics-drilldown-rank";
import type {
  DrilldownBy,
  DrilldownMetric,
} from "@/lib/analytics-drilldown-window";

const EVENT_HEADING: Record<DrilldownMetric, string> = {
  bounce: "Bounced",
  complaint: "Complaints",
  suppression: "Suppressed",
};

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function excessLabel(excess: number): string {
  const magnitude = Math.abs(excess).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  if (excess > 0) {
    return `+${magnitude} above window rate`;
  }
  if (excess < 0) {
    return `${magnitude} below window rate`;
  }
  return "At window rate";
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

function GroupCells({
  orgSlug,
  by,
  group,
  workflowLinks,
}: {
  orgSlug: string;
  by: DrilldownBy;
  group: AttributionGroup;
  workflowLinks: boolean;
}) {
  const { title, detail } = groupTitle(by, group);
  const link = groupLink(orgSlug, by, group, workflowLinks);
  return (
    <>
      <TableCell className="whitespace-normal">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{title}</span>
          {detail ? (
            <span className="text-muted-foreground text-xs">{detail}</span>
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
      <TableCell className="text-right tabular-nums">
        {formatCount(group.sent)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCount(group.events)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatPercent(group.rate)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatPercent(group.share)}
      </TableCell>
    </>
  );
}

export type AttributionTableProps = {
  orgSlug: string;
  by: DrilldownBy;
  metric: DrilldownMetric;
  floor: number;
  workflowLinks: boolean;
  ranked: AttributionGroup[];
  belowFloor: AttributionGroup[];
  omitted: AttributionCounts & { groups: number };
  belowFloorOpen: boolean;
};

export function AttributionTable({
  orgSlug,
  by,
  metric,
  floor,
  workflowLinks,
  ranked,
  belowFloor,
  omitted,
  belowFloorOpen,
}: AttributionTableProps) {
  const [showBelow, setShowBelow] = useState(belowFloorOpen);
  const eventsHeading = EVENT_HEADING[metric];

  return (
    <div className="flex flex-col gap-6">
      {ranked.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">{eventsHeading}</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Share</TableHead>
              <TableHead>Compared with window rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((group) => (
              <TableRow key={`ranked-${group.key ?? "none"}`}>
                <GroupCells
                  by={by}
                  group={group}
                  orgSlug={orgSlug}
                  workflowLinks={workflowLinks}
                />
                <TableCell>{excessLabel(group.excess)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

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
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">{eventsHeading}</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {belowFloor.map((group) => (
                  <TableRow key={`below-${group.key ?? "none"}`}>
                    <GroupCells
                      by={by}
                      group={group}
                      orgSlug={orgSlug}
                      workflowLinks={workflowLinks}
                    />
                  </TableRow>
                ))}
              </TableBody>
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
