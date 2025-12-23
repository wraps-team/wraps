"use client";

import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { Plus, Search, Tags, Trash2, Upload } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  bulkDeleteContacts,
  bulkSubscribeContactsToTopics,
  bulkUnsubscribeContactsFromTopics,
  createContact,
  deleteContact,
  subscribeContactToTopics,
  unsubscribeContactFromTopics,
  updateContact,
} from "@/actions/contacts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CONTACT_STATUS_LABELS,
  CONTACT_STATUSES,
  type ContactStatus,
  type ContactWithMeta,
  type EmailStatus,
  type SmsStatus,
} from "@/lib/contacts";
import type { TopicWithMeta } from "@/lib/topics";
import { createColumns } from "./columns";
import { ContactDetailsSheet } from "./contact-details-sheet";
import { ContactFormDialog } from "./contact-form-dialog";

type ContactsTableProps = {
  contacts: ContactWithMeta[];
  orgSlug: string;
  organizationId: string;
  page: number;
  pageSize: number;
  topics: TopicWithMeta[];
  total: number;
  userRole: "owner" | "admin" | "member";
};

export function ContactsTable({
  contacts,
  orgSlug,
  organizationId,
  page,
  pageSize,
  topics,
  total,
  userRole,
}: ContactsTableProps) {
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
  const [globalFilter, setGlobalFilter] = useState(
    searchParams.get("search") || ""
  );

  // Dialog/sheet state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [bulkSubscribeDialogOpen, setBulkSubscribeDialogOpen] = useState(false);
  const [bulkUnsubscribeDialogOpen, setBulkUnsubscribeDialogOpen] =
    useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [selectedContact, setSelectedContact] =
    useState<ContactWithMeta | null>(null);

  // Navigation helpers
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
      router.push(`/${orgSlug}/contacts?${params.toString()}`);
    },
    [router, orgSlug, searchParams]
  );

  const handleSearch = useCallback(
    (value: string) => {
      setGlobalFilter(value);
      updateSearchParams({ search: value || undefined, page: "1" });
    },
    [updateSearchParams]
  );

  // Column actions
  const columnActions = useMemo(
    () => ({
      onEdit: (contact: ContactWithMeta) => {
        setSelectedContact(contact);
        setEditDialogOpen(true);
      },
      onDelete: (contact: ContactWithMeta) => {
        setSelectedContact(contact);
        setDeleteDialogOpen(true);
      },
      onViewDetails: (contact: ContactWithMeta) => {
        setSelectedContact(contact);
        setDetailsSheetOpen(true);
      },
    }),
    []
  );

  const baseColumns = useMemo(
    () => createColumns(columnActions),
    [columnActions]
  );

  // Add selection column at the start
  const columns = useMemo(
    () => [
      {
        id: "select",
        header: ({
          table,
        }: {
          table: ReturnType<typeof useReactTable<ContactWithMeta>>;
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
            toggleSelected: (value?: boolean) => void;
          };
        }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...baseColumns,
    ],
    [baseColumns]
  );

  const table = useReactTable({
    data: contacts,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination: {
        pageIndex: page - 1,
        pageSize,
      },
    },
    getRowId: (row) => row.id,
  });

  // Get selected contact IDs
  const selectedContactIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  // Handlers
  const handleCreateContact = async (data: {
    email?: string;
    status?: ContactStatus;
    properties?: Record<string, unknown>;
    topicIds?: string[];
  }) => {
    if (!data.email) {
      toast.error("Error", { description: "Email is required" });
      return;
    }
    const email = data.email; // Narrow the type
    startTransition(async () => {
      const result = await createContact(organizationId, {
        email,
        status: data.status,
        properties: data.properties,
        topicIds: data.topicIds,
      });
      if (result.success) {
        toast.success("Contact created", {
          description: `${data.email} has been added.`,
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

  const handleUpdateContact = async (data: {
    email?: string;
    phone?: string;
    emailStatus?: EmailStatus;
    smsStatus?: SmsStatus;
    status?: ContactStatus;
    properties?: Record<string, unknown>;
    topicIds?: string[];
  }) => {
    if (!selectedContact) return;

    startTransition(async () => {
      // Update contact fields (email, phone, status, properties)
      const { topicIds, ...contactData } = data;
      const hasContactChanges =
        contactData.email !== undefined ||
        contactData.phone !== undefined ||
        contactData.emailStatus !== undefined ||
        contactData.smsStatus !== undefined ||
        contactData.status !== undefined ||
        contactData.properties !== undefined;

      if (hasContactChanges) {
        const result = await updateContact(
          selectedContact.id,
          organizationId,
          contactData
        );
        if (!result.success) {
          toast.error("Error", { description: result.error });
          return;
        }
      }

      // Handle topic subscription changes
      if (topicIds !== undefined) {
        const currentTopicIds = new Set(
          selectedContact.topics
            ?.filter((t) => t.status === "subscribed")
            .map((t) => t.topicId) || []
        );
        const newTopicIds = new Set(topicIds);

        // Find topics to subscribe to (in new but not in current)
        const toSubscribe = topicIds.filter((id) => !currentTopicIds.has(id));

        // Find topics to unsubscribe from (in current but not in new)
        const toUnsubscribe = [...currentTopicIds].filter(
          (id) => !newTopicIds.has(id)
        );

        if (toSubscribe.length > 0) {
          const subResult = await subscribeContactToTopics(
            selectedContact.id,
            organizationId,
            toSubscribe
          );
          if (!subResult.success) {
            toast.error("Error", { description: subResult.error });
            return;
          }
        }

        if (toUnsubscribe.length > 0) {
          const unsubResult = await unsubscribeContactFromTopics(
            selectedContact.id,
            organizationId,
            toUnsubscribe
          );
          if (!unsubResult.success) {
            toast.error("Error", { description: unsubResult.error });
            return;
          }
        }
      }

      toast.success("Contact updated", {
        description: "The contact has been updated.",
      });
      setEditDialogOpen(false);
      setDetailsSheetOpen(false);
      setSelectedContact(null);
      router.refresh();
    });
  };

  const handleDeleteContact = async () => {
    if (!selectedContact) return;

    startTransition(async () => {
      const result = await deleteContact(selectedContact.id, organizationId);
      if (result.success) {
        toast.success("Contact deleted", {
          description: "The contact has been removed.",
        });
        setDeleteDialogOpen(false);
        setSelectedContact(null);
        router.refresh();
      } else {
        toast.error("Error", {
          description: result.error,
        });
      }
    });
  };

  // Bulk action handlers
  const handleBulkSubscribe = async () => {
    if (selectedContactIds.length === 0 || !selectedTopicId) return;

    startTransition(async () => {
      const result = await bulkSubscribeContactsToTopics(
        organizationId,
        selectedContactIds,
        [selectedTopicId]
      );
      if (result.success) {
        toast.success("Contacts subscribed", {
          description: `${result.count} contacts subscribed to topic.`,
        });
        setBulkSubscribeDialogOpen(false);
        setSelectedTopicId("");
        setRowSelection({});
        router.refresh();
      } else {
        toast.error("Error", { description: result.error });
      }
    });
  };

  const handleBulkUnsubscribe = async () => {
    if (selectedContactIds.length === 0 || !selectedTopicId) return;

    startTransition(async () => {
      const result = await bulkUnsubscribeContactsFromTopics(
        organizationId,
        selectedContactIds,
        [selectedTopicId]
      );
      if (result.success) {
        toast.success("Contacts unsubscribed", {
          description: `${result.count} contacts unsubscribed from topic.`,
        });
        setBulkUnsubscribeDialogOpen(false);
        setSelectedTopicId("");
        setRowSelection({});
        router.refresh();
      } else {
        toast.error("Error", { description: result.error });
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedContactIds.length === 0) return;

    startTransition(async () => {
      const result = await bulkDeleteContacts(
        organizationId,
        selectedContactIds
      );
      if (result.success) {
        toast.success("Contacts deleted", {
          description: `${result.count} contact${result.count === 1 ? "" : "s"} deleted.`,
        });
        setBulkDeleteDialogOpen(false);
        setRowSelection({});
        router.refresh();
      } else {
        toast.error("Error", { description: result.error });
      }
    });
  };

  const canEdit = userRole === "owner" || userRole === "admin";
  const statusFilter = searchParams.get("status");
  const topicFilter = searchParams.get("topicId");

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
              placeholder="Search by email..."
              value={globalFilter}
            />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Status Filter */}
          <Select
            onValueChange={(value) => {
              updateSearchParams({
                status: value === "all" ? undefined : value,
                page: "1",
              });
            }}
            value={statusFilter || "all"}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {CONTACT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {CONTACT_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Topic Filter */}
          {topics.length > 0 && (
            <Select
              onValueChange={(value) => {
                updateSearchParams({
                  topicId: value === "all" ? undefined : value,
                  page: "1",
                });
              }}
              value={topicFilter || "all"}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Topics" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Topics</SelectItem>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    {topic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Bulk Actions - shown when contacts are selected */}
          {canEdit && selectedContactIds.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Tags className="mr-2 h-4 w-4" />
                  Actions ({selectedContactIds.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {topics.length > 0 && (
                  <>
                    <DropdownMenuItem
                      onClick={() => setBulkSubscribeDialogOpen(true)}
                    >
                      Subscribe to topic
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setBulkUnsubscribeDialogOpen(true)}
                    >
                      Unsubscribe from topic
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setBulkDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete contacts
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Import Button - placeholder */}
          {canEdit && (
            <Button size="sm" variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
          )}

          {/* Add Contact Button */}
          {canEdit && (
            <Button onClick={() => setCreateDialogOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
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
            {contacts.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  data-state={row.getIsSelected() && "selected"}
                  key={row.id}
                  onClick={() => {
                    setSelectedContact(row.original);
                    setDetailsSheetOpen(true);
                  }}
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
                    <p className="text-muted-foreground">No contacts found</p>
                    {canEdit && (
                      <Button
                        onClick={() => setCreateDialogOpen(true)}
                        size="sm"
                        variant="outline"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add your first contact
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
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex items-center space-x-2">
          <Label className="font-medium text-sm" htmlFor="page-size">
            Show
          </Label>
          <Select
            onValueChange={(value) => {
              updateSearchParams({ pageSize: value, page: "1" });
            }}
            value={`${pageSize}`}
          >
            <SelectTrigger className="w-20" id="page-size">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[20, 50, 100, 200].map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 text-center text-muted-foreground text-sm">
          Showing {contacts.length} of {total} contacts
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

      {/* Create Dialog */}
      <ContactFormDialog
        isPending={isPending}
        mode="create"
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateContact}
        open={createDialogOpen}
        topics={topics}
      />

      {/* Edit Dialog */}
      <ContactFormDialog
        contact={selectedContact}
        isPending={isPending}
        mode="edit"
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setSelectedContact(null);
        }}
        onSubmit={handleUpdateContact}
        open={editDialogOpen}
        topics={topics}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              {selectedContact?.email ||
                selectedContact?.phone ||
                "this contact"}
              ? This action cannot be undone.
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
              onClick={handleDeleteContact}
              variant="destructive"
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Sheet */}
      <ContactDetailsSheet
        contact={selectedContact}
        isPending={isPending}
        onClose={() => {
          setDetailsSheetOpen(false);
          setSelectedContact(null);
        }}
        onSave={handleUpdateContact}
        open={detailsSheetOpen}
        topics={topics}
        userRole={userRole}
      />

      {/* Bulk Subscribe Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setBulkSubscribeDialogOpen(open);
          if (!open) setSelectedTopicId("");
        }}
        open={bulkSubscribeDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subscribe to Topic</DialogTitle>
            <DialogDescription>
              Subscribe {selectedContactIds.length} selected contact
              {selectedContactIds.length === 1 ? "" : "s"} to a topic.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-subscribe-topic">Select topic</Label>
            <Select onValueChange={setSelectedTopicId} value={selectedTopicId}>
              <SelectTrigger className="mt-2" id="bulk-subscribe-topic">
                <SelectValue placeholder="Choose a topic" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    {topic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setBulkSubscribeDialogOpen(false);
                setSelectedTopicId("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending || !selectedTopicId}
              onClick={handleBulkSubscribe}
            >
              {isPending ? "Subscribing..." : "Subscribe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Unsubscribe Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setBulkUnsubscribeDialogOpen(open);
          if (!open) setSelectedTopicId("");
        }}
        open={bulkUnsubscribeDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsubscribe from Topic</DialogTitle>
            <DialogDescription>
              Unsubscribe {selectedContactIds.length} selected contact
              {selectedContactIds.length === 1 ? "" : "s"} from a topic.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-unsubscribe-topic">Select topic</Label>
            <Select onValueChange={setSelectedTopicId} value={selectedTopicId}>
              <SelectTrigger className="mt-2" id="bulk-unsubscribe-topic">
                <SelectValue placeholder="Choose a topic" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    {topic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setBulkUnsubscribeDialogOpen(false);
                setSelectedTopicId("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending || !selectedTopicId}
              onClick={handleBulkUnsubscribe}
              variant="destructive"
            >
              {isPending ? "Unsubscribing..." : "Unsubscribe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog
        onOpenChange={setBulkDeleteDialogOpen}
        open={bulkDeleteDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contacts</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedContactIds.length}{" "}
              contact{selectedContactIds.length === 1 ? "" : "s"}? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setBulkDeleteDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending}
              onClick={handleBulkDelete}
              variant="destructive"
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
