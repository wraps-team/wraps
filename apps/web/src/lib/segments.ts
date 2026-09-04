// Segments types and constants - shared between server actions and client components

// Re-export filter types from database schema
export type {
  FilterCondition,
  FilterGroup,
  FilterOperator,
  SegmentFilter,
} from "@wraps/db";

// Import types for local use via namespace to avoid lint warning
import type * as DbTypes from "@wraps/db";
import { EMAIL_STATUS_LABELS, EMAIL_STATUSES } from "@/lib/contacts";

type FilterCondition = DbTypes.FilterCondition;
type FilterGroup = DbTypes.FilterGroup;
type FilterOperator = DbTypes.FilterOperator;
type SegmentFilter = DbTypes.SegmentFilter;

// Segment with relations
export type SegmentWithMeta = {
  id: string;
  name: string;
  description: string | null;
  condition: FilterCondition;
  trackMembership: boolean;
  memberCount: number;
  lastComputedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
};

// Result types
export type ListSegmentsResult =
  | { success: true; segments: SegmentWithMeta[] }
  | { success: false; error: string };

export type GetSegmentResult =
  | { success: true; segment: SegmentWithMeta }
  | { success: false; error: string };

export type CreateSegmentResult =
  | { success: true; segment: SegmentWithMeta }
  | { success: false; error: string };

export type UpdateSegmentResult =
  | { success: true; segment: SegmentWithMeta }
  | { success: false; error: string };

export type DeleteSegmentResult =
  | { success: true }
  | { success: false; error: string };

export type PreviewSegmentResult =
  | { success: true; count: number; sampleEmails: string[] }
  | { success: false; error: string };

export type SplitSegmentResult =
  | {
      success: true;
      segments: { id: string; name: string; memberCount: number }[];
    }
  | { success: false; error: string };

// Available fields for filtering
export type FilterFieldDefinition = {
  id: string;
  label: string;
  type:
    | "string"
    | "number"
    | "date"
    | "boolean"
    | "array"
    | "topic"
    | "event"
    | "bucket";
  operators: FilterOperator[];
};

// Define available filter fields
export const FILTER_FIELDS: FilterFieldDefinition[] = [
  // Email status — compiles to contact.email_status, the column the product
  // writes and every send path filters on.
  {
    id: "status",
    label: "Email Status",
    type: "string",
    operators: ["equals", "notEquals", "inList", "notInList"],
  },
  // Email
  {
    id: "email",
    label: "Email",
    type: "string",
    operators: [
      "equals",
      "notEquals",
      "contains",
      "notContains",
      "startsWith",
      "endsWith",
    ],
  },
  // Engagement
  {
    id: "lastActivityAt",
    label: "Last Activity",
    type: "date",
    operators: [
      "exists",
      "notExists",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
      "within",
    ],
  },
  {
    id: "lastEmailSentAt",
    label: "Last Email Sent",
    type: "date",
    operators: [
      "exists",
      "notExists",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
      "within",
    ],
  },
  {
    id: "lastEmailOpenedAt",
    label: "Last Email Opened",
    type: "date",
    operators: [
      "exists",
      "notExists",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
      "within",
    ],
  },
  {
    id: "lastEmailClickedAt",
    label: "Last Email Clicked",
    type: "date",
    operators: [
      "exists",
      "notExists",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
      "within",
    ],
  },
  // Stats
  {
    id: "emailsSent",
    label: "Emails Sent",
    type: "number",
    operators: [
      "equals",
      "notEquals",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
    ],
  },
  {
    id: "emailsOpened",
    label: "Emails Opened",
    type: "number",
    operators: [
      "equals",
      "notEquals",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
    ],
  },
  {
    id: "emailsClicked",
    label: "Emails Clicked",
    type: "number",
    operators: [
      "equals",
      "notEquals",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
    ],
  },
  // Timestamps
  {
    id: "createdAt",
    label: "Created Date",
    type: "date",
    operators: [
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
      "within",
    ],
  },
  {
    id: "confirmedAt",
    label: "Confirmed Date",
    type: "date",
    operators: [
      "exists",
      "notExists",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
      "within",
    ],
  },
  // Topics
  {
    id: "topics",
    label: "Topic Subscription",
    type: "topic",
    operators: ["hasTopic", "notHasTopic"],
  },
  // Behavioural filters. The field carries the event name as "event.<name>";
  // the SQL builder strips the prefix before matching contact_event.
  {
    id: "event",
    label: "Event",
    type: "event",
    operators: ["triggered", "notTriggered", "triggeredWithin"],
  },
  // Deterministic partitioning — splits a large audience into even cohorts
  {
    id: "bucket",
    label: "Partition",
    type: "bucket",
    operators: ["inBucket"],
  },
  // Custom properties - dynamic, represented as properties.*
  {
    id: "properties",
    label: "Custom Property",
    type: "string",
    operators: [
      "equals",
      "notEquals",
      "contains",
      "notContains",
      "exists",
      "notExists",
      "greaterThan",
      "lessThan",
      "greaterThanOrEqual",
      "lessThanOrEqual",
    ],
  },
];

// Operator labels for display
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: "equals",
  notEquals: "does not equal",
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  endsWith: "ends with",
  greaterThan: "is greater than",
  lessThan: "is less than",
  greaterThanOrEqual: "is at least",
  lessThanOrEqual: "is at most",
  exists: "exists",
  notExists: "does not exist",
  inList: "is one of",
  notInList: "is not one of",
  within: "is within",
  hasTopic: "is subscribed to",
  notHasTopic: "is not subscribed to",
  triggered: "has triggered",
  triggeredWithin: "has triggered within",
  notTriggered: "has not triggered",
  inBucket: "is in partition",
};

// Email status options — derived from the contacts vocabulary so the segment
// builder and the contacts filter can never drift apart. "pending_confirmation"
// used to be offered here; it is a topic-subscription state, not an email
// status, and no contact could ever match it.
export const EMAIL_STATUS_OPTIONS = EMAIL_STATUSES.map((value) => ({
  value,
  label: EMAIL_STATUS_LABELS[value],
}));

// Helper to create an empty filter condition
export function createEmptyCondition(): FilterCondition {
  return {
    logic: "AND",
    groups: [
      {
        id: crypto.randomUUID(),
        filters: [
          {
            id: crypto.randomUUID(),
            field: "status",
            operator: "equals",
            value: "active",
          },
        ],
      },
    ],
  };
}

// Helper to create an empty filter
export function createEmptyFilter(): SegmentFilter {
  return {
    id: crypto.randomUUID(),
    field: "status",
    operator: "equals",
    value: "",
  };
}

// Helper to create an empty filter group
export function createEmptyGroup(): FilterGroup {
  return {
    id: crypto.randomUUID(),
    filters: [createEmptyFilter()],
  };
}

// Partition filters carry { buckets, index } rather than a scalar value.
// Validation now lives in @wraps/db so the public API shares one validator
// with the dashboard — re-exported here so existing callers are untouched.
export { MAX_BUCKETS, validateBucketValue } from "@wraps/db";

// Splitting creates one segment per partition, so the ceiling is much lower
// than MAX_BUCKETS — this bounds how many rows one click can insert.
export const MAX_SPLIT_PARTITIONS = 50;

export function conditionHasPartitionFilter(
  condition: FilterCondition
): boolean {
  return condition.groups.some(
    (group) =>
      group.filters.some((f) => f.operator === "inBucket") ||
      (group.nested ? conditionHasPartitionFilter(group.nested) : false)
  );
}

/**
 * AND a partition filter onto an existing condition, keeping the result flat.
 *
 * Nesting via FilterGroup.nested would be the tidier encoding, but neither the
 * segment builder nor the details sheet renders nested conditions — the source
 * filters would vanish from the UI while still applying in SQL. So:
 *
 *   AND source → append the partition as its own group        (A ∧ B) ∧ P
 *   OR  source → distribute it into every group, logic intact (A ∧ P) ∨ (B ∧ P)
 *
 * The OR case is the one that matters: appending a group there would produce
 * A ∨ B ∨ P, which matches everyone in the partition regardless of the segment.
 */
export function withPartitionFilter(
  condition: FilterCondition,
  buckets: number,
  index: number
): FilterCondition {
  const partition: SegmentFilter = {
    id: crypto.randomUUID(),
    field: "bucket",
    operator: "inBucket",
    value: { buckets, index },
  };

  if (condition.logic === "OR") {
    return {
      logic: "OR",
      groups: condition.groups.map((group) => ({
        ...group,
        id: crypto.randomUUID(),
        filters: [...group.filters, { ...partition, id: crypto.randomUUID() }],
      })),
    };
  }

  return {
    logic: "AND",
    groups: [
      ...condition.groups.map((group) => ({
        ...group,
        id: crypto.randomUUID(),
      })),
      { id: crypto.randomUUID(), filters: [partition] },
    ],
  };
}

// Condition validation now lives in @wraps/db so the public API shares one
// validator with the dashboard — re-exported here so existing callers
// (server actions, the segment form dialog) are untouched.
export { validateCondition } from "@wraps/db";
