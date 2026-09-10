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
  organizationId: string
): ColumnDef<SuppressionRow>[] {
  return [
    {
      id: "email",
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Address" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.email}</span>
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
            <Badge
              className="border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
              variant="outline"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              Complaint
            </Badge>
          );
        }
        return (
          <Badge
            className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            variant="outline"
          >
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
