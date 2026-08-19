"use client";

import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wraps/ui/components/ui/alert-dialog";
import { Badge } from "@wraps/ui/components/ui/badge";
import { Checkbox } from "@wraps/ui/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { Progress } from "@wraps/ui/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarClock,
  CheckCircle,
  Clock,
  Copy,
  Download,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  cancelBatchSend,
  deleteDraftBatchSend,
  duplicateBatchSend,
} from "@/actions/batch";
import { exportAllBroadcasts } from "@/actions/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  BATCH_STATUS_COLORS,
  BATCH_STATUS_LABELS,
  BATCH_STATUSES,
  type BatchSendWithMeta,
  type BatchStatus,
  calculateProgress,
  getPausedPresentation,
  getStallPresentation,
  getZeroSendPresentation,
  isStaleDraft,
} from "@/lib/batch";
import { broadcastCSVColumns } from "@/lib/csv-columns";
import { exportTableToCSV } from "@/lib/csv-export";

type BatchTableProps = {
  batches: BatchSendWithMeta[];
  organizationId: string;
  orgSlug: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  total: number;
  userRole: string;
};

export function BatchTable({
  batches,
  organizationId,
  orgSlug,
  page,
  pageSize,
  search,
  status,
  total,
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
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // Controlled search input only — search is server-side (see updateSearchParams
  // below), so this no longer feeds a client-side table filter.
  const [searchInput, setSearchInput] = useState(search ?? "");
  const [isExporting, setIsExporting] = useState(false);

  // Ref for search input to enable keyboard shortcut
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Cmd+F focuses the table search. Pressing it a second
  // time while the search box already has focus falls through to the browser's
  // own find — otherwise the page permanently takes ⌘F away with no escape.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        if (document.activeElement === searchInputRef.current) {
          return;
        }
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const canManage = userRole === "owner" || userRole === "admin";

  // Both destructive row actions are irreversible, so neither fires from the
  // menu directly — the menu arms this dialog and the dialog does the work.
  // The detail page has always guarded cancellation this way; the row menu
  // used to call the same server action with no confirmation at all.
  const [pendingDestructive, setPendingDestructive] = useState<{
    kind: "cancel" | "delete";
    batchId: string;
    name: string;
  } | null>(null);

  const runCancel = useCallback(
    (batchId: string) => {
      startTransition(async () => {
        const result = await cancelBatchSend(batchId, organizationId);
        if (result.success) {
          toast.success("Broadcast cancelled");
          router.refresh();
        } else {
          toast.error(result.error);
        }
      });
    },
    [organizationId, router]
  );

  const runDeleteDraft = useCallback(
    (batchId: string) => {
      startTransition(async () => {
        const result = await deleteDraftBatchSend(batchId, organizationId);
        if (result.success) {
          toast.success("Draft deleted");
          router.refresh();
        } else {
          toast.error(result.error);
        }
      });
    },
    [organizationId, router]
  );

  const confirmDestructive = useCallback(() => {
    if (!pendingDestructive) {
      return;
    }
    if (pendingDestructive.kind === "cancel") {
      runCancel(pendingDestructive.batchId);
    } else {
      runDeleteDraft(pendingDestructive.batchId);
    }
    setPendingDestructive(null);
  }, [pendingDestructive, runCancel, runDeleteDraft]);

  const handleDuplicate = useCallback(
    (batchId: string) => {
      startTransition(async () => {
        const result = await duplicateBatchSend(batchId, organizationId);
        if (result.success) {
          toast.success("Broadcast duplicated");
          router.push(`/${orgSlug}/emails/broadcasts/${result.batch.id}/edit`);
        } else {
          toast.error(result.error);
        }
      });
    },
    [organizationId, orgSlug, router]
  );

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
      router.push(`/${orgSlug}/emails/broadcasts?${params.toString()}`);
    },
    [router, orgSlug, searchParams]
  );

  // Debounce the search commit — pushing a route on every keystroke would
  // refetch on every character. Only pushes when the input actually differs
  // from the URL's current search value, so mount and unrelated param changes
  // (status, page) never trigger a redundant navigation.
  useEffect(() => {
    const currentSearch = searchParams.get("search") || "";
    if (searchInput === currentSearch) {
      return;
    }
    const timeoutId = setTimeout(() => {
      updateSearchParams({ search: searchInput || undefined, page: "1" });
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchInput, searchParams, updateSearchParams]);

  const handleStatusChange = useCallback(
    (value: string) => {
      updateSearchParams({
        status: value === "all" ? undefined : value,
        page: "1",
      });
    },
    [updateSearchParams]
  );

  const hasActiveFilters = !!(search || status);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    updateSearchParams({ search: undefined, status: undefined, page: "1" });
  }, [updateSearchParams]);

  const columns = useMemo(
    () => [
      {
        id: "select",
        header: ({
          table,
        }: {
          table: {
            getIsAllPageRowsSelected: () => boolean;
            getIsSomePageRowsSelected: () => boolean;
            toggleAllPageRowsSelected: (value: boolean) => void;
          };
        }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
          />
        ),
        cell: ({
          row,
        }: {
          row: {
            getIsSelected: () => boolean;
            toggleSelected: (value: boolean) => void;
          };
        }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
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
          const batch = row.original;
          const status = batch.status;
          const paused = getPausedPresentation(status, batch.pausedReason);
          const zeroSend = getZeroSendPresentation(status, batch.sent);
          const stall = getStallPresentation(batch);
          const presentation = paused ?? zeroSend;
          return (
            <div className="space-y-1">
              <Badge
                className={
                  presentation
                    ? presentation.color
                    : BATCH_STATUS_COLORS[status]
                }
                variant="secondary"
              >
                {/* A paused broadcast is not working — the spinner said it was. */}
                {status === "processing" && !paused && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                {status === "completed" && !zeroSend && (
                  <CheckCircle className="mr-1 h-3 w-3" />
                )}
                {status === "failed" && <XCircle className="mr-1 h-3 w-3" />}
                {status === "queued" && <Clock className="mr-1 h-3 w-3" />}
                {status === "scheduled" && (
                  <CalendarClock className="mr-1 h-3 w-3" />
                )}
                {presentation
                  ? presentation.label
                  : BATCH_STATUS_LABELS[status]}
              </Badge>
              {stall && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      className="bg-warning/15 text-warning"
                      variant="secondary"
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {stall.label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {stall.explanation}
                  </TooltipContent>
                </Tooltip>
              )}
              {status === "scheduled" && batch.scheduledFor && (
                <p className="text-muted-foreground text-xs">
                  {formatDistanceToNow(new Date(batch.scheduledFor), {
                    addSuffix: true,
                  })}
                </p>
              )}
              {isStaleDraft(batch) && (
                <p className="text-muted-foreground text-xs">
                  Untouched for {formatDistanceToNow(new Date(batch.createdAt))}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "progress",
        header: "Progress",
        cell: ({ row }: { row: { original: BatchSendWithMeta } }) => {
          const batch = row.original;
          const progress = calculateProgress(batch);

          // Drafts have no audience snapshot — nothing counts recipients until
          // the send is created — so there is no number to show. Scheduled
          // broadcasts DO carry one, and it is the blast radius of something
          // that will fire unattended, so it is the one that must be visible.
          if (batch.status === "draft") {
            return <span className="text-muted-foreground">Not counted</span>;
          }

          if (batch.status === "scheduled") {
            return (
              <span className="text-sm">
                {batch.totalRecipients.toLocaleString()} recipients
              </span>
            );
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
              <div>{date.toLocaleDateString()}</div>
              <div className="text-xs">
                {date.toLocaleTimeString(undefined, { timeStyle: "short" })}
              </div>
            </div>
          );
        },
      },
      {
        // Created date alone made same-day broadcasts indistinguishable and
        // made the default sort look arbitrary. This is the column that says
        // when each one actually sent, or when it is going to.
        id: "sentAt",
        header: "Sent / scheduled",
        cell: ({ row }: { row: { original: BatchSendWithMeta } }) => {
          const batch = row.original;
          const stamp =
            batch.status === "scheduled"
              ? batch.scheduledFor
              : (batch.startedAt ?? batch.completedAt);

          if (!stamp) {
            return <span className="text-muted-foreground">-</span>;
          }

          const date = new Date(stamp);
          return (
            <div className="text-muted-foreground">
              <div>{date.toLocaleDateString()}</div>
              <div className="text-xs">
                {date.toLocaleTimeString(undefined, { timeStyle: "short" })}
              </div>
            </div>
          );
        },
      },
      {
        id: "actions",
        cell: ({ row }: { row: { original: BatchSendWithMeta } }) => {
          const batch = row.original;
          const isDraft = batch.status === "draft";
          const canEditDraft = canManage && isDraft;
          const canCancel =
            canManage &&
            (batch.status === "scheduled" ||
              batch.status === "queued" ||
              batch.status === "processing");

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-8 w-8 p-0" variant="ghost">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isDraft ? (
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(
                        `/${orgSlug}/emails/broadcasts/${batch.id}/edit`
                      )
                    }
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Continue editing
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(`/${orgSlug}/emails/broadcasts/${batch.id}`)
                    }
                  >
                    View details
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={isPending}
                      onClick={() => handleDuplicate(batch.id)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                  </>
                )}
                {canEditDraft && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      disabled={isPending}
                      onClick={() =>
                        setPendingDestructive({
                          kind: "delete",
                          batchId: batch.id,
                          name: batch.name || "Untitled",
                        })
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete draft
                    </DropdownMenuItem>
                  </>
                )}
                {canCancel && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      disabled={isPending}
                      onClick={() =>
                        setPendingDestructive({
                          kind: "cancel",
                          batchId: batch.id,
                          name: batch.name || "Untitled",
                        })
                      }
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
    [canManage, isPending, orgSlug, router, handleDuplicate]
  );

  const table = useReactTable({
    data: batches,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination: {
        pageIndex: page - 1,
        pageSize,
      },
    },
    getRowId: (row) => row.id,
  });

  return (
    <div className="w-full space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 pr-16"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search broadcasts"
              ref={searchInputRef}
              value={searchInput}
            />
            <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 hidden sm:flex">
              ⌘F
            </Kbd>
          </div>
          <Select onValueChange={handleStatusChange} value={status || "all"}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {BATCH_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {BATCH_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button onClick={clearFilters} size="sm" variant="ghost">
              Clear filters
            </Button>
          )}
        </div>
        {/* Button Group: Export | New Broadcast */}
        <div className="flex w-full sm:w-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className={
                  canManage
                    ? "rounded-r-none border-r-0 focus:z-10"
                    : "focus:z-10"
                }
                disabled={isExporting}
                onClick={async () => {
                  setIsExporting(true);
                  try {
                    const selectedRows = table.getSelectedRowModel().rows;
                    if (selectedRows.length > 0) {
                      // Export selected rows as-is — the user picked them, so
                      // this is honest even though it is only the loaded page.
                      const rows = selectedRows.map((r) => r.original);
                      exportTableToCSV(
                        rows,
                        broadcastCSVColumns,
                        `broadcasts-${new Date().toISOString().slice(0, 10)}.csv`
                      );
                      toast.success(
                        `Exported ${rows.length} broadcasts to CSV`
                      );
                      return;
                    }

                    // Nothing selected: fetch everything matching the current
                    // filters server-side, so the export is never silently
                    // limited to the loaded page.
                    const result = await exportAllBroadcasts(organizationId, {
                      search,
                      status: status as BatchStatus | undefined,
                    });
                    if (result.success) {
                      exportTableToCSV(
                        result.batches,
                        broadcastCSVColumns,
                        `broadcasts-${new Date().toISOString().slice(0, 10)}.csv`
                      );
                      toast.success(
                        result.truncated
                          ? `Exported the first ${result.batches.length.toLocaleString()} of ${result.total.toLocaleString()} broadcasts`
                          : `Exported ${result.batches.length.toLocaleString()} broadcasts to CSV`
                      );
                    } else {
                      toast.error(result.error);
                    }
                  } finally {
                    setIsExporting(false);
                  }
                }}
                size="icon"
                variant="outline"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="sr-only">Export</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export as CSV</TooltipContent>
          </Tooltip>
          {canManage && (
            <Button
              asChild
              className="rounded-l-none focus:z-10"
              size="default"
            >
              <Link href={`/${orgSlug}/emails/broadcasts/new`}>
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
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => {
                const href =
                  row.original.status === "draft"
                    ? `/${orgSlug}/emails/broadcasts/${row.original.id}/edit`
                    : `/${orgSlug}/emails/broadcasts/${row.original.id}`;
                return (
                  <TableRow
                    aria-label={`Open ${row.original.name || "Untitled"}`}
                    className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
                    key={row.id}
                    onClick={() => router.push(href)}
                    onKeyDown={(event) => {
                      // Rows used to open on click only, so keyboard users had to
                      // route through the overflow menu to reach a broadcast.
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(href);
                      }
                    }}
                    role="link"
                    tabIndex={0}
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
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  className="h-32 text-center"
                  colSpan={columns.length}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Mail className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {hasActiveFilters
                        ? "No broadcasts match your filters"
                        : "No broadcasts yet"}
                    </p>
                    {hasActiveFilters ? (
                      <Button
                        onClick={clearFilters}
                        size="sm"
                        variant="outline"
                      >
                        Clear filters
                      </Button>
                    ) : (
                      canManage && (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/${orgSlug}/emails/broadcasts/new`}>
                            <Plus className="mr-2 h-4 w-4" />
                            Create your first broadcast
                          </Link>
                        </Button>
                      )
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingDestructive(null);
          }
        }}
        open={pendingDestructive !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDestructive?.kind === "cancel"
                ? "Cancel this broadcast?"
                : "Delete this draft?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDestructive?.kind === "cancel"
                ? `"${pendingDestructive.name}" will stop sending. Any emails that have already been sent cannot be recalled.`
                : `"${pendingDestructive?.name}" will be permanently deleted. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {pendingDestructive?.kind === "cancel"
                ? "Keep sending"
                : "Keep draft"}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmDestructive();
              }}
            >
              {pendingDestructive?.kind === "cancel"
                ? "Cancel send"
                : "Delete draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="flex-1 text-muted-foreground text-sm">
            Showing {batches.length} of {total} broadcast(s)
          </div>
          <div className="flex items-center space-x-2">
            <Button
              disabled={page <= 1}
              onClick={() => updateSearchParams({ page: `${page - 1}` })}
              size="sm"
              variant="outline"
            >
              Previous
            </Button>
            <div className="text-sm">
              Page {page} of {Math.ceil(total / pageSize) || 1}
            </div>
            <Button
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => updateSearchParams({ page: `${page + 1}` })}
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
