"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Pencil, Split, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SegmentWithMeta } from "@/lib/segments";

type ColumnActions = {
  onEdit: (segment: SegmentWithMeta) => void;
  onSplit: (segment: SegmentWithMeta) => void;
  onDelete: (segment: SegmentWithMeta) => void;
};

export function createColumns(
  actions: ColumnActions
): ColumnDef<SegmentWithMeta>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const segment = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium">{segment.name}</span>
            {segment.description && (
              <span className="text-muted-foreground text-sm">
                {segment.description}
              </span>
            )}
          </div>
        );
      },
    },
    {
      // Counted live through the send path, so this is the number a broadcast
      // to the segment would go to — not the count of rows the filters match,
      // and not the cached `member_count` that used to sit here going stale.
      accessorKey: "memberCount",
      header: "Can be emailed",
      cell: ({ row }) => {
        const segment = row.original;
        return (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{segment.memberCount.toLocaleString()}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "condition",
      header: "Filters",
      cell: ({ row }) => {
        const segment = row.original;
        const filterCount = countFilters(segment.condition);
        return (
          <span className="text-muted-foreground">
            {filterCount} {filterCount === 1 ? "filter" : "filters"}
          </span>
        );
      },
    },
    // There is deliberately no "Last Updated" column any more. It rendered
    // `lastComputedAt` — the age of a cached count that no longer exists on
    // this screen — beside a number it did not describe.
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => {
        const segment = row.original;
        return (
          <span className="text-muted-foreground">
            {formatDistanceToNow(new Date(segment.createdAt), {
              addSuffix: true,
            })}
          </span>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const segment = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-8 w-8 p-0"
                onClick={(e) => e.stopPropagation()}
                variant="ghost"
              >
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onEdit(segment);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onSplit(segment);
                }}
              >
                <Split className="mr-2 h-4 w-4" />
                Split into partitions
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onDelete(segment);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}

// Helper to count total filters in a condition
function countFilters(condition: SegmentWithMeta["condition"]): number {
  let count = 0;
  for (const group of condition.groups) {
    count += group.filters.length;
    if (group.nested) {
      count += countFilters(group.nested);
    }
  }
  return count;
}
