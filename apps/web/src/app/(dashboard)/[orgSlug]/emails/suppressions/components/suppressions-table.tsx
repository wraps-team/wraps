"use client";

import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import { Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { listSuppressions } from "@/actions/suppressions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SuppressionRow } from "../types";
import { buildColumns } from "./columns";

type SuppressionsTableProps = {
  organizationId: string;
  initialRows: SuppressionRow[];
  initialHasMore: boolean;
  initialNextToken?: string;
};

export function SuppressionsTable({
  organizationId,
  initialRows,
  initialHasMore,
  initialNextToken,
}: SuppressionsTableProps) {
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextToken, setNextToken] = useState(initialNextToken);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo(() => buildColumns(organizationId), [organizationId]);

  const handleLoadMore = () => {
    setLoadMoreError(null);
    startTransition(async () => {
      const result = await listSuppressions(organizationId, {
        startToken: nextToken,
      });
      if (result.success) {
        setRows((prev) => [
          ...prev,
          ...result.page.entries.map((entry) => ({
            email: entry.email,
            reason: entry.reason,
            lastUpdated: entry.lastUpdated,
            awsAccountId: entry.awsAccountId,
            region: entry.region,
          })),
        ]);
        setHasMore(result.page.hasMore);
        setNextToken(result.page.nextToken);
      } else {
        setLoadMoreError(result.error);
      }
    });
  };

  const table = useReactTable({
    data: rows,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = String(filterValue).toLowerCase();
      return row.original.email.toLowerCase().includes(search);
    },
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    getRowId: (row) => `${row.awsAccountId}:${row.email}`,
  });

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => setGlobalFilter(String(event.target.value))}
            placeholder="Search suppressed addresses"
            value={globalFilter}
          />
        </div>
      </div>

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
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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
                  <p className="text-muted-foreground">
                    No suppressed addresses match your search
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {loadMoreError ? (
        <p className="text-destructive text-sm">{loadMoreError}</p>
      ) : null}

      {hasMore ? (
        <div className="flex justify-center">
          <Button
            disabled={isPending}
            onClick={handleLoadMore}
            variant="outline"
          >
            {isPending ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
