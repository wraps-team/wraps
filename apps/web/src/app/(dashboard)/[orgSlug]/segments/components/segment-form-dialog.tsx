"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import { Label } from "@wraps/ui/components/ui/label";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { Loader2, Users } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { previewSegment } from "@/actions/segments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createEmptyCondition,
  type FilterCondition,
  type SegmentWithMeta,
  validateCondition,
} from "@/lib/segments";
import type { TopicWithMeta } from "@/lib/topics";
import { captureSegmentPreview, countConditionFilters } from "./lib/analytics";
import { SegmentBuilder } from "./segment-builder";

type SegmentFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  segment?: SegmentWithMeta | null;
  organizationId: string;
  propertyKeys: string[];
  topics: TopicWithMeta[];
  isPending: boolean;
  onSubmit: (data: {
    name: string;
    description?: string;
    condition: FilterCondition;
    trackMembership?: boolean;
  }) => Promise<void>;
};

export function SegmentFormDialog({
  open,
  onOpenChange,
  mode,
  segment,
  organizationId,
  propertyKeys,
  topics,
  isPending,
  onSubmit,
}: SegmentFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState<FilterCondition>(
    createEmptyCondition()
  );
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSamples, setPreviewSamples] = useState<string[]>([]);
  const [isPreviewPending, startPreviewTransition] = useTransition();
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or segment changes
  useEffect(() => {
    if (open) {
      if (mode === "edit" && segment) {
        setName(segment.name);
        setDescription(segment.description || "");
        setCondition(segment.condition);
        setPreviewCount(segment.memberCount);
        setPreviewSamples([]);
      } else {
        setName("");
        setDescription("");
        setCondition(createEmptyCondition());
        setPreviewCount(null);
        setPreviewSamples([]);
      }
      setValidationError(null);
    }
  }, [open, mode, segment]);

  // A count belongs to the filters it was measured against. Editing them
  // invalidates it — leaving the old number on screen is how a failed preview
  // ends up looking like a successful one.
  const handleConditionChange = useCallback((next: FilterCondition) => {
    setCondition(next);
    setPreviewCount(null);
    setPreviewSamples([]);
    setValidationError(null);
  }, []);

  // Preview handler
  const handlePreview = useCallback(() => {
    const filterCount = countConditionFilters(condition);
    const error = validateCondition(condition);
    if (error) {
      setPreviewCount(null);
      setPreviewSamples([]);
      setValidationError(error);
      captureSegmentPreview({
        filter_count: filterCount,
        match_count: null,
        mode,
        result: "validation_error",
      });
      return;
    }
    setValidationError(null);

    startPreviewTransition(async () => {
      const result = await previewSegment(organizationId, condition);
      if (result.success) {
        setPreviewCount(result.count);
        setPreviewSamples(result.sampleEmails);
        captureSegmentPreview({
          filter_count: filterCount,
          match_count: result.count,
          mode,
          result: "success",
        });
      } else {
        setPreviewCount(null);
        setPreviewSamples([]);
        setValidationError(result.error);
        captureSegmentPreview({
          filter_count: filterCount,
          match_count: null,
          mode,
          result: "error",
        });
      }
    });
  }, [condition, mode, organizationId]);

  // Submit handler
  const handleSubmit = async () => {
    if (!name.trim()) {
      setValidationError("Segment name is required");
      return;
    }

    const error = validateCondition(condition);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);

    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      condition,
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create Segment" : "Edit Segment"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Define conditions to create a dynamic audience segment."
              : "Update the segment conditions to change the audience."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Basic Info */}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Active Subscribers"
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this segment represents..."
                rows={2}
                value={description}
              />
            </div>
          </div>

          {/* Segment Builder */}
          <div className="grid gap-2">
            <Label>Conditions</Label>
            <SegmentBuilder
              condition={condition}
              onChange={handleConditionChange}
              propertyKeys={propertyKeys}
              topics={topics}
            />
          </div>

          {/* Preview Section */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">
                  {previewCount !== null
                    ? `${previewCount.toLocaleString()} contacts match`
                    : "Preview to see matching contacts"}
                </span>
              </div>
              <Button
                disabled={isPreviewPending}
                onClick={handlePreview}
                size="sm"
                variant="outline"
              >
                {isPreviewPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Preview"
                )}
              </Button>
            </div>
            {previewSamples.length > 0 && (
              <div className="mt-3 border-t pt-3">
                <p className="mb-2 text-muted-foreground text-sm">
                  Sample matches:
                </p>
                <div className="flex flex-wrap gap-2">
                  {previewSamples.map((email) => (
                    <span
                      className="rounded-full bg-background px-2 py-1 text-sm"
                      key={email}
                    >
                      {email}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Validation Error */}
          {validationError && (
            <p className="text-destructive text-sm">{validationError}</p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={isPending} onClick={handleSubmit}>
            {isPending
              ? mode === "create"
                ? "Creating..."
                : "Saving..."
              : mode === "create"
                ? "Create Segment"
                : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
