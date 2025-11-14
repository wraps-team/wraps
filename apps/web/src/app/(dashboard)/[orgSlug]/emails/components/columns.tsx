"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  CheckCircle2,
  type Circle,
  Clock,
  Mail,
  MousePointerClick,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { EmailListItem, EmailStatus } from "../types";

const STATUS_CONFIG: Record<
  EmailStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
    icon: typeof Circle;
  }
> = {
  sent: {
    label: "Sent",
    variant: "secondary",
    className:
      "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
    icon: Clock,
  },
  delivered: {
    label: "Delivered",
    variant: "default",
    className:
      "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    icon: CheckCircle2,
  },
  opened: {
    label: "Opened",
    variant: "default",
    className:
      "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    icon: Mail,
  },
  clicked: {
    label: "Clicked",
    variant: "default",
    className:
      "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
    icon: MousePointerClick,
  },
  bounced: {
    label: "Bounced",
    variant: "default",
    className:
      "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    icon: XCircle,
  },
  complained: {
    label: "Complained",
    variant: "default",
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    icon: XCircle,
  },
  failed: {
    label: "Failed",
    variant: "default",
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    icon: XCircle,
  },
  rejected: {
    label: "Rejected",
    variant: "default",
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    icon: XCircle,
  },
  rendering_failure: {
    label: "Rendering Failed",
    variant: "default",
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    icon: XCircle,
  },
  delivery_delay: {
    label: "Delayed",
    variant: "secondary",
    className:
      "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    icon: Clock,
  },
};

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffInDays === 0) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (diffInDays === 1) {
    return "Yesterday";
  }
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export const columns: ColumnDef<EmailListItem>[] = [
  {
    id: "to",
    accessorKey: "to",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="To" />
    ),
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
    meta: {
      label: "Recipient",
      placeholder: "Search recipients...",
      variant: "text",
    },
    enableColumnFilter: true,
  },
  {
    id: "subject",
    accessorKey: "subject",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Subject" />
    ),
    cell: ({ row }) => (
      <div className="max-w-[400px] truncate">{row.original.subject}</div>
    ),
    meta: {
      label: "Subject",
      placeholder: "Search subjects...",
      variant: "text",
    },
    enableColumnFilter: true,
  },
  {
    id: "status",
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Status" />
    ),
    cell: ({ row }) => {
      const status = row.original.status;
      const config = STATUS_CONFIG[status];
      const Icon = config.icon;

      return (
        <Badge className={config.className} variant={config.variant}>
          <Icon className="mr-1 h-3 w-3" />
          {config.label}
        </Badge>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
    meta: {
      label: "Status",
      variant: "multiSelect",
      options: Object.entries(STATUS_CONFIG).map(([key, config]) => ({
        label: config.label,
        value: key,
      })),
    },
    enableColumnFilter: true,
    enableSorting: true,
  },
  {
    id: "engagement",
    accessorFn: (row) => ({
      hasOpened: row.hasOpened,
      hasClicked: row.hasClicked,
    }),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Engagement" />
    ),
    cell: ({ row }) => {
      const { hasOpened, hasClicked } = row.original;
      if (!(hasOpened || hasClicked)) {
        return <span className="text-muted-foreground text-sm">-</span>;
      }
      return (
        <div className="flex items-center gap-2">
          {hasOpened && (
            <Badge
              className="border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400"
              variant="outline"
            >
              <Mail className="mr-1 h-3 w-3" />
              Opened
            </Badge>
          )}
          {hasClicked && (
            <Badge
              className="border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-400"
              variant="outline"
            >
              <MousePointerClick className="mr-1 h-3 w-3" />
              Clicked
            </Badge>
          )}
        </div>
      );
    },
    enableColumnFilter: false,
    enableSorting: false,
  },
  {
    id: "sentAt",
    accessorKey: "sentAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Sent" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {formatTimestamp(row.original.sentAt)}
      </span>
    ),
    meta: {
      label: "Sent Date",
      variant: "dateRange",
    },
    enableColumnFilter: true,
    enableSorting: true,
  },
  {
    id: "eventCount",
    accessorKey: "eventCount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Events" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.eventCount}
      </span>
    ),
    enableColumnFilter: false,
    enableSorting: true,
  },
];
