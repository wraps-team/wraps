"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@wraps/ui/components/ui/badge";
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
import { format, formatDistanceToNow } from "date-fns";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { type AuditLogAction, listAuditLogs } from "@/actions/audit-log";
import { Button } from "@/components/ui/button";

type AuditLogSuccess = Extract<
  Awaited<ReturnType<typeof listAuditLogs>>,
  { success: true }
>;
type AuditLogRow = AuditLogSuccess["data"][number];

type Props = {
  organizationId: string;
  initialData: Awaited<ReturnType<typeof listAuditLogs>>;
};

const ACTION_LABELS: Record<AuditLogAction, string> = {
  "member.invited": "Member Invited",
  "member.invite_accepted": "Invite Accepted",
  "member.invite_cancelled": "Invite Cancelled",
  "member.removed": "Member Removed",
  "member.role_changed": "Role Changed",
  "resource.deployed": "Resource Deployed",
  "resource.deleted": "Resource Deleted",
  "api_key.created": "API Key Created",
  "api_key.revoked": "API Key Revoked",
  "settings.updated": "Settings Updated",
  "plan.changed": "Plan Changed",
  "domain.verified": "Domain Verified",
  "auth.login": "Login",
  "auth.login_failed": "Login Failed",
  "auth.password_reset": "Password Reset",
  "template.created": "Template Created",
  "template.updated": "Template Updated",
  "template.published": "Template Published",
  "template.unpublished": "Template Unpublished",
  "template.deleted": "Template Deleted",
  "template.type_updated": "Template Type Updated",
  "template.status_updated": "Template Status Updated",
  "template.converted": "Template Converted",
  "template.version_restored": "Template Version Restored",
  "brand_kit.created": "Brand Kit Created",
  "brand_kit.updated": "Brand Kit Updated",
  "brand_kit.deleted": "Brand Kit Deleted",
  "brand_kit.set_default": "Brand Kit Set as Default",
  "block.created": "Block Created",
  "contact.created": "Contact Created",
  "contact.updated": "Contact Updated",
  "contact.deleted": "Contact Deleted",
  "contact.created_bulk": "Contacts Imported (bulk)",
  "contact.deleted_bulk": "Contacts Deleted (bulk)",
  "contact.imported": "Contacts Imported (CSV)",
  "segment.created": "Segment Created",
  "segment.updated": "Segment Updated",
  "segment.deleted": "Segment Deleted",
  "segment.split": "Segment Split Into Partitions",
  "topic.created": "Topic Created",
  "topic.updated": "Topic Updated",
  "topic.deleted": "Topic Deleted",
  "broadcast.sent": "Broadcast Sent",
  "broadcast.draft_saved": "Draft Saved",
  "broadcast.draft_updated": "Draft Updated",
  "broadcast.sent_from_draft": "Draft Sent",
  "broadcast.draft_deleted": "Draft Deleted",
  "broadcast.duplicated": "Broadcast Duplicated",
  "broadcast.cancelled": "Broadcast Cancelled",
  "broadcast.resumed": "Broadcast Resumed",
  "sso.provider_saved": "SSO Provider Saved",
  "sso.provider_deleted": "SSO Provider Deleted",
  "sso.domain_verification_requested": "Domain Verification Requested",
  "sso.domain_verified": "Domain Verified (SSO)",
  "sso.scim_token_generated": "SCIM Token Generated",
  "workflow.created": "Workflow Created",
  "workflow.updated": "Workflow Updated",
  "workflow.deleted": "Workflow Deleted",
  "workflow.enabled": "Workflow Enabled",
  "workflow.disabled": "Workflow Disabled",
  "workflow.duplicated": "Workflow Duplicated",
  "org.created": "Organization Created",
  "permissions.granted": "Permission Granted",
  "permissions.revoked": "Permission Revoked",
  "contact.topic_subscribed": "Topic Subscribed",
  "contact.topic_unsubscribed": "Topic Unsubscribed",
  "contact.topics_bulk_subscribed": "Topics Bulk Subscribed",
  "contact.topics_bulk_unsubscribed": "Topics Bulk Unsubscribed",
  "settings.sender_defaults_updated": "Sender Defaults Updated",
  "settings.webhook_secret_saved": "Webhook Secret Saved",
  "settings.webhook_secret_removed": "Webhook Secret Removed",
  "settings.daily_quota_reserve_saved": "Daily Quota Reserve Saved",
  "block.updated": "Block Updated",
  "block.deleted": "Block Deleted",
  "template.duplicated": "Template Duplicated",
  "template.version_created": "Template Version Created",
  "agent.created": "Agent Created",
  "agent.killed": "Agent Killed",
  "agent.send_pending": "Agent Send Pending",
  "agent.send_approved": "Agent Send Approved",
  "agent.send_rejected": "Agent Send Rejected",
  "agent.send_blocked": "Agent Send Blocked",
};

// Derived from ACTION_LABELS (a typed Record<AuditLogAction, string>) so the
// filter list can never drift out of sync with the action union again (COR-12).
const ALL_ACTIONS = Object.keys(ACTION_LABELS) as AuditLogAction[];

function getActionBadgeClass(action: string): string {
  if (
    action.startsWith("resource.deleted") ||
    action.startsWith("auth.login_failed")
  ) {
    return "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20";
  }
  if (action.startsWith("resource.deployed")) {
    return "border-transparent bg-primary/10 text-primary dark:bg-primary/20";
  }
  return "border-transparent bg-secondary text-secondary-foreground";
}

function ActionBadge({ action }: { action: string }) {
  const label = ACTION_LABELS[action as AuditLogAction] ?? action;
  const className = getActionBadgeClass(action);
  return <Badge className={className}>{label}</Badge>;
}

function TimestampCell({ date }: { date: Date | string }) {
  const d = typeof date === "string" ? new Date(date) : date;
  const relative = formatDistanceToNow(d, { addSuffix: true });
  const absolute = format(d, "MMM d, yyyy 'at' h:mm:ss a");
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-sm text-muted-foreground">
            {relative}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{absolute}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>IP Address</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-32 rounded-md" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <div className="mb-4 rounded-full bg-muted p-3">
        <ShieldAlert className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mb-1 font-semibold text-base">No audit events yet</h3>
      <p className="max-w-sm text-muted-foreground text-sm">
        Security-relevant actions — API key creation, member changes, settings
        updates — will appear here as they happen.
      </p>
    </div>
  );
}

export function AuditLogViewer({ organizationId, initialData }: Props) {
  const [actionFilter, setActionFilter] = useState<AuditLogAction | "all">(
    "all"
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const queryKey = [
    "audit-logs",
    organizationId,
    actionFilter,
    dateFrom,
    dateTo,
    cursor,
  ] as const;

  const { data, isFetching, isError } = useQuery({
    queryKey,
    queryFn: () =>
      listAuditLogs(organizationId, {
        cursor: cursor ?? undefined,
        filter: {
          action: actionFilter !== "all" ? actionFilter : undefined,
          dateFrom: dateFrom ? new Date(dateFrom) : undefined,
          dateTo: dateTo ? new Date(dateTo) : undefined,
        },
      }),
    initialData:
      cursor === null && actionFilter === "all" && !dateFrom && !dateTo
        ? initialData
        : undefined,
    staleTime: 30_000,
  });

  const rows: AuditLogRow[] = data?.success ? (data.data as AuditLogRow[]) : [];
  const nextCursor = data?.success ? data.nextCursor : null;

  function handleFilterChange() {
    setCursor(null);
    setCursorStack([]);
  }

  function handleNextPage() {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, cursor ?? ""]);
    setCursor(nextCursor);
  }

  function handlePrevPage() {
    const prev = [...cursorStack];
    const previous = prev.pop() ?? null;
    setCursorStack(prev);
    setCursor(previous === "" ? null : previous);
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          onValueChange={(value) => {
            setActionFilter(value as AuditLogAction | "all");
            handleFilterChange();
          }}
          value={actionFilter}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ALL_ACTIONS.map((action) => (
              <SelectItem key={action} value={action}>
                {ACTION_LABELS[action]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <input
            aria-label="From date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onChange={(e) => {
              setDateFrom(e.target.value);
              handleFilterChange();
            }}
            placeholder="From date"
            type="date"
            value={dateFrom}
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            aria-label="To date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onChange={(e) => {
              setDateTo(e.target.value);
              handleFilterChange();
            }}
            placeholder="To date"
            type="date"
            value={dateTo}
          />
        </div>

        {(actionFilter !== "all" || dateFrom || dateTo) && (
          <Button
            onClick={() => {
              setActionFilter("all");
              setDateFrom("");
              setDateTo("");
              handleFilterChange();
            }}
            size="sm"
            variant="ghost"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      {isFetching && rows.length === 0 ? (
        <TableSkeleton />
      ) : isError || (data && !data.success) ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {data && !data.success
              ? data.error
              : "Failed to load audit logs. Please try again."}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  className={isFetching ? "opacity-60" : undefined}
                  key={row.id}
                >
                  <TableCell className="whitespace-nowrap">
                    <TimestampCell date={row.createdAt} />
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">
                    {row.actorEmail ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ActionBadge action={row.action} />
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-muted-foreground text-sm">
                    {row.resourceId ? (
                      <span title={`${row.resource} · ${row.resourceId}`}>
                        {row.resource}
                      </span>
                    ) : (
                      row.resource
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {row.ipAddress ?? <span className="not-italic">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {(cursorStack.length > 0 || nextCursor) && (
        <div className="flex items-center justify-end gap-2">
          <Button
            disabled={cursorStack.length === 0 || isFetching}
            onClick={handlePrevPage}
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={!nextCursor || isFetching}
            onClick={handleNextPage}
            size="sm"
            variant="outline"
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
