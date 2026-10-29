"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import { type ReactNode, useState } from "react";
import {
  listProblemAddresses,
  type ProblemAddressRowResult,
} from "@/actions/address-detail";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useActiveOrganization } from "@/contexts/organization-context";
import type { DrilldownMetric } from "@/lib/analytics-drilldown-window";
import { AddressDetailSheet } from "../../../components/address-detail-sheet";
import { formatFullTimestamp } from "../../../lib/timestamps";
import type {
  DrilldownTab,
  DrilldownTabProps,
} from "../../../deliverability/tabs/tab-contract";

// The count column the metric points at. Ranking does not change with metric.
const METRIC_COLUMN: Record<
  DrilldownMetric,
  "complaints" | "bounces" | "suppressed"
> = {
  bounce: "bounces",
  complaint: "complaints",
  suppression: "suppressed",
};

type AddressesResponse = {
  rows: ProblemAddressRowResult[];
  totals: { complaints: number; bounces: number; suppressed: number };
  uniqueAddresses: number;
};

function countLine(totals: AddressesResponse["totals"]): string {
  return `${totals.complaints} complaints · ${totals.bounces} bounces · ${totals.suppressed} suppressed`;
}

function addressCountLine(data: AddressesResponse): string {
  if (data.uniqueAddresses > data.rows.length) {
    return `Showing top ${data.rows.length} of ${data.uniqueAddresses} addresses`;
  }
  return `${data.uniqueAddresses} addresses`;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function AddressesTab({ orgSlug, metric, window }: DrilldownTabProps) {
  const { activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? null;
  const [selected, setSelected] = useState<string | null>(null);
  const { days, day, tz } = window;

  const query = useQuery<AddressesResponse, Error>({
    // The key carries the window and the org, never an address. The query
    // cache reports its hash to Sentry on failure.
    queryKey: [
      "analytics",
      "drilldown",
      "addresses",
      organizationId,
      days,
      day,
      tz,
    ],
    enabled: organizationId !== null,
    queryFn: async () => {
      const result = await listProblemAddresses(organizationId ?? "", {
        days,
        day,
        tz,
      });
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
  });

  const highlighted = METRIC_COLUMN[metric];

  let body: ReactNode;
  if (query.isPending || organizationId === null) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Loading addresses</span>
        <Skeleton className="h-5 w-2/3" />
        {[0, 1, 2].map((row) => (
          <Skeleton className="h-10 w-full" key={row} />
        ))}
      </div>
    );
  } else if (query.isError || !query.data) {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Could not load addresses. Try again.
        </p>
        <div>
          <Button onClick={() => query.refetch()} size="sm" variant="outline">
            Try again
          </Button>
        </div>
      </div>
    );
  } else if (query.data.rows.length === 0) {
    body = (
      <Notice
        body="No addresses bounced, complained or were suppressed in this period."
        title="No problems in this window"
      />
    );
  } else {
    const data = query.data;
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 text-sm">
          <p>{countLine(data.totals)}</p>
          <p className="text-muted-foreground">{addressCountLine(data)}</p>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead
                  className={
                    highlighted === "complaints"
                      ? "font-semibold text-foreground"
                      : undefined
                  }
                >
                  Complaints
                </TableHead>
                <TableHead
                  className={
                    highlighted === "bounces"
                      ? "font-semibold text-foreground"
                      : undefined
                  }
                >
                  Bounces
                </TableHead>
                <TableHead
                  className={
                    highlighted === "suppressed"
                      ? "font-semibold text-foreground"
                      : undefined
                  }
                >
                  Suppressed
                </TableHead>
                <TableHead>Last problem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.address}>
                  <TableCell>
                    <button
                      className="break-all text-left font-mono text-primary text-sm underline-offset-4 hover:underline"
                      onClick={() => setSelected(row.address)}
                      type="button"
                    >
                      {row.address}
                    </button>
                  </TableCell>
                  <TableCell
                    className={
                      highlighted === "complaints" ? "font-semibold" : undefined
                    }
                  >
                    {row.complaints}
                  </TableCell>
                  <TableCell
                    className={
                      highlighted === "bounces" ? "font-semibold" : undefined
                    }
                  >
                    {row.bounces}
                  </TableCell>
                  <TableCell
                    className={
                      highlighted === "suppressed" ? "font-semibold" : undefined
                    }
                  >
                    {row.suppressed}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.lastProblemAt
                      ? formatFullTimestamp(
                          new Date(row.lastProblemAt).getTime()
                        )
                      : "Not recorded"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-medium text-sm">
        Addresses with problems in this window
      </h3>
      {body}
      {selected !== null && organizationId !== null ? (
        <AddressDetailSheet
          address={selected}
          key={selected}
          onClose={() => setSelected(null)}
          organizationId={organizationId}
          orgSlug={orgSlug}
          suppression={null}
        />
      ) : null}
    </div>
  );
}

const addressesTab = {
  id: "addresses",
  label: "Addresses",
  enabled: true,
  Component: AddressesTab,
} satisfies DrilldownTab;

export default addressesTab;
