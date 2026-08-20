"use client";

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { Checkbox } from "@wraps/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { Label } from "@wraps/ui/components/ui/label";
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
import {
  Download,
  Loader2,
  Plus,
  Search,
  Tags,
  Trash2,
  Upload,
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
  createContact,
  deleteContact,
  updateContact,
} from "@/actions/contacts";
import { bulkDeleteContacts } from "@/actions/contacts-bulk";
import {
  bulkSubscribeContactsToTopics,
  bulkUnsubscribeContactsFromTopics,
  subscribeContactToTopics,
  unsubscribeContactFromTopics,
} from "@/actions/contacts-topics";
import { exportAllContacts } from "@/actions/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  type ContactStatus,
  type ContactWithMeta,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUSES,
  type EmailStatus,
  type SmsStatus,
} from "@/lib/contacts";
import { contactCSVColumns } from "@/lib/csv-columns";
import { exportTableToCSV } from "@/lib/csv-export";
import type { TopicWithMeta } from "@/lib/topics";
import { createColumns } from "./columns";
import { ContactDetailsSheet } from "./contact-details-sheet";
import { ContactFormDialog } from "./contact-form-dialog";
import { ImportContactsDialog } from "./import-contacts-dialog";
import {
  captureContactDeleted,
  captureContactDetailOpened,
  captureContactsBulkDeleted,
  captureContactsExportedCsv,
  captureContactsFilterChanged,
  captureContactsImportStarted,
  captureContactTopicSubscribed,
  captureContactTopicUnsubscribed,
  captureContactUpdated,
} from "./lib/analytics";
import { useContactsSearchTelemetry } from "./lib/use-contacts-search-telemetry";

/** Matches `/emails`' debounce (audit F8) — one request per settled pause in typing, not per keystroke. */
const SEARCH_COMMIT_DELAY_MS = 400;
/** A 1-character term has no useful selectivity against `contact.email`, which has no trigram index (audit F8). */
const MIN_SEARCH_LENGTH = 2;
/** The sortable headers `columns.tsx` renders — kept in sync with it by hand, since it lives outside this file. */
const SORTABLE_FIELDS = new Set(["email", "emailsSent", "createdAt"]);

type ContactsTableProps = {
  contacts: ContactWithMeta[];
  orgSlug: string;
  organizationId: string;
  page: number;
  pageSize: number;
  proFeaturesEnabled?: boolean;
  topics: TopicWithMeta[];
  total: number;
  userRole: string;
};

export function ContactsTable({
  contacts,
  orgSlug,
  organizationId,
  page,
  pageSize,
  proFeaturesEnabled = true,
  topics,
  total,
  userRole,
}: ContactsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Table state. Sorting and paging are both server-driven (audit F14) — the
  // URL is the source of truth for sort the same way it already is for page,
  // pageSize, search, emailStatus, and topicId. There is deliberately no
  // getSortedRowModel/getFilteredRowModel here: those would sort or filter
  // only the current page's rows and present the result as if it covered all
  // `total` contacts, which is exactly the lie the memo flags.
  const sortByParam = searchParams.get("sortBy");
  const sortDirParam = searchParams.get("sortDir");
  const sorting: SortingState = SORTABLE_FIELDS.has(sortByParam ?? "")
    ? [{ id: sortByParam as string, desc: sortDirParam !== "asc" }]
    : [{ id: "createdAt", desc: true }];
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") || ""
  );
  const trimmedSearchInput = searchInput.trim();
  const searchTooShort =
    trimmedSearchInput.length > 0 &&
    trimmedSearchInput.length < MIN_SEARCH_LENGTH;

  // Ref for search input to enable keyboard shortcut
  const searchInputRef = useRef<HTMLInputElement>(null);

  /**
   * "/" focuses the search box (audit F22). This used to intercept Cmd/Ctrl+F
   * globally with an unconditional `preventDefault()`, which took away the
   * browser's own find-in-page — including while a dialog or the contact
   * detail sheet was open — and the `<Kbd>` badge showed the Mac glyph on
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
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [bulkSubscribeDialogOpen, setBulkSubscribeDialogOpen] = useState(false);
  const [bulkUnsubscribeDialogOpen, setBulkUnsubscribeDialogOpen] =
    useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [selectedContact, setSelectedContact] =
    useState<ContactWithMeta | null>(null);

  // URL-driven contact detail sheet: contactId in the URL is the source of truth
  const urlContactId = searchParams.get("contactId");

  // Sync selectedContact from table data when URL has a contactId
  const lastOpenedContactId = useRef<string | null>(null);
  useEffect(() => {
    if (!urlContactId) {
      lastOpenedContactId.current = null;
      return;
    }
    const existing = contacts.find((c) => c.id === urlContactId);
    if (existing) {
      setSelectedContact(existing);
    }
    setDetailsSheetOpen(true);
    // Fires once per contactId regardless of entry path - row click,
    // command palette, or a shared/direct link all land here (audit F16).
    if (lastOpenedContactId.current !== urlContactId) {
      lastOpenedContactId.current = urlContactId;
      captureContactDetailOpened();
    }
  }, [urlContactId, contacts]);

  useContactsSearchTelemetry({
    contactCount: contacts.length,
    search: searchParams.get("search"),
    total,
  });

  const openContactDetail = useCallback(
    (contact: ContactWithMeta) => {
      setSelectedContact(contact);
      setDetailsSheetOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.set("contactId", contact.id);
      router.replace(`/${orgSlug}/contacts?${params.toString()}`, {
        scroll: false,
      });
    },
    [router, orgSlug, searchParams]
  );

  const closeContactDetail = useCallback(() => {
    setDetailsSheetOpen(false);
    setSelectedContact(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("contactId");
    const qs = params.toString();
    router.replace(`/${orgSlug}/contacts${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
  }, [router, orgSlug, searchParams]);

  // Navigation helpers
  const updateSearchParams = useCallback(
    (
      updates: Record<string, string | undefined>,
      mode: "push" | "replace" = "push"
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const href = `/${orgSlug}/contacts?${params.toString()}`;
      if (mode === "replace") {
        // Typing must not push one history entry per settled keystroke — Back
        // should land on the pre-search view in one press (audit F8).
        router.replace(href, { scroll: false });
      } else {
        router.push(href);
      }
    },
    [router, orgSlug, searchParams]
  );

  /**
   * Commits the search box to the URL 400ms after typing stops, instead of on
   * every keystroke (audit F8) — each keystroke used to be a full RSC
   * round-trip and a fresh `ilike '%term%'` scan of `contact.email`. A term
   * under `MIN_SEARCH_LENGTH` is never committed; `searchTooShort` above
   * drives the inline hint until enough is typed.
   */
  const searchCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchCommitTimer.current) {
        clearTimeout(searchCommitTimer.current);
      }
    },
    []
  );

  const handleSearch = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchCommitTimer.current) {
        clearTimeout(searchCommitTimer.current);
      }
      searchCommitTimer.current = setTimeout(() => {
        const trimmed = value.trim();
        if (trimmed.length > 0 && trimmed.length < MIN_SEARCH_LENGTH) {
          return;
        }
        updateSearchParams(
          { search: trimmed || undefined, page: "1" },
          "replace"
        );
      }, SEARCH_COMMIT_DELAY_MS);
    },
    [updateSearchParams]
  );

  /**
   * Server-driven sort (audit F14). Pushes the clicked column into the URL
   * instead of sorting the current page's 50 rows client-side and presenting
   * that as sorted. `contacts-table.tsx` cannot itself apply the sort — that
   * happens in `listContactsWithRelations` (packages/db) via the `sort` param
   * this pushes as `sortBy`/`sortDir` — see the handoff note in this wave's
   * report for the two-file change needed in `page.tsx` and
   * `actions/contacts.ts` to complete the wiring.
   */
  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const [primary] = next;
      updateSearchParams({
        sortBy: primary?.id,
        sortDir: primary ? (primary.desc ? "desc" : "asc") : undefined,
        page: "1",
      });
    },
    [sorting, updateSearchParams]
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
        openContactDetail(contact);
      },
    }),
    [openContactDetail]
  );

  // Carried onto the email link in columns.tsx so opening a contact doesn't
  // drop the active search/status/topic/sort/page state (audit F9). Built
  // from the same searchParams openContactDetail already uses, minus
  // contactId since the link itself sets that.
  const contactsQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("contactId");
    return params.toString();
  }, [searchParams]);

  const baseColumns = useMemo(
    () => createColumns(columnActions, { orgSlug, contactsQuery }),
    [columnActions, orgSlug, contactsQuery]
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
    onSortingChange: handleSortingChange,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.ceil(total / pageSize),
    state: {
      sorting,
      columnVisibility,
      rowSelection,
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
    phone?: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    emailStatus?: EmailStatus;
    smsStatus?: SmsStatus;
    status?: ContactStatus;
    properties?: Record<string, unknown>;
    topicIds?: string[];
  }) => {
    if (!(data.email || data.phone)) {
      toast.error("Error", { description: "Email or phone is required" });
      return;
    }
    startTransition(async () => {
      const result = await createContact(organizationId, {
        email: data.email,
        phone: data.phone,
        firstName: data.firstName ?? undefined,
        lastName: data.lastName ?? undefined,
        company: data.company ?? undefined,
        jobTitle: data.jobTitle ?? undefined,
        emailStatus: data.emailStatus,
        smsStatus: data.smsStatus,
        status: data.status,
        properties: data.properties,
        topicIds: data.topicIds,
      });
      if (result.success) {
        toast.success("Contact created", {
          description: `${data.email ?? data.phone} has been added.`,
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
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    emailStatus?: EmailStatus;
    smsStatus?: SmsStatus;
    status?: ContactStatus;
    properties?: Record<string, unknown>;
    topicIds?: string[];
  }) => {
    if (!selectedContact) {
      return;
    }

    startTransition(async () => {
      // Update contact fields (email, phone, name, status, properties)
      const { topicIds, ...contactData } = data;
      const hasContactChanges =
        contactData.email !== undefined ||
        contactData.phone !== undefined ||
        contactData.firstName !== undefined ||
        contactData.lastName !== undefined ||
        contactData.company !== undefined ||
        contactData.jobTitle !== undefined ||
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
          captureContactTopicSubscribed({
            contact_count: 1,
            source: "single",
          });
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
          captureContactTopicUnsubscribed({
            contact_count: 1,
            source: "single",
          });
        }
      }

      captureContactUpdated({
        fields: Object.entries(contactData)
          .filter(([, v]) => v !== undefined)
          .map(([k]) => k),
        topics_changed: topicIds !== undefined,
      });
      toast.success("Contact updated", {
        description: "The contact has been updated.",
      });
      setEditDialogOpen(false);
      setDetailsSheetOpen(false);
      setSelectedContact(null);
      // router.refresh() triggers revalidation from revalidatePath in server action
      router.refresh();
    });
  };

  const handleDeleteContact = async () => {
    if (!selectedContact) {
      return;
    }

    startTransition(async () => {
      const result = await deleteContact(selectedContact.id, organizationId);
      if (result.success) {
        captureContactDeleted();
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
    if (selectedContactIds.length === 0 || !selectedTopicId) {
      return;
    }

    startTransition(async () => {
      const result = await bulkSubscribeContactsToTopics(
        organizationId,
        selectedContactIds,
        [selectedTopicId]
      );
      if (result.success) {
        captureContactTopicSubscribed({
          contact_count: result.count,
          source: "bulk",
        });
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
    if (selectedContactIds.length === 0 || !selectedTopicId) {
      return;
    }

    startTransition(async () => {
      const result = await bulkUnsubscribeContactsFromTopics(
        organizationId,
        selectedContactIds,
        [selectedTopicId]
      );
      if (result.success) {
        captureContactTopicUnsubscribed({
          contact_count: result.count,
          source: "bulk",
        });
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
    if (selectedContactIds.length === 0) {
      return;
    }

    startTransition(async () => {
      const result = await bulkDeleteContacts(
        organizationId,
        selectedContactIds
      );
      if (result.success) {
        captureContactsBulkDeleted({ count: result.count });
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
  const statusFilter = searchParams.get("emailStatus");
  const topicFilter = searchParams.get("topicId");

  return (
    <div className="w-full space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center space-x-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 pr-16"
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="Search by email (2+ characters)"
              ref={searchInputRef}
              value={searchInput}
            />
            <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 hidden sm:flex">
              /
            </Kbd>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Group: Status | Topic */}
          <div className="flex w-full sm:w-auto">
            <Select
              onValueChange={(value) => {
                captureContactsFilterChanged({
                  control: "email_status",
                  from: statusFilter || "all",
                  to: value,
                });
                updateSearchParams({
                  emailStatus: value === "all" ? undefined : value,
                  page: "1",
                });
              }}
              value={statusFilter || "all"}
            >
              <SelectTrigger
                className={
                  topics.length > 0
                    ? "min-w-0 flex-1 sm:flex-initial sm:w-[160px] rounded-r-none border-r-0 focus:z-10"
                    : "min-w-0 flex-1 sm:flex-initial sm:w-[160px] focus:z-10"
                }
              >
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {EMAIL_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {EMAIL_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {topics.length > 0 && (
              <Select
                onValueChange={(value) => {
                  captureContactsFilterChanged({
                    control: "topic",
                    from: topicFilter || "all",
                    to: value,
                  });
                  updateSearchParams({
                    topicId: value === "all" ? undefined : value,
                    page: "1",
                  });
                }}
                value={topicFilter || "all"}
              >
                <SelectTrigger className="min-w-0 flex-1 sm:flex-initial sm:w-[160px] rounded-l-none focus:z-10">
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
          </div>

          {/* Bulk Actions - shown when contacts are selected */}
          {selectedContactIds.length > 0 && canEdit && (
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

          {/* Action Group: Import | Export | Add Contact */}
          <div className="flex w-full sm:w-auto">
            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="rounded-r-none border-r-0 focus:z-10"
                    onClick={() => {
                      captureContactsImportStarted();
                      setImportDialogOpen(true);
                    }}
                    size="icon"
                    variant="outline"
                  >
                    <Upload className="h-4 w-4" />
                    <span className="sr-only">Import</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Import contacts</TooltipContent>
              </Tooltip>
            )}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className={
                        canEdit
                          ? "rounded-none border-r-0 focus:z-10"
                          : "rounded-r-none border-r-0 focus:z-10"
                      }
                      disabled={isExporting}
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
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Export as CSV</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                {selectedContactIds.length > 0 && (
                  <DropdownMenuItem
                    onClick={() => {
                      const rows = table
                        .getSelectedRowModel()
                        .rows.map((r) => r.original);
                      exportTableToCSV(
                        rows,
                        contactCSVColumns,
                        `contacts-${new Date().toISOString().slice(0, 10)}.csv`
                      );
                      captureContactsExportedCsv({
                        row_count: rows.length,
                        selection_only: true,
                        was_truncated: false,
                      });
                      toast.success(
                        `Exported ${rows.length} selected contacts to CSV`
                      );
                    }}
                  >
                    Export selected ({selectedContactIds.length})
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={async () => {
                    setIsExporting(true);
                    try {
                      const result = await exportAllContacts(organizationId, {
                        search: trimmedSearchInput || undefined,
                        emailStatus: (statusFilter as EmailStatus) || undefined,
                        topicId: topicFilter || undefined,
                      });
                      if (result.success) {
                        exportTableToCSV(
                          result.contacts,
                          contactCSVColumns,
                          `contacts-${new Date().toISOString().slice(0, 10)}.csv`
                        );
                        captureContactsExportedCsv({
                          row_count: result.contacts.length,
                          selection_only: false,
                          was_truncated: result.truncated,
                        });
                        // audit F23: the export used to report the truncated
                        // fetch's own length as "total", which reads as the
                        // whole match even when it silently dropped rows past
                        // MAX_EXPORT_ROWS. `total` is now the real matching
                        // count, so a truncated export says so explicitly.
                        if (result.truncated) {
                          toast.warning(
                            `Exported ${result.contacts.length} of ${result.total.toLocaleString()} matching contacts`,
                            {
                              description:
                                "This export is capped and left some contacts out. Narrow your filters to export the rest.",
                            }
                          );
                        } else {
                          toast.success(
                            `Exported ${result.contacts.length} contacts to CSV`
                          );
                        }
                      } else {
                        toast.error("Failed to export contacts");
                      }
                    } finally {
                      setIsExporting(false);
                    }
                  }}
                >
                  Export all
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canEdit && (
              <Button
                className="rounded-l-none focus:z-10"
                onClick={() => setCreateDialogOpen(true)}
                size="default"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Contact
              </Button>
            )}
          </div>
        </div>
      </div>

      {searchTooShort && (
        <p className="text-muted-foreground text-sm">
          Type at least {MIN_SEARCH_LENGTH} characters to search.
        </p>
      )}

      {/*
       * audit F23: bulk actions are page-scoped with no "select all N
       * matching" — deliberately not built this pass (it needs the bulk
       * mutation actions to accept a filter instead of an id list, which is
       * outside this file's ownership). This at least stops the selection
       * from silently implying more than it covers.
       */}
      {selectedContactIds.length > 0 &&
        selectedContactIds.length === contacts.length &&
        total > contacts.length && (
          <p className="text-muted-foreground text-sm">
            All {contacts.length} contacts on this page are selected — there is
            no "select all {total.toLocaleString()} matching" yet, so actions
            only apply to this page. Repeat on the other pages to cover
            everyone.
          </p>
        )}

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
                // audit F9 (WCAG 2.1.1, Level A): this row used to open only
                // on onClick with no keyboard path at all. It briefly grew
                // role="button" + tabIndex + onKeyDown, but that overrides
                // the <tr>'s implicit `row` role and breaks the table's
                // structure in the accessibility tree (WCAG 1.3.1) - a
                // screen-reader user navigating by table semantics loses the
                // row/cell relationships, and aria-label replaces the cells'
                // own content in announcement. The real fix, matching
                // /emails: a genuine <Link> in columns.tsx's email cell
                // (wired via contactsQuery/baseColumns above) carries
                // keyboard focus, Enter/Space activation, cmd-click, and
                // middle-click, while this row stays a plain <tr> with only a
                // mouse-click convenience handler. The Link's own onClick
                // calls stopPropagation so this handler doesn't
                // double-navigate.
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  data-state={row.getIsSelected() && "selected"}
                  key={row.id}
                  onClick={() => openContactDetail(row.original)}
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
        orgSlug={orgSlug}
        proFeaturesEnabled={proFeaturesEnabled}
        topics={topics}
      />

      {/* Edit Dialog */}
      <ContactFormDialog
        contact={selectedContact}
        isPending={isPending}
        mode="edit"
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setSelectedContact(null);
          }
        }}
        onSubmit={handleUpdateContact}
        open={editDialogOpen}
        orgSlug={orgSlug}
        proFeaturesEnabled={proFeaturesEnabled}
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
        contactId={urlContactId}
        isPending={isPending}
        onClose={closeContactDetail}
        onSave={handleUpdateContact}
        open={detailsSheetOpen}
        organizationId={organizationId}
        orgSlug={orgSlug}
        proFeaturesEnabled={proFeaturesEnabled}
        topics={topics}
        userRole={userRole}
      />

      {/* Bulk Subscribe Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setBulkSubscribeDialogOpen(open);
          if (!open) {
            setSelectedTopicId("");
          }
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
          if (!open) {
            setSelectedTopicId("");
          }
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

      {/* Import Contacts Dialog */}
      <ImportContactsDialog
        onImportComplete={() => router.refresh()}
        onOpenChange={setImportDialogOpen}
        open={importDialogOpen}
        organizationId={organizationId}
        topics={topics}
      />

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
