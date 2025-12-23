"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Mail, MoreHorizontal, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type ContactWithMeta,
  EMAIL_STATUS_COLORS,
  EMAIL_STATUS_LABELS,
  SMS_STATUS_COLORS,
  SMS_STATUS_LABELS,
} from "@/lib/contacts";

type ColumnActions = {
  onEdit: (contact: ContactWithMeta) => void;
  onDelete: (contact: ContactWithMeta) => void;
  onViewDetails: (contact: ContactWithMeta) => void;
};

export function createColumns(
  actions: ColumnActions
): ColumnDef<ContactWithMeta>[] {
  return [
    {
      accessorKey: "email",
      header: ({ column }) => (
        <Button
          className="-ml-4"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          variant="ghost"
        >
          Contact
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const email = row.original.email;
        const phone = row.original.phone;
        const emailStatus = row.original.emailStatus;
        const smsStatus = row.original.smsStatus;

        return (
          <div className="space-y-1">
            {email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{email}</span>
                {emailStatus && (
                  <Badge
                    className={`${EMAIL_STATUS_COLORS[emailStatus]} px-1.5 py-0 text-[10px]`}
                    variant="secondary"
                  >
                    {EMAIL_STATUS_LABELS[emailStatus]}
                  </Badge>
                )}
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground text-sm">{phone}</span>
                {smsStatus && (
                  <Badge
                    className={`${SMS_STATUS_COLORS[smsStatus]} px-1.5 py-0 text-[10px]`}
                    variant="secondary"
                  >
                    {SMS_STATUS_LABELS[smsStatus]}
                  </Badge>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "topics",
      header: "Topics",
      cell: ({ row }) => {
        const topics = row.original.topics || [];
        const subscribedTopics = topics.filter(
          (t) => t.status === "subscribed"
        );

        if (subscribedTopics.length === 0) {
          return <span className="text-muted-foreground">None</span>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {subscribedTopics.slice(0, 2).map((t) => (
              <Badge key={t.topicId} variant="outline">
                {t.topicName}
              </Badge>
            ))}
            {subscribedTopics.length > 2 && (
              <Badge variant="outline">+{subscribedTopics.length - 2}</Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "emailsSent",
      header: ({ column }) => (
        <Button
          className="-ml-4"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          variant="ghost"
        >
          Emails
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const sent = row.original.emailsSent;
        const opened = row.original.emailsOpened;
        const clicked = row.original.emailsClicked;

        if (sent === 0) {
          return <span className="text-muted-foreground">-</span>;
        }

        const openRate = ((opened / sent) * 100).toFixed(0);
        const clickRate = ((clicked / sent) * 100).toFixed(0);

        return (
          <div className="text-sm">
            <div>{sent} sent</div>
            <div className="text-muted-foreground text-xs">
              {openRate}% open, {clickRate}% click
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "smsSent",
      header: "SMS",
      cell: ({ row }) => {
        const sent = row.original.smsSent;
        const clicked = row.original.smsClicked;

        if (sent === 0) {
          return <span className="text-muted-foreground">-</span>;
        }

        const clickRate = ((clicked / sent) * 100).toFixed(0);

        return (
          <div className="text-sm">
            <div>{sent} sent</div>
            <div className="text-muted-foreground text-xs">
              {clickRate}% click
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          className="-ml-4"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          variant="ghost"
        >
          Created
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue("createdAt"));
        return (
          <div className="text-muted-foreground">
            {date.toLocaleDateString()}
          </div>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const contact = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button className="h-8 w-8 p-0" variant="ghost">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onViewDetails(contact);
                }}
              >
                View details
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onEdit(contact);
                }}
              >
                Edit contact
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onDelete(contact);
                }}
              >
                Delete contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
