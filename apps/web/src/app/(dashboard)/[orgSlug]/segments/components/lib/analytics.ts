"use client";

import posthog from "posthog-js";
import type { FilterCondition } from "@/lib/segments";

/**
 * Product instrumentation for the segments tree (audit finding F16, wave 3).
 *
 * `posthog.capture` appeared zero times across the segments builder before
 * this pass. Production holds exactly one segment and seven users reached
 * `/segments` in 90 days - the audit could not tell whether people never open
 * the builder (a copy/empty-state problem) or open it and abandon (a builder
 * problem). The funnel this file exists to answer is `create_segment_opened`
 * -> `segment_filter_field_changed` / `segment_filter_operator_changed` ->
 * `segment_preview` -> `segment_created`.
 *
 * Conventions match `contacts/components/lib/analytics.ts` (the reference for
 * this wave) and `emails/lib/analytics.ts` (the original prior art):
 * - Event names and properties are snake_case.
 * - No contact PII. Sample emails shown in the preview panel never leave the
 *   browser - only counts. Filter `field` and `operator` values are safe to
 *   report as-is: both are closed enums from `FILTER_FIELDS`
 *   (`@/lib/segments`), captured only from their Select controls, never from
 *   the free-text event-name or custom-property inputs a filter row can also
 *   carry (those would leak an org-defined property key or event name).
 * - No server-side capture exists for segment create/update/delete/split or
 *   for preview - `actions/segments.ts` only writes an audit log entry
 *   (`segment.created`, an `AuditLogAction`, not a PostHog event), so nothing
 *   here risks double-counting.
 */

// ─── Shared helpers ─────────────────────────────────────────────────────────

/** Counts filters across all groups, including nested conditions. */
export function countConditionFilters(condition: FilterCondition): number {
  let count = 0;
  for (const group of condition.groups) {
    count += group.filters.length;
    if (group.nested) {
      count += countConditionFilters(group.nested);
    }
  }
  return count;
}

/**
 * "properties.plan" and "event.purchase" collapse to "properties" and
 * "event" - the suffix is org-defined (a property key or event name) and
 * never leaves the browser.
 */
function normalizeFieldId(field: string): string {
  if (field.startsWith("properties.")) {
    return "properties";
  }
  if (field.startsWith("event.")) {
    return "event";
  }
  return field;
}

/** Deduplicated, order-stable list of base field ids used across a condition. */
export function collectConditionFieldIds(condition: FilterCondition): string[] {
  const seen = new Set<string>();
  const visit = (c: FilterCondition) => {
    for (const group of c.groups) {
      for (const filter of group.filters) {
        seen.add(normalizeFieldId(filter.field));
      }
      if (group.nested) {
        visit(group.nested);
      }
    }
  };
  visit(condition);
  return [...seen];
}

// ─── Create funnel ──────────────────────────────────────────────────────────

/** Step 1. Fired when the create dialog opens, from wherever it was reached. */
export function captureCreateSegmentOpened(props: {
  source: "empty_state" | "toolbar";
}) {
  posthog.capture("create_segment_opened", props);
}

/** Which field/operator controls people actually touch (wave 1 repointed the
 * status field and fixed two broken operators - this is the first way to see
 * whether anyone uses them). Fired on the Select's onValueChange, not on
 * every keystroke of the free-text value inputs those selections unlock. */
export function captureSegmentFilterFieldChanged(props: { field: string }) {
  posthog.capture("segment_filter_field_changed", props);
}

export function captureSegmentFilterOperatorChanged(props: {
  field: string;
  operator: string;
}) {
  posthog.capture("segment_filter_operator_changed", props);
}

/** Step 2 (or a details-view refresh). Failures are a distinct `result`, not
 * folded into a boolean, so a validation error and a query failure are
 * distinguishable in the funnel. */
export function captureSegmentPreview(props: {
  filter_count: number;
  match_count: number | null;
  mode: "create" | "details" | "edit";
  result: "error" | "success" | "validation_error";
}) {
  posthog.capture("segment_preview", props);
}

/** Step 3. Only fires on a successful create. */
export function captureSegmentCreated(props: {
  fields: string[];
  filter_count: number;
  track_membership: boolean;
}) {
  posthog.capture("segment_created", props);
}

// ─── Post-create lifecycle ──────────────────────────────────────────────────

export function captureSegmentUpdated(props: {
  condition_changed: boolean;
  fields: string[];
}) {
  posthog.capture("segment_updated", props);
}

export function captureSegmentDeleted() {
  posthog.capture("segment_deleted");
}

export function captureSegmentSplit(props: { partition_count: number }) {
  posthog.capture("segment_split", props);
}

export function captureSegmentDetailOpened() {
  posthog.capture("segment_detail_opened");
}
