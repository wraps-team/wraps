"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { EmailType, Template } from "@wraps/db";
import { Badge } from "@wraps/ui/components/ui/badge";
import { ButtonGroup } from "@wraps/ui/components/ui/button-group";
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
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
  TooltipProvider,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare,
  Cloud,
  CloudOff,
  Copy,
  FileText,
  Filter,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Tags,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ComponentProps,
  useCallback,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  bulkDeleteTemplates,
  bulkUpdateTemplateStatus,
  bulkUpdateTemplateType,
} from "@/actions/templates";
import { ConnectAwsDialog } from "@/components/connect-aws-dialog";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRequireAws } from "@/hooks/use-require-aws";
import {
  templateKeys,
  useDeleteTemplate,
  useDuplicateTemplate,
  usePublishTemplate,
  useTemplates,
  useUnpublishTemplate,
} from "@/hooks/use-template-queries";
import { cn } from "@/lib/utils";

type TemplatesListProps = {
  organizationId: string;
  orgSlug: string;
};

type TemplateWithUsage = Template & {
  broadcastCount: number;
  automationCount: number;
  automationNames: string[];
};

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

const statusColors: Record<string, BadgeVariant> = {
  DRAFT: "warning",
  PUBLISHED: "success",
  ARCHIVED: "secondary",
};

const emailTypeConfig = {
  marketing: {
    label: "Marketing",
    variant: "brand" as BadgeVariant,
  },
  transactional: {
    label: "Transactional",
    variant: "info" as BadgeVariant,
  },
};

type FilterState = {
  types: Set<"marketing" | "transactional">;
  statuses: Set<"DRAFT" | "PUBLISHED" | "ARCHIVED">;
  usage: Set<"broadcasts" | "automations" | "unused">;
  channels: Set<"email" | "sms">;
};

const defaultFilters: FilterState = {
  types: new Set(),
  statuses: new Set(),
  usage: new Set(),
  channels: new Set(),
};

type SortColumn = "name" | "type" | "status" | "usage" | "updated";
type SortDirection = "asc" | "desc";

type SortState = {
  column: SortColumn;
  direction: SortDirection;
};

export function TemplatesList({ organizationId, orgSlug }: TemplatesListProps) {
  const { data: templates, isLoading } = useTemplates(orgSlug);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    requireAws,
    dialogOpen: awsDialogOpen,
    setDialogOpen: setAwsDialogOpen,
    pendingAction,
    orgSlug: awsOrgSlug,
  } = useRequireAws(orgSlug);

  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [sort, setSort] = useState<SortState>({
    column: "updated",
    direction: "desc",
  });

  // Row selection state
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  // Dialog state
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkTypeDialogOpen, setBulkTypeDialogOpen] = useState(false);
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<EmailType>("marketing");
  const [selectedStatus, setSelectedStatus] = useState<
    "DRAFT" | "PUBLISHED" | "ARCHIVED"
  >("DRAFT");

  // Get selected template IDs
  const selectedTemplateIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  // Toggle selection for a single template
  const toggleRowSelection = (templateId: string) => {
    setRowSelection((prev) => ({
      ...prev,
      [templateId]: !prev[templateId],
    }));
  };

  // Bulk action handlers
  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeleteTemplates(
        organizationId,
        selectedTemplateIds
      );
      if (result.success) {
        toast.success("Templates deleted", {
          description: `${result.count} template${result.count === 1 ? "" : "s"} deleted.`,
        });
        setBulkDeleteDialogOpen(false);
        setRowSelection({});
        queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
        router.refresh();
      } else {
        toast.error("Error", { description: result.error });
      }
    });
  };

  const handleBulkTypeChange = () => {
    startTransition(async () => {
      const result = await bulkUpdateTemplateType(
        organizationId,
        selectedTemplateIds,
        selectedType
      );
      if (result.success) {
        toast.success("Templates updated", {
          description: `${result.count} template${result.count === 1 ? "" : "s"} changed to ${selectedType}.`,
        });
        setBulkTypeDialogOpen(false);
        setRowSelection({});
        queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
        router.refresh();
      } else {
        toast.error("Error", { description: result.error });
      }
    });
  };

  const handleBulkStatusChange = () => {
    if (selectedStatus === "PUBLISHED" && !requireAws("publish")) {
      return;
    }

    startTransition(async () => {
      const result = await bulkUpdateTemplateStatus(
        organizationId,
        selectedTemplateIds,
        selectedStatus
      );
      if (result.success) {
        // Build descriptive toast messages
        const parts: string[] = [];
        parts.push(
          `${result.updated} template${result.updated === 1 ? "" : "s"} updated`
        );
        if (result.published > 0) {
          parts.push(`${result.published} published to SES`);
        }

        toast.success("Templates updated", {
          description: parts.join(", "),
        });

        // Show skipped templates info
        if (result.skipped.length > 0) {
          toast.info("Some templates skipped", {
            description: `${result.skipped.length} template${result.skipped.length === 1 ? "" : "s"} skipped (missing subject): ${result.skipped.slice(0, 3).join(", ")}${result.skipped.length > 3 ? "..." : ""}`,
            duration: Number.POSITIVE_INFINITY,
          });
        }

        // Show errors
        if (result.errors.length > 0) {
          toast.error("Failed to publish some templates", {
            description: `Failed: ${result.errors.slice(0, 3).join(", ")}${result.errors.length > 3 ? "..." : ""}`,
            duration: Number.POSITIVE_INFINITY,
          });
        }

        setBulkStatusDialogOpen(false);
        setRowSelection({});
        queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
        router.refresh();
      } else {
        toast.error("Error", { description: result.error });
      }
    });
  };

  const handleSort = (column: SortColumn) => {
    setSort((prev) => ({
      column,
      direction:
        prev.column === column && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const toggleFilter = <K extends keyof FilterState>(
    category: K,
    value: FilterState[K] extends Set<infer T> ? T : never
  ) => {
    setFilters((prev) => {
      const newSet = new Set(prev[category]) as FilterState[K];
      if ((newSet as Set<unknown>).has(value)) {
        (newSet as Set<unknown>).delete(value);
      } else {
        (newSet as Set<unknown>).add(value);
      }
      return { ...prev, [category]: newSet };
    });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilters(defaultFilters);
  };

  const hasActiveFilters =
    searchQuery ||
    filters.types.size > 0 ||
    filters.statuses.size > 0 ||
    filters.usage.size > 0 ||
    filters.channels.size > 0;

  // Filter and sort templates
  const filteredTemplates = useMemo(() => {
    if (!templates) {
      return [];
    }

    const templatesWithUsage = templates as TemplateWithUsage[];

    // Filter
    const filtered = templatesWithUsage.filter((template) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = template.name.toLowerCase().includes(query);
        const matchesDescription = template.description
          ?.toLowerCase()
          .includes(query);
        const matchesSubject = template.subject?.toLowerCase().includes(query);
        const matchesPreviewText = template.previewText
          ?.toLowerCase()
          .includes(query);
        if (
          !(
            matchesName ||
            matchesDescription ||
            matchesSubject ||
            matchesPreviewText
          )
        ) {
          return false;
        }
      }

      // Channel filter
      if (filters.channels.size > 0) {
        const templateChannel = template.channel || "email";
        if (!filters.channels.has(templateChannel as "email" | "sms")) {
          return false;
        }
      }

      // Type filter
      if (filters.types.size > 0) {
        const emailType = template.emailType || "marketing";
        if (!filters.types.has(emailType)) {
          return false;
        }
      }

      // Status filter
      if (filters.statuses.size > 0 && !filters.statuses.has(template.status)) {
        return false;
      }

      // Usage filter
      if (filters.usage.size > 0) {
        const inBroadcasts = template.broadcastCount > 0;
        const inAutomations = template.automationCount > 0;
        const isUnused = !(inBroadcasts || inAutomations);

        const matchesBroadcasts =
          filters.usage.has("broadcasts") && inBroadcasts;
        const matchesAutomations =
          filters.usage.has("automations") && inAutomations;
        const matchesUnused = filters.usage.has("unused") && isUnused;

        if (!(matchesBroadcasts || matchesAutomations || matchesUnused)) {
          return false;
        }
      }

      return true;
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      const multiplier = sort.direction === "asc" ? 1 : -1;

      switch (sort.column) {
        case "name":
          return multiplier * a.name.localeCompare(b.name);
        case "type": {
          const typeA = a.emailType || "marketing";
          const typeB = b.emailType || "marketing";
          return multiplier * typeA.localeCompare(typeB);
        }
        case "status":
          return multiplier * a.status.localeCompare(b.status);
        case "usage": {
          const usageA = a.broadcastCount + a.automationCount;
          const usageB = b.broadcastCount + b.automationCount;
          return multiplier * (usageA - usageB);
        }
        case "updated":
          return (
            multiplier *
            (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
          );
        default:
          return 0;
      }
    });

    return sorted;
  }, [templates, searchQuery, filters, sort]);

  // Toggle all filtered templates
  const toggleAllRows = () => {
    const allSelected = filteredTemplates.every((t) => rowSelection[t.id]);
    if (allSelected) {
      setRowSelection({});
    } else {
      const newSelection: Record<string, boolean> = {};
      for (const t of filteredTemplates) {
        newSelection[t.id] = true;
      }
      setRowSelection(newSelection);
    }
  };

  // Check if all filtered rows are selected
  const allRowsSelected =
    filteredTemplates.length > 0 &&
    filteredTemplates.every((t) => rowSelection[t.id]);
  const someRowsSelected =
    filteredTemplates.some((t) => rowSelection[t.id]) && !allRowsSelected;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>Name</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Used in</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...new Array(5)].map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton loading items
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <Panel label={<PanelTitle>No templates yet</PanelTitle>}>
        <div className="py-8 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-4 text-muted-foreground">
            Create your first email template to get started.
          </p>
          <Button asChild>
            <Link href={`/${orgSlug}/emails/templates/new`}>
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Link>
          </Button>
        </div>
      </Panel>
    );
  }

  const activeFilterCount =
    filters.types.size +
    filters.statuses.size +
    filters.usage.size +
    filters.channels.size;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Search and Filters Toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            {/* Search */}
            <div className="relative max-w-sm flex-1">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                value={searchQuery}
              />
            </div>

            {/* Filters Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-9 gap-2" variant="outline">
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge
                      className="ml-1 h-5 w-5 rounded-full"
                      variant="secondary"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Type</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={filters.types.has("marketing")}
                  onCheckedChange={() => toggleFilter("types", "marketing")}
                >
                  Marketing
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.types.has("transactional")}
                  onCheckedChange={() => toggleFilter("types", "transactional")}
                >
                  Transactional
                </DropdownMenuCheckboxItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={filters.statuses.has("DRAFT")}
                  onCheckedChange={() => toggleFilter("statuses", "DRAFT")}
                >
                  Draft
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.statuses.has("PUBLISHED")}
                  onCheckedChange={() => toggleFilter("statuses", "PUBLISHED")}
                >
                  Published
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.statuses.has("ARCHIVED")}
                  onCheckedChange={() => toggleFilter("statuses", "ARCHIVED")}
                >
                  Archived
                </DropdownMenuCheckboxItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Channel</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={filters.channels.has("email")}
                  onCheckedChange={() => toggleFilter("channels", "email")}
                >
                  Email
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.channels.has("sms")}
                  onCheckedChange={() => toggleFilter("channels", "sms")}
                >
                  SMS
                </DropdownMenuCheckboxItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Used in</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={filters.usage.has("broadcasts")}
                  onCheckedChange={() => toggleFilter("usage", "broadcasts")}
                >
                  Broadcasts
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.usage.has("automations")}
                  onCheckedChange={() => toggleFilter("usage", "automations")}
                >
                  Automations
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.usage.has("unused")}
                  onCheckedChange={() => toggleFilter("usage", "unused")}
                >
                  Unused
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button
                className="h-9 gap-1"
                onClick={clearFilters}
                variant="ghost"
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}

            {/* Bulk Actions - shown when templates are selected */}
            {selectedTemplateIds.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-9" size="sm" variant="outline">
                    <Tags className="mr-2 h-4 w-4" />
                    Actions ({selectedTemplateIds.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setBulkTypeDialogOpen(true)}>
                    <CheckSquare className="mr-2 h-4 w-4" />
                    Change type
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setBulkStatusDialogOpen(true)}
                  >
                    <Cloud className="mr-2 h-4 w-4" />
                    Change status
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setBulkDeleteDialogOpen(true)}
                    variant="destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete templates
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Right actions */}
          <ButtonGroup>
            <Button
              aria-label="Refresh"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await queryClient.invalidateQueries({
                    queryKey: templateKeys.lists(),
                  });
                });
              }}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                className={cn("h-4 w-4", isPending && "animate-spin")}
              />
            </Button>
            <Button asChild size="sm">
              <Link href={`/${orgSlug}/emails/templates/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Link>
            </Button>
          </ButtonGroup>
        </div>

        {/* Templates Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    aria-label="Select all"
                    checked={
                      allRowsSelected || (someRowsSelected && "indeterminate")
                    }
                    onCheckedChange={toggleAllRows}
                  />
                </TableHead>
                <SortableHeader
                  column="name"
                  currentSort={sort}
                  onSort={handleSort}
                >
                  Name
                </SortableHeader>
                <TableHead>Subject</TableHead>
                <TableHead className="w-20">Channel</TableHead>
                <SortableHeader
                  column="type"
                  currentSort={sort}
                  onSort={handleSort}
                >
                  Type
                </SortableHeader>
                <SortableHeader
                  column="status"
                  currentSort={sort}
                  onSort={handleSort}
                >
                  Status
                </SortableHeader>
                <SortableHeader
                  column="usage"
                  currentSort={sort}
                  onSort={handleSort}
                >
                  Used in
                </SortableHeader>
                <SortableHeader
                  column="updated"
                  currentSort={sort}
                  onSort={handleSort}
                >
                  Updated
                </SortableHeader>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="h-32 text-center text-muted-foreground"
                    colSpan={9}
                  >
                    {hasActiveFilters
                      ? "No templates match your filters"
                      : "No templates found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTemplates.map((template) => (
                  <TemplateRowWithPublish
                    isSelected={!!rowSelection[template.id]}
                    key={template.id}
                    onToggleSelect={() => toggleRowSelection(template.id)}
                    orgSlug={orgSlug}
                    template={template}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Results count */}
        {hasActiveFilters && filteredTemplates.length > 0 && (
          <p className="text-muted-foreground text-sm">
            Showing {filteredTemplates.length} of {templates.length} templates
          </p>
        )}

        {/* Bulk Delete Dialog */}
        <Dialog
          onOpenChange={setBulkDeleteDialogOpen}
          open={bulkDeleteDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Templates</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedTemplateIds.length}{" "}
                template{selectedTemplateIds.length === 1 ? "" : "s"}? This
                action cannot be undone.
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

        {/* Bulk Type Change Dialog */}
        <Dialog onOpenChange={setBulkTypeDialogOpen} open={bulkTypeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Type</DialogTitle>
              <DialogDescription>
                Change the email type for {selectedTemplateIds.length} template
                {selectedTemplateIds.length === 1 ? "" : "s"}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Select
                onValueChange={(value) => setSelectedType(value as EmailType)}
                value={selectedType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="transactional">Transactional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                onClick={() => setBulkTypeDialogOpen(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isPending} onClick={handleBulkTypeChange}>
                {isPending ? "Updating..." : "Update"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Status Change Dialog */}
        <Dialog
          onOpenChange={setBulkStatusDialogOpen}
          open={bulkStatusDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Status</DialogTitle>
              <DialogDescription>
                Change the status for {selectedTemplateIds.length} template
                {selectedTemplateIds.length === 1 ? "" : "s"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Select
                onValueChange={(value) =>
                  setSelectedStatus(value as "DRAFT" | "PUBLISHED" | "ARCHIVED")
                }
                value={selectedStatus}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
              {selectedStatus === "PUBLISHED" && (
                <p className="text-muted-foreground text-sm">
                  Templates will also be published to AWS SES. Templates without
                  subjects will be skipped.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => setBulkStatusDialogOpen(false)}
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isPending} onClick={handleBulkStatusChange}>
                {isPending ? "Updating..." : "Update"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ConnectAwsDialog
          action={pendingAction ?? "publish"}
          onOpenChange={setAwsDialogOpen}
          open={awsDialogOpen}
          orgSlug={awsOrgSlug}
        />
      </div>
    </TooltipProvider>
  );
}

// Wrapper component to handle all template actions per row
function TemplateRowWithPublish({
  template,
  orgSlug,
  isSelected,
  onToggleSelect,
}: {
  template: TemplateWithUsage;
  orgSlug: string;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const router = useRouter();
  const publishMutation = usePublishTemplate(orgSlug, template.id);
  const unpublishMutation = useUnpublishTemplate(orgSlug, template.id);
  const deleteTemplate = useDeleteTemplate(orgSlug);
  const duplicateTemplate = useDuplicateTemplate(orgSlug);

  const handlePublish = async () => {
    try {
      const result = await publishMutation.mutateAsync({});
      toast.success("Template published to AWS SES", {
        description: result.message,
      });
    } catch (error) {
      toast.error("Failed to publish template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleUnpublish = async () => {
    try {
      const result = await unpublishMutation.mutateAsync();
      toast.success("Template unpublished", {
        description: result.message,
      });
    } catch (error) {
      toast.error("Failed to unpublish template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDeleteConfirm = useCallback(() => {
    deleteTemplate.mutate(template.id, {
      onSuccess: () => setDeleteDialogOpen(false),
    });
  }, [deleteTemplate, template.id]);

  const handleDuplicate = async () => {
    const result = await duplicateTemplate.mutateAsync(template.id);
    router.push(`/${orgSlug}/emails/templates/${result.id}`);
  };

  return (
    <>
      <TemplateRow
        isPublishing={publishMutation.isPending || unpublishMutation.isPending}
        isSelected={isSelected}
        onDelete={() => setDeleteDialogOpen(true)}
        onDuplicate={handleDuplicate}
        onPublish={handlePublish}
        onToggleSelect={onToggleSelect}
        onUnpublish={handleUnpublish}
        orgSlug={orgSlug}
        template={template}
      />
      <DeleteConfirmDialog
        description="Are you sure you want to delete this template? This action cannot be undone."
        loading={deleteTemplate.isPending}
        onConfirm={handleDeleteConfirm}
        onOpenChange={setDeleteDialogOpen}
        open={deleteDialogOpen}
        title="Delete Template"
      />
    </>
  );
}

type TemplateRowProps = {
  template: TemplateWithUsage;
  orgSlug: string;
  onDelete: () => void;
  onDuplicate: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  isPublishing?: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
};

function TemplateRow({
  template,
  orgSlug,
  onDelete,
  onDuplicate,
  onPublish,
  onUnpublish,
  isPublishing,
  isSelected,
  onToggleSelect,
}: TemplateRowProps) {
  const hasSubject = !!template.subject;
  const isPublished = template.status === "PUBLISHED";
  const emailType = template.emailType || "marketing";
  const typeConfig = emailTypeConfig[emailType];
  const templateChannel = (template.channel as "email" | "sms") || "email";

  const hasUsage = template.broadcastCount > 0 || template.automationCount > 0;

  return (
    <TableRow className="group" data-state={isSelected && "selected"}>
      {/* Selection checkbox */}
      <TableCell>
        <Checkbox
          aria-label="Select row"
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
        />
      </TableCell>
      {/* Name */}
      <TableCell>
        <div className="flex flex-col">
          <Link
            className="font-medium hover:underline"
            href={`/${orgSlug}/emails/templates/${template.id}`}
          >
            {template.name}
          </Link>
          {template.description && (
            <span className="line-clamp-1 text-muted-foreground text-sm">
              {template.description}
            </span>
          )}
        </div>
      </TableCell>

      {/* Subject & Preview */}
      <TableCell>
        {template.subject ? (
          <div className="flex flex-col">
            <span className="line-clamp-1 text-sm">{template.subject}</span>
            {template.previewText && (
              <span className="line-clamp-1 text-muted-foreground text-xs">
                {template.previewText}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>

      {/* Channel */}
      <TableCell>
        <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
          {templateChannel === "sms" ? (
            <MessageSquare className="h-3.5 w-3.5" />
          ) : (
            <Mail className="h-3.5 w-3.5" />
          )}
          <span className="capitalize">{templateChannel}</span>
        </div>
      </TableCell>

      {/* Type */}
      <TableCell>
        <Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge variant={statusColors[template.status]}>
          {template.status.toLowerCase()}
        </Badge>
      </TableCell>

      {/* Used in */}
      <TableCell>
        {hasUsage ? (
          <div className="flex items-center gap-3">
            {template.broadcastCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Send className="h-3.5 w-3.5" />
                    <span>{template.broadcastCount}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {template.broadcastCount} broadcast
                  {template.broadcastCount !== 1 ? "s" : ""}
                </TooltipContent>
              </Tooltip>
            )}
            {template.automationCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Workflow className="h-3.5 w-3.5" />
                    <span>{template.automationCount}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <div>
                      {template.automationCount} automation
                      {template.automationCount !== 1 ? "s" : ""}
                    </div>
                    {template.automationNames.length > 0 && (
                      <div className="text-muted-foreground text-xs">
                        {template.automationNames.slice(0, 3).join(", ")}
                        {template.automationNames.length > 3 &&
                          ` +${template.automationNames.length - 3} more`}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>

      {/* Updated */}
      <TableCell>
        <span className="text-muted-foreground text-sm">
          {formatDistanceToNow(new Date(template.updatedAt), {
            addSuffix: true,
          })}
        </span>
      </TableCell>

      {/* Actions */}
      <TableCell>
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="More actions" size="icon" variant="ghost">
                {isPublishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/${orgSlug}/emails/templates/${template.id}`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {hasSubject ? (
                <DropdownMenuItem disabled={isPublishing} onClick={onPublish}>
                  <Cloud className="mr-2 h-4 w-4" />
                  {isPublished ? "Update on SES" : "Publish to SES"}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>
                  <Cloud className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Add subject to publish
                  </span>
                </DropdownMenuItem>
              )}
              {isPublished && (
                <DropdownMenuItem disabled={isPublishing} onClick={onUnpublish}>
                  <CloudOff className="mr-2 h-4 w-4" />
                  Unpublish from SES
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Sortable table header component
function SortableHeader({
  column,
  currentSort,
  onSort,
  children,
}: {
  column: SortColumn;
  currentSort: SortState;
  onSort: (column: SortColumn) => void;
  children: React.ReactNode;
}) {
  const isActive = currentSort.column === column;

  return (
    <TableHead>
      <Button
        className="-ml-3 h-8 gap-1"
        onClick={() => onSort(column)}
        variant="ghost"
      >
        {children}
        {isActive ? (
          currentSort.direction === "asc" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
    </TableHead>
  );
}
