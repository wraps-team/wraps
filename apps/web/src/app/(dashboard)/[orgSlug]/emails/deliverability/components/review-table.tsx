"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import type { ReviewRow } from "@/actions/address-review";
import { Button } from "@/components/ui/button";
import {
  formatFullTimestamp,
  formatRelativeTimestamp,
} from "../../lib/timestamps";

type ReviewTableProps = {
  rows: ReviewRow[];
  list: "recommended" | "soft" | "hard" | "complaint";
  onOpen: (row: ReviewRow) => void;
  onSuppress: (row: ReviewRow) => void;
};

function eventsText(row: ReviewRow, list: ReviewTableProps["list"]): string {
  const parts: string[] = [];
  if (row.hard > 0) {
    parts.push(`Hard ${row.hard}`);
  }
  if (row.soft > 0) {
    parts.push(`Soft ${row.soft}`);
  }
  if (row.complaints > 0) {
    parts.push(`Complaints ${row.complaints}`);
  }
  if (list === "soft" && row.softDays > 0) {
    parts.push(
      `${row.softDays} soft-bounce ${row.softDays === 1 ? "day" : "days"}`
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * One review list as a plain table of at most 25 rows. A row opens the
 * address detail; the Suppress button stops propagation so it never opens it.
 */
export function ReviewTable({
  rows,
  list,
  onOpen,
  onSuppress,
}: ReviewTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Address</TableHead>
            <TableHead>Why</TableHead>
            <TableHead>Events</TableHead>
            <TableHead>Last event</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const last = row.lastEventAt ? Date.parse(row.lastEventAt) : null;
            return (
              <TableRow
                className="cursor-pointer"
                key={row.address}
                onClick={() => onOpen(row)}
              >
                <TableCell className="max-w-[24ch]">
                  <button
                    className="block max-w-full truncate text-left font-mono text-primary text-sm underline-offset-4 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(row);
                    }}
                    title={row.address}
                    type="button"
                  >
                    {row.address}
                  </button>
                </TableCell>
                <TableCell>
                  <p className="text-muted-foreground text-sm">{row.why}</p>
                  {row.status === "unknown" ? (
                    <p className="text-muted-foreground text-xs">
                      SES status unknown
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {eventsText(row, list)}
                </TableCell>
                <TableCell
                  className="text-sm"
                  title={last === null ? undefined : formatFullTimestamp(last)}
                >
                  {last === null ? "—" : formatRelativeTimestamp(last)}
                </TableCell>
                <TableCell className="text-right">
                  {row.status === "listed" ? (
                    <Badge variant="secondary">On SES list</Badge>
                  ) : (
                    <Button
                      aria-label={`Suppress ${row.address}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSuppress(row);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Suppress
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
