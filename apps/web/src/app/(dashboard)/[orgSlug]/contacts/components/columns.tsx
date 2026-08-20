"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { ArrowUpDown, Mail, MoreHorizontal, Phone } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/shadcn-io/copy-button";
import {
  type ContactWithMeta,
  EMAIL_STATUS_COLORS,
  EMAIL_STATUS_LABELS,
  engagementRate,
  SMS_STATUS_COLORS,
  SMS_STATUS_LABELS,
} from "@/lib/contacts";

type ColumnActions = {
  onEdit: (contact: ContactWithMeta) => void;
  onDelete: (contact: ContactWithMeta) => void;
  onViewDetails: (contact: ContactWithMeta) => void;
};

type ColumnsOptions = {
  orgSlug: string;
  /**
   * The list's current filters as a query string (page, search, emailStatus,
   * topicId, sortBy, sortDir — everything except contactId), carried onto
   * the link so opening a contact doesn't drop them (matches the pattern
   * `/emails/components/columns.tsx` uses for `listQuery`).
   */
  contactsQuery: string;
};

export function createColumns(
  actions: ColumnActions,
  { orgSlug, contactsQuery }: ColumnsOptions
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
        const detailParams = new URLSearchParams(contactsQuery);
        detailParams.set("contactId", row.original.id);
        const detailHref = `/${orgSlug}/contacts?${detailParams.toString()}`;

        return (
          <div className="space-y-1">
            {email && (
              <div className="group flex items-center gap-2">
                <Mail className="h-3 w-3 text-muted-foreground" />
                {/*
                 * audit F9 (WCAG 2.1.1, Level A): the row itself used to be
                 * the only way in, mouse-only. A real link gets keyboard
                 * focus, Enter activation, cmd-click, and middle-click for
                 * free - the row's onClick (contacts-table.tsx) stays as a
                 * mouse-only convenience and would otherwise double-navigate,
                 * hence stopPropagation. `replace` matches openContactDetail's
                 * router.replace so opening contacts doesn't pile up history
                 * entries the way a plain Link push would.
                 */}
                <Link
                  className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  href={detailHref}
                  onClick={(e) => e.stopPropagation()}
                  replace
                >
                  {email}
                </Link>
                <CopyButton
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  content={email}
                  onClick={(e) => e.stopPropagation()}
                  size="sm"
                  variant="ghost"
                />
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

        const openRate = engagementRate(opened, sent);
        const clickRate = engagementRate(clicked, sent);

        return (
          <div className="text-sm">
            <div>{sent} sent</div>
            <div className="text-muted-foreground text-xs">
              {openRate === null || clickRate === null ? (
                `${opened} opened, ${clicked} clicked`
              ) : (
                <>
                  {openRate.toFixed(0)}% open, {clickRate.toFixed(0)}% click
                </>
              )}
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

        const clickRate = engagementRate(clicked, sent);

        return (
          <div className="text-sm">
            <div>{sent} sent</div>
            <div className="text-muted-foreground text-xs">
              {clickRate === null
                ? `${clicked} clicked`
                : `${clickRate.toFixed(0)}% click`}
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
