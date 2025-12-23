"use client";

import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  CheckCircle,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelBatchSend } from "@/actions/batch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BATCH_STATUS_COLORS,
  BATCH_STATUS_LABELS,
  type BatchSendWithMeta,
  calculateProgress,
} from "@/lib/batch";

type BatchTableProps = {
  batches: BatchSendWithMeta[];
  organizationId: string;
  orgSlug: string;
  userRole: "owner" | "admin" | "member";
};

export function BatchTable({
  batches,
  organizationId,
  orgSlug,
  userRole,
}: BatchTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Table state
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState(
    searchParams.get("search") || ""
  );

  const canManage = userRole === "owner" || userRole === "admin";

  const handleCancel = async (batchId: string) => {
    startTransition(async () => {
      const result = await cancelBatchSend(batchId, organizationId);
      if (result.success) {
        toast.success("Broadcast cancelled");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const updateSearchParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.push(`/${orgSlug}/send?${params.toString()}`);
    },
    [router, orgSlug, searchParams]
  );

  const handleSearch = useCallback(
    (value: string) => {
      setGlobalFilter(value);
      updateSearchParams({ search: value || undefined });
    },
    [updateSearchParams]
  );

  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({
          column,
        }: {
          column: {
            toggleSorting: (desc: boolean) => void;
            getIsSorted: () => string | false;
          };
        }) => (
          <Button
            className="-ml-4"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            variant="ghost"
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }: { row: { original: BatchSendWithMeta } }) => {
          const batch = row.original;
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {batch.channel === "email" ? (
                  <Mail className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">{batch.name || "Untitled"}</span>
              </div>
              {batch.subject && (
                <p className="max-w-[250px] truncate text-muted-foreground text-xs">
                  {batch.subject}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: { row: { original: BatchSendWithMeta } }) => {
          const status = row.original.status;
          return (
            <Badge className={BATCH_STATUS_COLORS[status]} variant="secondary">
              {status === "processing" && (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              )}
              {status === "completed" && (
                <CheckCircle className="mr-1 h-3 w-3" />
              )}
              {status === "failed" && <XCircle className="mr-1 h-3 w-3" />}
              {status === "queued" && <Clock className="mr-1 h-3 w-3" />}
              {BATCH_STATUS_LABELS[status]}
            </Badge>
          );
        },
      },
      {
        accessorKey: "progress",
        header: "Progress",
        cell: ({ row }: { row: { original: BatchSendWithMeta } }) => {
          const batch = row.original;
          const progress = calculateProgress(batch);

          if (batch.status === "draft") {
            return <span className="text-muted-foreground">-</span>;
          }

          return (
            <div className="w-[120px] space-y-1">
              <Progress className="h-2" value={progress} />
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>{batch.processedRecipients}</span>
                <span>{batch.totalRecipients}</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "stats",
        header: "Stats",
        cell: ({ row }: { row: { original: BatchSendWithMeta } }) => {
          const batch = row.original;

          if (batch.sent === 0) {
            return <span className="text-muted-foreground">-</span>;
          }

          const openRate =
            batch.delivered > 0
              ? Math.round((batch.opened / batch.delivered) * 100)
              : 0;
          const clickRate =
            batch.delivered > 0
              ? Math.round((batch.clicked / batch.delivered) * 100)
              : 0;

          return (
            <div className="text-sm">
              <div className="flex gap-2">
                <span>{batch.sent} sent</span>
                {batch.failed > 0 && (
                  <span className="text-destructive">
                    {batch.failed} failed
                  </span>
                )}
              </div>
              {batch.channel === "email" && batch.delivered > 0 && (
                <div className="text-muted-foreground text-xs">
                  {openRate}% opened, {clickRate}% clicked
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: ({
          column,
        }: {
          column: {
            toggleSorting: (desc: boolean) => void;
            getIsSorted: () => string | false;
          };
        }) => (
          <Button
            className="-ml-4"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            variant="ghost"
          >
            Created
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }: { row: { getValue: (key: string) => Date } }) => {
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
        cell: ({ row }: { row: { original: BatchSendWithMeta } }) => {
          const batch = row.original;
          const canCancel =
            canManage &&
            (batch.status === "queued" || batch.status === "processing");

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-8 w-8 p-0" variant="ghost">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => router.push(`/${orgSlug}/send/${batch.id}`)}
                >
                  View details
                </DropdownMenuItem>
                {canCancel && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      disabled={isPending}
                      onClick={() => handleCancel(batch.id)}
                    >
                      Cancel send
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [canManage, isPending, orgSlug, router]
  );

  const table = useReactTable({
    data: batches,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    getRowId: (row) => row.id,
  });

  return (
    <div className="w-full space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center space-x-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="Search broadcasts..."
              value={globalFilter}
            />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {canManage && (
            <Button asChild size="sm">
              <Link href={`/${orgSlug}/send/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Broadcast
              </Link>
            </Button>
          )}
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
            {batches.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  key={row.id}
                  onClick={() =>
                    router.push(`/${orgSlug}/send/${row.original.id}`)
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
                    <Mail className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">No broadcasts yet</p>
                    {canManage && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/${orgSlug}/send/new`}>
                          <Plus className="mr-2 h-4 w-4" />
                          Create your first broadcast
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {batches.length > 0 && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="flex-1 text-muted-foreground text-sm">
            {table.getFilteredRowModel().rows.length} broadcast(s)
          </div>
          <div className="flex items-center space-x-2">
            <Button
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              size="sm"
              variant="outline"
            >
              Previous
            </Button>
            <Button
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              size="sm"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
