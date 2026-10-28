"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@wraps/ui/components/ui/badge";
import { AlertTriangle, MailWarning } from "lucide-react";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { SuppressionRow } from "../types";
import { RemoveSuppressionButton } from "./remove-suppression-button";

function formatLastUpdated(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function buildColumns(
  organizationId: string,
  onOpenAddress: (row: SuppressionRow) => void
): ColumnDef<SuppressionRow>[] {
  return [
    {
      id: "email",
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Address" />
      ),
      // The address is the only target that opens the detail. The row itself
      // is not clickable, so the Unsuppress button keeps its own behaviour.
      cell: ({ row }) => (
        <button
          className="break-all text-left font-mono text-primary text-sm underline-offset-4 hover:underline"
          onClick={() => onOpenAddress(row.original)}
          type="button"
        >
          {row.original.email}
        </button>
      ),
      meta: {
        label: "Address",
        placeholder: "Search addresses",
        variant: "text",
      },
      enableColumnFilter: true,
    },
    {
      id: "reason",
      accessorKey: "reason",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Reason" />
      ),
      cell: ({ row }) => {
        const { reason } = row.original;
        if (reason === "COMPLAINT") {
          return (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Complaint
            </Badge>
          );
        }
        return (
          <Badge variant="warning">
            <MailWarning className="mr-1 h-3 w-3" />
            Bounce
          </Badge>
        );
      },
      filterFn: (row, _id, value) => value.includes(row.getValue("reason")),
      meta: {
        label: "Reason",
        variant: "multiSelect",
        options: [
          { label: "Bounce", value: "BOUNCE" },
          { label: "Complaint", value: "COMPLAINT" },
        ],
      },
      enableColumnFilter: true,
    },
    {
      id: "lastUpdated",
      accessorKey: "lastUpdated",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Last Updated" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatLastUpdated(row.original.lastUpdated)}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RemoveSuppressionButton
            awsAccountId={row.original.awsAccountId}
            email={row.original.email}
            organizationId={organizationId}
            reason={row.original.reason}
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
