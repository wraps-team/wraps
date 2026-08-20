"use client";

import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createSegment,
  deleteSegment,
  splitSegment,
  updateSegment,
} from "@/actions/segments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  type FilterCondition,
  MAX_SPLIT_PARTITIONS,
  type SegmentWithMeta,
} from "@/lib/segments";
import type { TopicWithMeta } from "@/lib/topics";
import { createColumns } from "./columns";
import {
  captureCreateSegmentOpened,
  captureSegmentCreated,
  captureSegmentDeleted,
  captureSegmentDetailOpened,
  captureSegmentSplit,
  captureSegmentUpdated,
  collectConditionFieldIds,
  countConditionFilters,
} from "./lib/analytics";
import { SegmentDetailsSheet } from "./segment-details-sheet";
import { SegmentFormDialog } from "./segment-form-dialog";

type SegmentsTableProps = {
  segments: SegmentWithMeta[];
  orgSlug: string;
  organizationId: string;
  propertyKeys: string[];
  topics: TopicWithMeta[];
  userRole: string;
};

export function SegmentsTable({
  segments,
  orgSlug,
  organizationId,
  propertyKeys,
  topics,
  userRole,
}: SegmentsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Table state
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");

  // Ref for search input to enable keyboard shortcut
  const searchInputRef = useRef<HTMLInputElement>(null);

  /**
   * "/" focuses the search box (audit F22). This used to intercept Cmd/Ctrl+F
   * globally with an unconditional `preventDefault()`, which took away the
   * browser's own find-in-page — including while a dialog or the segment
   * details sheet was open — and the `<Kbd>` badge showed the Mac glyph on
   * every platform. "/" is the convention `/emails` moved to; it collides
   * with nothing and needs no glyph.
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key !== "/" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.defaultPrevented
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }
      // Any open dialog or sheet owns the keyboard until it closes.
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Dialog/sheet state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [partitionCount, setPartitionCount] = useState("6");
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] =
    useState<SegmentWithMeta | null>(null);

  // Column actions
  const columnActions = useMemo(
    () => ({
      onEdit: (segment: SegmentWithMeta) => {
        setSelectedSegment(segment);
        setEditDialogOpen(true);
      },
      onSplit: (segment: SegmentWithMeta) => {
        setSelectedSegment(segment);
        setPartitionCount("6");
        setSplitDialogOpen(true);
      },
      onDelete: (segment: SegmentWithMeta) => {
        setSelectedSegment(segment);
        setDeleteDialogOpen(true);
      },
    }),
    []
  );

  const columns = useMemo(() => createColumns(columnActions), [columnActions]);

  const table = useReactTable({
    data: segments,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  });

  // Handlers
  const handleCreateSegment = async (data: {
    name: string;
    description?: string;
    condition: FilterCondition;
    trackMembership?: boolean;
  }) => {
    startTransition(async () => {
      const result = await createSegment(organizationId, data);
      if (result.success) {
        captureSegmentCreated({
          fields: collectConditionFieldIds(data.condition),
          filter_count: countConditionFilters(data.condition),
          track_membership: Boolean(data.trackMembership),
        });
        toast.success("Segment created", {
          description: `${data.name} has been created.`,
        });
        setCreateDialogOpen(false);
        router.refresh();
      } else {
        toast.error("Error", {
          description: result.error,
        });
      }
    });
  };

  const handleUpdateSegment = async (data: {
    name?: string;
    description?: string | null;
    condition?: FilterCondition;
    trackMembership?: boolean;
  }) => {
    if (!selectedSegment) {
      return;
    }

    startTransition(async () => {
      const result = await updateSegment(
        selectedSegment.id,
        organizationId,
        data
      );
      if (result.success) {
        captureSegmentUpdated({
          condition_changed: data.condition !== undefined,
          fields: Object.entries(data)
            .filter(([, v]) => v !== undefined)
            .map(([k]) => k),
        });
        toast.success("Segment updated", {
          description: "The segment has been updated.",
        });
        setEditDialogOpen(false);
        setSelectedSegment(null);
        router.refresh();
      } else {
        toast.error("Error", {
          description: result.error,
        });
      }
    });
  };

  const handleSplitSegment = async () => {
    if (!selectedSegment) {
      return;
    }

    const count = Number.parseInt(partitionCount, 10);
    if (!Number.isInteger(count) || count < 2 || count > MAX_SPLIT_PARTITIONS) {
      toast.error("Error", {
        description: `Choose between 2 and ${MAX_SPLIT_PARTITIONS} partitions.`,
      });
      return;
    }

    startTransition(async () => {
      const result = await splitSegment(
        selectedSegment.id,
        organizationId,
        count
      );
      if (result.success) {
        captureSegmentSplit({ partition_count: result.segments.length });
        const sizes = result.segments.map((s) => s.memberCount);
        toast.success(`Created ${result.segments.length} partitions`, {
          description: `Sizes range from ${Math.min(...sizes).toLocaleString()} to ${Math.max(...sizes).toLocaleString()} contacts.`,
        });
        setSplitDialogOpen(false);
        setSelectedSegment(null);
        router.refresh();
      } else {
        toast.error("Error", {
          description: result.error,
        });
      }
    });
  };

  const handleDeleteSegment = async () => {
    if (!selectedSegment) {
      return;
    }

    startTransition(async () => {
      const result = await deleteSegment(selectedSegment.id, organizationId);
      if (result.success) {
        captureSegmentDeleted();
        toast.success("Segment deleted", {
          description: "The segment has been removed.",
        });
        setDeleteDialogOpen(false);
        setSelectedSegment(null);
        router.refresh();
      } else {
        toast.error("Error", {
          description: result.error,
        });
      }
    });
  };

  const canEdit = userRole === "owner" || userRole === "admin";

  return (
    <div className="w-full space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center space-x-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 pr-16"
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="Search segments"
              ref={searchInputRef}
              value={globalFilter}
            />
            <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 hidden sm:flex">
              /
            </Kbd>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Add Segment Button */}
          {canEdit && (
            <Button
              onClick={() => {
                captureCreateSegmentOpened({ source: "toolbar" });
                setCreateDialogOpen(true);
              }}
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Segment
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
            {segments.length > 0 && table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => {
                const openDetails = () => {
                  captureSegmentDetailOpened();
                  setSelectedSegment(row.original);
                  setDetailsSheetOpen(true);
                };
                return (
                  // audit F9 (WCAG 2.1.1, Level A): this row opened a details
                  // sheet only on onClick, with no tabIndex, role, or key
                  // handler — mouse only. There is no URL for a segment to
                  // link to, so the row itself becomes the operable control.
                  // The e.target === e.currentTarget guard stops a keydown
                  // bubbling from the row's own "..." menu from re-triggering
                  // the row's own action.
                  <TableRow
                    aria-label={`View details for ${row.original.name}`}
                    className="cursor-pointer outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    data-state={row.getIsSelected() && "selected"}
                    key={row.id}
                    onClick={openDetails}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) {
                        return;
                      }
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetails();
                      }
                    }}
                    role="button"
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
                    <p className="text-muted-foreground">No segments found</p>
                    {canEdit && (
                      <Button
                        onClick={() => {
                          captureCreateSegmentOpened({
                            source: "empty_state",
                          });
                          setCreateDialogOpen(true);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create your first segment
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <SegmentFormDialog
        isPending={isPending}
        mode="create"
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateSegment}
        open={createDialogOpen}
        organizationId={organizationId}
        propertyKeys={propertyKeys}
        topics={topics}
      />

      {/* Edit Dialog */}
      <SegmentFormDialog
        isPending={isPending}
        mode="edit"
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setSelectedSegment(null);
          }
        }}
        onSubmit={handleUpdateSegment}
        open={editDialogOpen}
        organizationId={organizationId}
        propertyKeys={propertyKeys}
        segment={selectedSegment}
        topics={topics}
      />

      {/* Split Into Partitions Dialog */}
      <Dialog onOpenChange={setSplitDialogOpen} open={splitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Split into partitions</DialogTitle>
            <DialogDescription>
              Creates one new segment per partition, each with &quot;
              {selectedSegment?.name}&quot;&apos;s filters plus a partition
              filter. Every contact lands in exactly one partition, so you can
              send them as separate broadcasts without overlap.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="partition-count">Number of partitions</Label>
            <Input
              id="partition-count"
              max={MAX_SPLIT_PARTITIONS}
              min={2}
              onChange={(e) => setPartitionCount(e.target.value)}
              type="number"
              value={partitionCount}
            />
            {selectedSegment && selectedSegment.memberCount > 0 && (
              <p className="text-muted-foreground text-sm">
                Roughly{" "}
                {Math.round(
                  selectedSegment.memberCount /
                    Math.max(Number.parseInt(partitionCount, 10) || 1, 1)
                ).toLocaleString()}{" "}
                recipients each. Sizes vary slightly — partitions are even, not
                exact.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setSplitDialogOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={isPending} onClick={handleSplitSegment}>
              {isPending ? "Splitting..." : "Split segment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Segment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedSegment?.name}
              &quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setDeleteDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending}
              onClick={handleDeleteSegment}
              variant="destructive"
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Sheet */}
      <SegmentDetailsSheet
        canEdit={canEdit}
        onClose={() => {
          setDetailsSheetOpen(false);
          setSelectedSegment(null);
        }}
        onDelete={() => {
          setDetailsSheetOpen(false);
          setDeleteDialogOpen(true);
        }}
        onEdit={() => {
          setDetailsSheetOpen(false);
          setEditDialogOpen(true);
        }}
        open={detailsSheetOpen}
        organizationId={organizationId}
        segment={selectedSegment}
        topics={topics}
      />
    </div>
  );
}
