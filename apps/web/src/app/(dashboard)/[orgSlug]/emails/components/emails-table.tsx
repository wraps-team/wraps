"use client";

import {
  flexRender,
  getCoreRowModel,
  type RowSelectionState,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wraps/ui/components/ui/popover";
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
import { Download, Info, Loader2, Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkCreateContactsFromEmails } from "@/actions/contacts-bulk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { EMAIL_COVERAGE_EXPLAINER } from "@/lib/analytics-scope";
import { emailCSVColumns } from "@/lib/csv-columns";
import { exportTableToCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { fetchEmailsPage, useEmailsData } from "../hooks/use-emails";
import { useEmailsTelemetry } from "../hooks/use-emails-telemetry";
import {
  captureEmailsContactsCreated,
  captureEmailsErrorRetried,
  captureEmailsExported,
  captureEmailsFilterChanged,
  captureEmailsPageAdvanced,
  captureEmailsRowOpened,
} from "../lib/analytics";
import {
  EMAIL_EXPORT_ROW_CAP,
  EMAIL_LIST_MAX_PAGE_SIZE,
  EMAIL_LIST_PAGE_SIZE,
  EMAIL_SEARCH_MIN_LENGTH,
  type EmailListSort,
  isEmailListSort,
} from "../lib/list-query";
import { rangeLabel, resolveEmailsListState } from "../lib/list-state";
import type { EmailListItem } from "../types";
import { createColumns } from "./columns";
import { EmailsListState } from "./emails-list-state";
import { EmailsTableSkeletonRows } from "./emails-table-skeleton";
import { EmailFeedBanners } from "./event-feed-banners";
import { HistoryWindowNotice } from "./history-window-notice";

/** How long after the last keystroke the search term is committed to the URL. */
const SEARCH_COMMIT_DELAY_MS = 400;

type EmailsTableProps = {
  orgSlug: string;
  organizationId: string;
  days: number;
  /** Any email send on record, in any window. Separates the zero-states. */
  hasEverSent: boolean;
  /** `true` in the SES sandbox, `false` in production, `null` never scanned. */
  sandboxStatus: boolean | null;
  /** The `?q=` term, so a filtered view survives a reload and a share. */
  search?: string;
  /** The `?sort=` order. Anything but `asc` reads as the default, newest first. */
  sort?: string;
  status?: string;
};

export function EmailsTable({
  orgSlug,
  organizationId,
  days,
  hasEverSent,
  sandboxStatus,
  search: searchParam,
  sort: sortParam,
  status,
}: EmailsTableProps) {
  /**
   * The search term reaches the URL (audit F8). It used to be component state
   * only, so a filtered view could not be shared, bookmarked or survive a
   * reload - and an operator handing an incident to a colleague had nothing to
   * hand over. This is the box's live value; `committedSearch` below is the
   * settled one, and both are seeded from `?q=`.
   */
  const [searchInput, setSearchInput] = useState(searchParam ?? "");
  /**
   * The term the query is running. Kept alongside the URL rather than read back
   * off it so a search does not wait on a server round trip to start - the
   * navigation is how the view becomes shareable, not how it becomes filtered.
   */
  const [committedSearch, setCommittedSearch] = useState(
    (searchParam ?? "").trim()
  );
  const trimmedInput = searchInput.trim();

  // A one or two character term produces no trigrams, so the GIN indexes
  // cannot serve it and it degrades to a scan over every message the
  // organization ever sent. The request is not made (audit F13); the route
  // refuses it too, for anything that is not this client. Measured against the
  // box rather than the URL so the hint appears as you type.
  const searchTooShort =
    trimmedInput.length > 0 && trimmedInput.length < EMAIL_SEARCH_MIN_LENGTH;
  const search =
    committedSearch.length >= EMAIL_SEARCH_MIN_LENGTH
      ? committedSearch
      : undefined;

  /**
   * The order reaches the URL too (audit F8). It was `useState` only, so a
   * shared link, a bookmark, or Back from a message silently reset to newest
   * first while every other filter survived - the one control whose state was
   * not in the address bar. Read from the prop like `days` and `status`, so
   * there is one source of truth and no local copy to drift.
   */
  const sort: EmailListSort = isEmailListSort(sortParam) ? sortParam : "desc";

  const {
    emails,
    feed,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetching,
    isFetchingNextPage,
    isLoading,
    refetch,
    totalKnown,
    window,
  } = useEmailsData({ orgSlug, days, search, sort, status });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isExporting, setIsExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [createContactsDialogOpen, setCreateContactsDialogOpen] =
    useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  /**
   * Follows the URL when the change did not come from this component - browser
   * Back, or a shared link opened in place. Guarded by the last value we pushed
   * so our own debounced commit never overwrites keystrokes typed while the
   * navigation was in flight.
   */
  const lastPushedSearch = useRef(searchParam ?? "");
  useEffect(() => {
    const next = searchParam ?? "";
    if (next === lastPushedSearch.current) {
      return;
    }
    lastPushedSearch.current = next;
    setSearchInput(next);
    setCommittedSearch(next.trim());
  }, [searchParam]);

  /**
   * "/" focuses the search box (audit F13).
   *
   * This used to intercept Cmd/Ctrl+F globally with `preventDefault()`, which
   * took away the browser's own find - including while a dialog was open - and
   * advertised the Mac glyph on every platform. "/" is the established
   * convention for in-page search and collides with nothing.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.defaultPrevented
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }
      // Any open dialog owns the keyboard until it closes.
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  /**
   * Every filter the list is showing, as a query string. It is carried onto each
   * row's detail link so the detail page's "Back to emails" returns here rather
   * than to the default 7-day, all-status view (audit F8).
   */
  const listQuery = useMemo(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (status) {
      params.set("status", status);
    }
    if (committedSearch) {
      params.set("q", committedSearch);
    }
    if (sort !== "desc") {
      params.set("sort", sort);
    }
    return params.toString();
  }, [committedSearch, days, sort, status]);

  const tableColumns = useMemo(
    () => createColumns({ listQuery, orgSlug }),
    [listQuery, orgSlug]
  );

  const table = useReactTable({
    data: emails,
    columns: tableColumns,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    // Sorting, filtering and paging are all the server's. There is deliberately
    // no filtered row model: a client-side filter over one fetched page would
    // search 50 rows and present the result as the whole history. A client-side
    // sort has the same shape of lie - "the oldest of the newest 50" - and
    // client-side paging is what capped this list at a single window.
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    state: {
      columnVisibility,
      rowSelection,
    },
    getRowId: (row) => row.id,
  });

  /** The response carries this; the server-rendered prop is the fallback. */
  const orgHasSends = feed?.hasEverSent ?? hasEverSent;

  /**
   * Which of the four honest states the list is in (audit F1 + F6). Every one
   * of these used to render the same sentence: "No emails found / Try
   * adjusting the time range or send your first email".
   */
  const listState = resolveEmailsListState({
    days,
    hasEverSent: orgHasSends,
    isError,
    rowCount: emails.length,
    sandboxStatus,
    search,
    status,
  });

  useEmailsTelemetry({
    days,
    isFetching,
    isLoading,
    listState,
    rowCount: emails.length,
    search,
    status,
  });

  /** Rebuild the URL preserving every filter, not just the one being changed. */
  const pushFilters = (
    next: {
      days?: number;
      search?: string | null;
      sort?: EmailListSort;
      status?: string | null;
    },
    mode: "push" | "replace" = "push"
  ) => {
    const nextDays = next.days ?? days;
    const nextStatus = next.status === undefined ? status : next.status;
    const nextSearch =
      next.search === undefined ? committedSearch : next.search;
    const nextSort = next.sort ?? sort;
    const params = new URLSearchParams({ days: String(nextDays) });
    if (nextStatus) {
      params.set("status", nextStatus);
    }
    if (nextSearch) {
      params.set("q", nextSearch);
    }
    // The default is omitted so an ordinary shared link stays clean; only a
    // deliberate "oldest first" is worth spending a query parameter on.
    if (nextSort !== "desc") {
      params.set("sort", nextSort);
    }
    const href = `/${orgSlug}/emails?${params}`;
    if (mode === "replace") {
      // Typing must not push one history entry per settled keystroke.
      router.replace(href, { scroll: false });
    } else {
      router.push(href);
    }
  };

  /**
   * Commits the box to the URL 400ms after typing stops. Debounced by hand
   * rather than through `useDebouncedValue` so that clearing the filters can
   * cancel a pending commit - otherwise the term the user just cleared lands in
   * the URL a moment later.
   */
  const searchCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSearchCommit = () => {
    if (searchCommitTimer.current) {
      clearTimeout(searchCommitTimer.current);
      searchCommitTimer.current = null;
    }
  };
  useEffect(() => cancelSearchCommit, []);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    cancelSearchCommit();
    searchCommitTimer.current = setTimeout(() => {
      const trimmed = value.trim();
      lastPushedSearch.current = trimmed;
      setCommittedSearch(trimmed);
      pushFilters({ search: trimmed || null }, "replace");
    }, SEARCH_COMMIT_DELAY_MS);
  };

  const handleRetry = () => {
    captureEmailsErrorRetried({ surface: "table" });
    refetch();
  };

  const handleLoadMore = () => {
    captureEmailsPageAdvanced({
      has_more: hasNextPage,
      page_index: Math.ceil(emails.length / EMAIL_LIST_PAGE_SIZE) + 1,
      row_count: emails.length,
    });
    fetchNextPage();
  };

  // Get selected email IDs and extract unique recipient emails
  const selectedEmailIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const uniqueRecipientEmails = useMemo(() => {
    const recipientSet = new Set<string>();
    for (const emailId of selectedEmailIds) {
      const email = emails.find((e) => e.id === emailId);
      if (email?.to) {
        for (const recipient of email.to) {
          recipientSet.add(recipient.toLowerCase());
        }
      }
    }
    return [...recipientSet];
  }, [selectedEmailIds, emails]);

  const writeCSV = (rows: EmailListItem[], wasTruncated: boolean) => {
    exportTableToCSV(
      rows,
      emailCSVColumns,
      `emails-${new Date().toISOString().slice(0, 10)}.csv`
    );
    captureEmailsExported({
      row_count: rows.length,
      selection_only: false,
      was_truncated: wasTruncated,
    });
    if (rows.length > 0) {
      toast.success(`Exported ${rows.length} emails to CSV`);
    }
  };

  /**
   * Pages the cursor rather than exporting whatever happens to be on screen.
   * The old export shipped the fetched window - at most 100 rows - with a
   * success toast that named the truncated count as if it were the total.
   */
  const runFullExport = async () => {
    setExportDialogOpen(false);
    setIsExporting(true);
    try {
      const collected: EmailListItem[] = [];
      let cursor: string | null = null;
      let more = true;
      while (more && collected.length < EMAIL_EXPORT_ROW_CAP) {
        const page = await fetchEmailsPage(
          {
            days,
            limit: EMAIL_LIST_MAX_PAGE_SIZE,
            orgSlug,
            search,
            sort,
            status,
          },
          cursor
        );
        collected.push(...page.items);
        cursor = page.nextCursor;
        more = cursor !== null;
      }
      // The slice is defensive, not a truncation. `collected` grows in whole
      // pages of EMAIL_LIST_MAX_PAGE_SIZE and lands exactly on the cap, but
      // only while EMAIL_EXPORT_ROW_CAP stays a whole multiple of that page
      // size - see the invariant on EMAIL_EXPORT_ROW_CAP, pinned by
      // lib/__tests__/list-query.test.ts. Break it and this slice starts
      // dropping rows while `more` (was_truncated) still reads false.
      writeCSV(collected.slice(0, EMAIL_EXPORT_ROW_CAP), more);
    } catch (_error) {
      toast.error("Export failed", {
        description: "Wraps could not read the full result set. Try again.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportClick = () => {
    const selectedRows = table.getSelectedRowModel().rows;
    if (selectedRows.length > 0) {
      const rows = selectedRows.map((r) => r.original);
      exportTableToCSV(
        rows,
        emailCSVColumns,
        `emails-${new Date().toISOString().slice(0, 10)}.csv`
      );
      captureEmailsExported({
        row_count: rows.length,
        selection_only: true,
        was_truncated: false,
      });
      toast.success(`Exported ${rows.length} emails to CSV`);
      return;
    }

    // Everything matching the filters is already loaded, so there is no cap to
    // warn about and nothing to confirm.
    if (!hasNextPage && emails.length > 0) {
      writeCSV(emails, false);
      return;
    }

    setExportDialogOpen(true);
  };

  // Handler for bulk create contacts
  const handleCreateContacts = async () => {
    if (uniqueRecipientEmails.length === 0) {
      return;
    }

    startTransition(async () => {
      const result = await bulkCreateContactsFromEmails(
        organizationId,
        uniqueRecipientEmails
      );

      if (result.success) {
        const messages: string[] = [];
        if (result.created > 0) {
          messages.push(
            `Created ${result.created} contact${result.created === 1 ? "" : "s"}`
          );
        }
        if (result.skipped > 0) {
          messages.push(`${result.skipped} already existed`);
        }
        if (result.errors.length > 0) {
          messages.push(`${result.errors.length} failed`);
        }

        captureEmailsContactsCreated({
          created: result.created,
          failed: result.errors.length,
          recipient_count: uniqueRecipientEmails.length,
          skipped: result.skipped,
        });

        toast.success("Contacts created", {
          description: messages.join(", "),
        });
        setCreateContactsDialogOpen(false);
        setRowSelection({});
        router.refresh();
      } else {
        toast.error("Error", { description: result.error });
      }
    });
  };

  const rowCount = emails.length;
  const footerLabel = totalKnown
    ? `Showing 1-${rowCount} of ${rowCount}`
    : `Showing 1-${rowCount}`;

  return (
    <div className="w-full space-y-4">
      {/*
        The coverage caveat is real - mail this AWS account sent outside Wraps
        genuinely is not here - but it is reference material, not something to
        re-read on every visit, and as a paragraph it also stated the same 200
        characters the chart above used to state. Same disclosure the Activity
        card gives its reputation scope.
      */}
      <div className="flex items-center gap-1">
        <h2 className="font-semibold text-base">Messages</h2>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-label="What this list covers"
              className="-my-2 text-muted-foreground"
              size="icon-sm"
              variant="ghost"
            >
              <Info className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 text-sm">
            {EMAIL_COVERAGE_EXPLAINER}
          </PopoverContent>
        </Popover>
      </div>

      <EmailFeedBanners feed={feed} />
      <HistoryWindowNotice orgSlug={orgSlug} window={window} />

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search messages"
              className="pl-9 pr-16"
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={`Search ${rangeLabel(days)}`}
              ref={searchInputRef}
              value={searchInput}
            />
            <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 hidden sm:flex">
              /
            </Kbd>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Bulk Actions - shown when emails are selected */}
          {selectedEmailIds.length > 0 && (
            <Button
              onClick={() => setCreateContactsDialogOpen(true)}
              variant="outline"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Add to contacts ({uniqueRecipientEmails.length})
            </Button>
          )}

          {/*
            Button Group: Status | Sort | Export.

            No time range here. `?days` governs the chart and this list
            together, and it had two controls on one screen - this one and the
            range group in the Activity card header - roughly 500px apart, both
            writing the same parameter. One page-level filter, one place to set
            it; the search placeholder still names the window it is searching.
          */}
          <div className="flex w-full sm:w-auto">
            <Select
              onValueChange={(value) => {
                captureEmailsFilterChanged({
                  control: "status",
                  from: status ?? "all",
                  to: value,
                });
                pushFilters({ status: value === "all" ? null : value });
              }}
              value={status ?? "all"}
            >
              <SelectTrigger
                aria-label="Status filter"
                className="min-w-0 flex-1 sm:flex-initial sm:w-[140px] rounded-r-none border-r-0 focus:z-10"
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="opened">Opened</SelectItem>
                <SelectItem value="clicked">Clicked</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
                <SelectItem value="suppressed">Suppressed</SelectItem>
                <SelectItem value="complained">Complained</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => {
                captureEmailsFilterChanged({
                  control: "sort",
                  from: sort,
                  to: value,
                });
                pushFilters({ sort: value as EmailListSort });
              }}
              value={sort}
            >
              <SelectTrigger
                aria-label="Sort by sent date"
                className="min-w-0 flex-1 sm:flex-initial sm:w-[140px] rounded-none border-r-0 focus:z-10"
              >
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Newest first</SelectItem>
                <SelectItem value="asc">Oldest first</SelectItem>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="rounded-l-none focus:z-10"
                  disabled={isExporting}
                  onClick={handleExportClick}
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
          </div>
        </div>
      </div>

      {searchInput ? (
        <p className="text-muted-foreground text-sm">
          Matches recipient, subject, and sender within the selected range.
          {searchTooShort ? (
            <span className="text-foreground">
              {" "}
              Type at least {EMAIL_SEARCH_MIN_LENGTH} characters to search.
            </span>
          ) : null}
        </p>
      ) : null}

      {/* Table */}
      <div
        className={cn(
          "rounded-md border transition-opacity",
          isFetching && !(isLoading || isFetchingNextPage) && "opacity-60"
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  /*
                   * No `aria-sort` here on purpose. Order is server-driven on
                   * `sent_at` and chosen through the labelled Sort control in
                   * the toolbar, so no column header carries a sort state -
                   * annotating one would announce a control that does not exist.
                   */
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
            {isLoading ? (
              <EmailsTableSkeletonRows columnCount={tableColumns.length} />
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  data-state={row.getIsSelected() && "selected"}
                  key={row.id}
                  onClick={() => {
                    captureEmailsRowOpened({
                      position: row.index,
                      status: row.original.status,
                    });
                    router.push(
                      `/${orgSlug}/emails/${row.original.id}?${listQuery}`
                    );
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
              <TableRow className="hover:bg-transparent">
                <TableCell className="p-0" colSpan={tableColumns.length}>
                  <EmailsListState
                    days={days}
                    isRetrying={isFetching}
                    kind={listState === "ok" ? "empty-filtered" : listState}
                    onClearFilters={() => {
                      cancelSearchCommit();
                      setSearchInput("");
                      setCommittedSearch("");
                      lastPushedSearch.current = "";
                      pushFilters({ search: null, status: null });
                    }}
                    onRetry={handleRetry}
                    onWidenRange={(nextDays) => {
                      captureEmailsFilterChanged({
                        control: "days",
                        from: String(days),
                        to: String(nextDays),
                      });
                      pushFilters({ days: nextDays });
                    }}
                    orgSlug={orgSlug}
                    sandboxStatus={sandboxStatus}
                    search={search}
                    status={status}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer: a count of what is on screen, and the only way forward. */}
      {rowCount > 0 ? (
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="text-muted-foreground text-sm">{footerLabel}</div>
          {hasNextPage ? (
            <Button
              disabled={isFetchingNextPage}
              onClick={handleLoadMore}
              size="touch"
              variant="outline"
            >
              {isFetchingNextPage ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* CSV export confirmation - the cap is stated before the file exists */}
      <Dialog onOpenChange={setExportDialogOpen} open={exportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export messages</DialogTitle>
            <DialogDescription>
              Export the {EMAIL_EXPORT_ROW_CAP.toLocaleString()} most recent
              messages matching these filters? Your full history is larger;
              narrow the time range to export a specific period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setExportDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isExporting} onClick={runFullExport}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Contacts Confirmation Dialog */}
      <Dialog
        onOpenChange={setCreateContactsDialogOpen}
        open={createContactsDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Contacts</DialogTitle>
            <DialogDescription>
              Create contacts from {uniqueRecipientEmails.length} unique email
              address{uniqueRecipientEmails.length === 1 ? "" : "es"}?
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-muted-foreground text-sm">
            Emails that already exist as contacts will be skipped automatically.
          </div>
          <DialogFooter>
            <Button
              onClick={() => setCreateContactsDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending} onClick={handleCreateContacts}>
              <UserPlus className="mr-2 h-4 w-4" />
              {isPending ? "Creating..." : "Create Contacts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
