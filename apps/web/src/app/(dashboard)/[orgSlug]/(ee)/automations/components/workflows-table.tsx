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
import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpDown,
  CheckCircle,
  Copy,
  ListChecks,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";
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
  deleteWorkflow,
  disableWorkflow,
  duplicateWorkflow,
  enableWorkflow,
  type WorkflowWithMeta,
} from "@/actions/workflows";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Kbd } from "@/components/ui/kbd";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getStepCount,
  getTriggerDescription,
  WORKFLOW_STATUS_COLORS,
  WORKFLOW_STATUS_LABELS,
} from "@/lib/workflows";
import { CreateWorkflowDialog } from "./create-workflow-dialog";

type WorkflowsTableProps = {
  workflows: WorkflowWithMeta[];
  total: number;
  organizationId: string;
  orgSlug: string;
  userRole: "owner" | "admin" | "member";
};

export function WorkflowsTable({
  workflows,
  total,
  organizationId,
  orgSlug,
  userRole,
}: WorkflowsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Table state
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState(
    searchParams.get("search") || ""
  );

  // Ref for search input to enable keyboard shortcut
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Cmd+F to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] =
    useState<WorkflowWithMeta | null>(null);

  const canManage = userRole === "owner" || userRole === "admin";

  const handleEnable = async (workflowId: string) => {
    startTransition(async () => {
      const result = await enableWorkflow(workflowId, organizationId);
      if (result.success) {
        toast.success("Workflow enabled");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDisable = async (workflowId: string) => {
    startTransition(async () => {
      const result = await disableWorkflow(workflowId, organizationId);
      if (result.success) {
        toast.success("Workflow paused");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDuplicate = async (workflowId: string) => {
    startTransition(async () => {
      const result = await duplicateWorkflow(workflowId, organizationId);
      if (result.success) {
        toast.success("Workflow duplicated");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDelete = async () => {
    if (!workflowToDelete) {
      return;
    }

    startTransition(async () => {
      const result = await deleteWorkflow(workflowToDelete.id, organizationId);
      if (result.success) {
        toast.success("Workflow deleted");
        setDeleteDialogOpen(false);
        setWorkflowToDelete(null);
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
      router.push(`/${orgSlug}/automations?${params.toString()}`);
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
        cell: ({ row }: { row: { original: WorkflowWithMeta } }) => {
          const wf = row.original;
          const stepCount = getStepCount(wf);
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{wf.name}</span>
              </div>
              <p className="max-w-[250px] truncate text-muted-foreground text-xs">
                {stepCount} step{stepCount !== 1 ? "s" : ""}
                {wf.description ? ` • ${wf.description}` : ""}
              </p>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: { row: { original: WorkflowWithMeta } }) => {
          const wf = row.original;
          const status = wf.status;
          return (
            <Badge
              className={WORKFLOW_STATUS_COLORS[status]}
              variant="secondary"
            >
              {status === "enabled" && <CheckCircle className="mr-1 h-3 w-3" />}
              {status === "paused" && <Pause className="mr-1 h-3 w-3" />}
              {WORKFLOW_STATUS_LABELS[status]}
            </Badge>
          );
        },
      },
      {
        accessorKey: "trigger",
        header: "Trigger",
        cell: ({ row }: { row: { original: WorkflowWithMeta } }) => {
          const wf = row.original;
          return (
            <div className="flex items-center gap-2 text-sm">
              <Zap className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[200px] truncate">
                {getTriggerDescription(wf)}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "stats",
        header: "Executions",
        cell: ({ row }: { row: { original: WorkflowWithMeta } }) => {
          const wf = row.original;

          if (wf.totalExecutions === 0) {
            return <span className="text-muted-foreground">-</span>;
          }

          return (
            <div className="text-sm">
              <span>{wf.totalExecutions.toLocaleString()} total</span>
              {wf.activeExecutions > 0 && (
                <span className="ml-2 text-blue-600">
                  {wf.activeExecutions} active
                </span>
              )}
              {wf.failedExecutions > 0 && (
                <span className="ml-2 text-destructive">
                  {wf.failedExecutions} failed
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "updatedAt",
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
            Updated
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }: { row: { original: WorkflowWithMeta } }) => {
          const date = new Date(row.original.updatedAt);
          return (
            <div className="text-muted-foreground text-sm">
              {formatDistanceToNow(date, { addSuffix: true })}
            </div>
          );
        },
      },
      {
        id: "actions",
        cell: ({ row }: { row: { original: WorkflowWithMeta } }) => {
          const wf = row.original;
          const canEnable = wf.status === "draft" || wf.status === "paused";
          const canDisable = wf.status === "enabled";

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
                    router.push(`/${orgSlug}/automations/${wf.id}`);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit workflow
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/${orgSlug}/automations/${wf.id}/executions`);
                  }}
                >
                  <ListChecks className="mr-2 h-4 w-4" />
                  View executions
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDuplicate(wf.id);
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                {canManage && canEnable && (
                  <DropdownMenuItem
                    disabled={isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEnable(wf.id);
                    }}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Enable
                  </DropdownMenuItem>
                )}
                {canManage && canDisable && (
                  <DropdownMenuItem
                    disabled={isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisable(wf.id);
                    }}
                  >
                    <Pause className="mr-2 h-4 w-4" />
                    Pause
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      disabled={isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWorkflowToDelete(wf);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [
      canManage,
      isPending,
      orgSlug,
      router,
      handleDisable,
      handleDuplicate,
      handleEnable,
    ]
  );

  const table = useReactTable({
    data: workflows,
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
    <>
      <div className="w-full space-y-4">
        {/* Filters Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center space-x-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 pr-16"
                onChange={(event) => handleSearch(event.target.value)}
                placeholder="Search automations\u2026"
                ref={searchInputRef}
                value={globalFilter}
              />
              <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 hidden sm:flex">
                ⌘F
              </Kbd>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {canManage && (
              <Button onClick={() => setCreateDialogOpen(true)} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Automation
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
              {workflows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    key={row.id}
                    onClick={() =>
                      router.push(`/${orgSlug}/automations/${row.original.id}`)
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
                      <Workflow className="h-8 w-8 text-muted-foreground" />
                      <p className="text-muted-foreground">
                        No automations yet
                      </p>
                      {canManage && (
                        <Button
                          onClick={() => setCreateDialogOpen(true)}
                          size="sm"
                          variant="outline"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Create your first automation
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
        {workflows.length > 0 && (
          <div className="flex items-center justify-end space-x-2 py-4">
            <div className="flex-1 text-muted-foreground text-sm">
              {total} automation{total !== 1 ? "s" : ""}
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

      {/* Create Workflow Dialog */}
      <CreateWorkflowDialog
        onOpenChange={setCreateDialogOpen}
        open={createDialogOpen}
        organizationId={organizationId}
        orgSlug={orgSlug}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete automation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{workflowToDelete?.name}". This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
