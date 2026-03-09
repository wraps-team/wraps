"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { ExecutionWithContact } from "@/actions/workflows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS,
} from "@/lib/workflows";

const STATUS_TABS = [
  { label: "All", value: undefined },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
] as const;

type ExecutionsTableProps = {
  executions: ExecutionWithContact[];
  total: number;
  workflowId: string;
  orgSlug: string;
};

function formatDuration(
  startedAt: Date | null,
  completedAt: Date | null
): string {
  if (!startedAt) return "-";
  const end = completedAt ? new Date(completedAt) : new Date();
  const ms = end.getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return "<1s";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

export function ExecutionsTable({
  executions,
  total,
  workflowId,
  orgSlug,
}: ExecutionsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentStatus = searchParams.get("status") ?? undefined;

  const setStatus = useCallback(
    (status: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (status) {
        params.set("status", status);
      } else {
        params.delete("status");
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const columns = useMemo(
    () => [
      {
        accessorKey: "contact",
        header: "Contact",
        cell: ({ row }: { row: { original: ExecutionWithContact } }) => {
          const c = row.original.contact;
          if (!c) {
            return (
              <span className="text-muted-foreground italic">
                Deleted contact
              </span>
            );
          }
          return (
            <div className="space-y-0.5">
              <div className="font-medium">
                {c.firstName || c.lastName
                  ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()
                  : (c.email ?? "Unknown")}
              </div>
              {(c.firstName || c.lastName) && c.email && (
                <div className="text-muted-foreground text-xs">{c.email}</div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: { row: { original: ExecutionWithContact } }) => {
          const status = row.original.status;
          return (
            <Badge
              className={EXECUTION_STATUS_COLORS[status]}
              variant="secondary"
            >
              {EXECUTION_STATUS_LABELS[status]}
            </Badge>
          );
        },
      },
      {
        accessorKey: "error",
        header: "Info",
        cell: ({ row }: { row: { original: ExecutionWithContact } }) => {
          const exec = row.original;
          if (exec.error) {
            return (
              <span className="max-w-[200px] truncate text-destructive text-sm">
                {exec.error}
              </span>
            );
          }
          return <span className="text-muted-foreground text-sm">-</span>;
        },
      },
      {
        accessorKey: "startedAt",
        header: "Started",
        cell: ({ row }: { row: { original: ExecutionWithContact } }) => {
          const date = row.original.startedAt;
          if (!date) return <span className="text-muted-foreground">-</span>;
          return (
            <span className="text-muted-foreground text-sm">
              {formatDistanceToNow(new Date(date), { addSuffix: true })}
            </span>
          );
        },
      },
      {
        accessorKey: "duration",
        header: "Duration",
        cell: ({ row }: { row: { original: ExecutionWithContact } }) => {
          const exec = row.original;
          const isActive =
            exec.status === "active" ||
            exec.status === "pending" ||
            exec.status === "paused" ||
            exec.status === "waiting";
          return (
            <span className="text-muted-foreground text-sm">
              {formatDuration(exec.startedAt, exec.completedAt)}
              {isActive && !exec.completedAt && " (in progress)"}
            </span>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: executions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div className="w-full space-y-4">
      {/* Back link + status filter tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/${orgSlug}/automations`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to automations
          </Link>
        </Button>

        <div className="flex items-center gap-1">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.label}
              onClick={() => setStatus(tab.value)}
              size="sm"
              variant={currentStatus === tab.value ? "secondary" : "ghost"}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {executions.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  key={row.id}
                  onClick={() =>
                    router.push(
                      `/${orgSlug}/automations/${workflowId}/executions/${row.original.id}`
                    )
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-32 text-center"
                  colSpan={columns.length}
                >
                  <div className="flex flex-col items-center gap-2">
                    <ListChecks className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">No executions yet</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-end py-4">
          <div className="text-muted-foreground text-sm">
            {total} execution{total !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
