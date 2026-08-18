"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@wraps/ui/components/ui/badge";
import { Checkbox } from "@wraps/ui/components/ui/checkbox";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { captureEmailsRowOpened } from "../lib/analytics";
import { getEmailStatusConfig } from "../lib/status-config";
import {
  formatFullTimestamp,
  formatRelativeTimestamp,
  formatSentDate,
} from "../lib/timestamps";
import type { EmailListItem } from "../types";

export type EmailColumnsOptions = {
  orgSlug: string;
  /**
   * The list's own query string (`days`, `status`, `q`). Carried onto the detail
   * link so "Back to emails" returns to the view the message was opened from
   * (audit F8) - the back link used to be a bare list URL.
   */
  listQuery: string;
};

/**
 * A relative time that also states the exact one - in `title` for a pointer and
 * in the accessible name for a screen reader (audit F15). Incident work needs
 * the second, and the list used to make you open a message to get it.
 */
function Timestamp({
  className,
  format = formatRelativeTimestamp,
  timestamp,
}: {
  className?: string;
  format?: (timestamp: number) => string;
  timestamp: number;
}) {
  const absolute = formatFullTimestamp(timestamp);
  return (
    <time
      className={cn(className)}
      dateTime={new Date(timestamp).toISOString()}
      title={absolute}
    >
      {format(timestamp)}
      <span className="sr-only"> ({absolute})</span>
    </time>
  );
}

/**
 * Built per render rather than exported as a constant because the subject cell
 * needs the org slug and the current filters to build a real link (audit F7).
 */
export function createColumns({
  listQuery,
  orgSlug,
}: EmailColumnsOptions): ColumnDef<EmailListItem>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "to",
      accessorKey: "to",
      header: () => <div>To</div>,
      cell: ({ row }) => {
        const recipients = row.original.to;
        return (
          <div className="font-mono text-sm">
            {recipients.length > 0 ? (
              <>
                {recipients[0]}
                {recipients.length > 1 && (
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    +{recipients.length - 1} other
                    {recipients.length > 2 ? "s" : ""}
                  </span>
                )}
              </>
            ) : (
              "(no recipients)"
            )}
          </div>
        );
      },
      // Server-driven order only (sent_at). A client sort here would reorder the
      // rows already fetched and present that as the order of the whole set.
      enableSorting: false,
    },
    {
      id: "subject",
      accessorKey: "subject",
      header: () => <div>Subject</div>,
      /**
       * The only keyboard path to a message (audit F7, WCAG 2.1.1 Level A).
       * Opening a message used to be an `onClick` on the `<tr>` with no
       * `tabIndex`, no `role` and no key handler, and no cell rendered a link -
       * so a keyboard or screen-reader user could filter, sort and export this
       * table but could not open a single row. A real link also gets
       * middle-click and cmd-click into a new tab, which row triage wants.
       */
      cell: ({ row }) => (
        <div className="max-w-[400px]">
          <Link
            className="block truncate rounded-sm outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            href={`/${orgSlug}/emails/${row.original.id}${listQuery ? `?${listQuery}` : ""}`}
            onClick={(event) => {
              // The row's own handler would navigate a second time.
              event.stopPropagation();
              captureEmailsRowOpened({
                position: row.index,
                status: row.original.status,
              });
            }}
          >
            {row.original.subject}
          </Link>
          <div className="text-muted-foreground text-xs">
            Sent{" "}
            <Timestamp
              format={formatSentDate}
              timestamp={row.original.sentAt}
            />
          </div>
        </div>
      ),
      enableSorting: false,
    },
    {
      id: "status",
      accessorKey: "status",
      header: () => <div>Status</div>,
      cell: ({ row }) => {
        // Total in the status string: an unrecognised value renders neutral
        // rather than blanking the table on an undefined icon (audit F12).
        const config = getEmailStatusConfig(row.original.status);
        const Icon = config.icon;

        return (
          <Badge
            className={cn(config.tone.surface, config.tone.text)}
            variant="outline"
          >
            <Icon className="mr-1 h-3 w-3" />
            {config.label}
          </Badge>
        );
      },
      enableSorting: false,
    },
    {
      id: "lastActivityAt",
      accessorKey: "lastActivityAt",
      header: () => <div>Activity</div>,
      cell: ({ row }) => (
        <Timestamp
          className="text-muted-foreground text-sm"
          timestamp={row.original.lastActivityAt}
        />
      ),
      enableSorting: false,
    },
  ];
}
