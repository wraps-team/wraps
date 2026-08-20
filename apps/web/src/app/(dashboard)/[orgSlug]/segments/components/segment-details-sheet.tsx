"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@wraps/ui/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import { Pencil, RefreshCw, Trash2, Users } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { previewSegment } from "@/actions/segments";
import { Button } from "@/components/ui/button";
import {
  FILTER_FIELDS,
  type FilterCondition,
  OPERATOR_LABELS,
  type SegmentWithMeta,
} from "@/lib/segments";
import type { TopicWithMeta } from "@/lib/topics";
import { captureSegmentPreview, countConditionFilters } from "./lib/analytics";

type SegmentDetailsSheetProps = {
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  open: boolean;
  organizationId: string;
  segment: SegmentWithMeta | null;
  topics: TopicWithMeta[];
  canEdit: boolean;
};

export function SegmentDetailsSheet({
  onClose,
  onEdit,
  onDelete,
  open,
  organizationId,
  segment,
  topics,
  canEdit,
}: SegmentDetailsSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [sampleEmails, setSampleEmails] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Stable reference for dependency arrays
  const segmentId = segment?.id ?? null;

  // Reset state when segment changes
  useEffect(() => {
    if (open && segmentId) {
      setSampleEmails([]);
      setPreviewError(null);
      setPreviewCount(segment?.memberCount ?? null);
    }
  }, [open, segmentId, segment?.memberCount]);

  // Load preview when sheet opens
  useEffect(() => {
    if (open && segment) {
      startTransition(async () => {
        const result = await previewSegment(organizationId, segment.condition);
        if (result.success) {
          setSampleEmails(result.sampleEmails);
          setPreviewCount(result.count);
          setPreviewError(null);
        } else {
          // A failed refresh used to leave the previous number on screen with
          // nothing to say it was not the answer to this question.
          setPreviewCount(null);
          setSampleEmails([]);
          setPreviewError(result.error);
        }
      });
    }
  }, [open, organizationId, segment]);

  if (!segment) {
    return null;
  }

  const handleRefresh = () => {
    const filterCount = countConditionFilters(segment.condition);
    startTransition(async () => {
      const result = await previewSegment(organizationId, segment.condition);
      if (result.success) {
        setSampleEmails(result.sampleEmails);
        setPreviewCount(result.count);
        setPreviewError(null);
        captureSegmentPreview({
          filter_count: filterCount,
          match_count: result.count,
          mode: "details",
          result: "success",
        });
      } else {
        setPreviewCount(null);
        setSampleEmails([]);
        setPreviewError(result.error);
        captureSegmentPreview({
          filter_count: filterCount,
          match_count: null,
          mode: "details",
          result: "error",
        });
      }
    });
  };

  return (
    <Sheet onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
      <SheetContent className="flex flex-col overflow-hidden sm:max-w-lg">
        <SheetHeader className="px-4">
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {segment.name}
          </SheetTitle>
          <SheetDescription>
            {previewCount === null
              ? "Count unavailable"
              : `${previewCount.toLocaleString()} can be emailed`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {/* The count is computed on open, so there is no "last computed"
              age to report — and no second, older number to contradict it. */}
          {previewError && (
            <p className="text-destructive text-sm">{previewError}</p>
          )}

          {segment.description && (
            <p className="text-muted-foreground text-sm">
              {segment.description}
            </p>
          )}

          {/* Conditions Summary */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Conditions</h4>
            <div className="rounded-md border bg-muted/30 p-3">
              <ConditionSummary condition={segment.condition} topics={topics} />
            </div>
          </div>

          {/* Sample Contacts */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Sample Contacts</h4>
              <Button
                disabled={isPending}
                onClick={handleRefresh}
                size="sm"
                variant="ghost"
              >
                <RefreshCw
                  className={`mr-1 h-3 w-3 ${isPending ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPending ? (
                    <TableRow>
                      <TableCell className="text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : sampleEmails.length > 0 ? (
                    sampleEmails.map((email) => (
                      <TableRow key={email}>
                        <TableCell className="font-medium">{email}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-center text-muted-foreground">
                        No contacts in this segment can be emailed
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        {canEdit && (
          <div className="flex items-center gap-2 border-t px-4 py-3">
            <Button className="flex-1" onClick={onEdit} variant="outline">
              <Pencil className="mr-2 h-4 w-4" />
              Edit Segment
            </Button>
            <Button
              aria-label="Delete segment"
              onClick={onDelete}
              size="icon"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Helper component to display condition summary
// Partition filters carry { buckets, index } rather than a scalar value.
function formatBucket(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }
  const { buckets, index } = value as { buckets?: number; index?: number };
  return buckets === undefined || index === undefined
    ? ""
    : `${index} of ${buckets}`;
}

function formatWithinDays(value: string): string {
  const days = Number.parseInt(value, 10);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function ConditionSummary({
  condition,
  topics,
}: {
  condition: FilterCondition;
  topics: TopicWithMeta[];
}) {
  const getFieldLabel = (fieldId: string) => {
    if (fieldId.startsWith("properties.")) {
      return fieldId.replace("properties.", "");
    }
    const field = FILTER_FIELDS.find((f) => f.id === fieldId);
    return field?.label ?? fieldId;
  };

  const getTopicName = (topicId: string) => {
    const topic = topics.find((t) => t.id === topicId);
    return topic?.name ?? topicId;
  };

  const formatValue = (
    fieldId: string,
    value: string | string[] | number | boolean | null | undefined | {}
  ) => {
    if (value === undefined || value === null || value === "") {
      return "";
    }

    // Handle topic values
    if (fieldId === "topics" && typeof value === "string") {
      return getTopicName(value);
    }

    if (fieldId === "bucket") {
      return formatBucket(value);
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.join(", ");
    }

    // Handle dates for "within" operator
    if (typeof value === "string" && value.endsWith("d")) {
      return formatWithinDays(value);
    }

    return String(value);
  };

  return (
    <div className="space-y-2 text-sm">
      {condition.groups.map((group, groupIndex) => (
        <div key={group.id}>
          {groupIndex > 0 && (
            <div className="my-2 text-center font-medium text-muted-foreground text-xs uppercase">
              {condition.logic}
            </div>
          )}
          <div className="space-y-1">
            {group.filters.map((filter, filterIndex) => (
              <div
                className="flex items-center gap-1 text-muted-foreground"
                key={filter.id}
              >
                {filterIndex > 0 && (
                  <span className="font-medium text-xs uppercase">AND</span>
                )}
                <span className="font-medium text-foreground">
                  {getFieldLabel(filter.field)}
                </span>
                <span>{OPERATOR_LABELS[filter.operator]}</span>
                {filter.value !== undefined && filter.value !== "" && (
                  <span className="font-medium text-foreground">
                    {formatValue(filter.field, filter.value)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
