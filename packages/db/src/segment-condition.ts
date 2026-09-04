// Segment condition validation — shared by the dashboard server actions and
// the public API, so a caller-authored condition is validated identically no
// matter which surface accepted it.

import type {
  FilterCondition,
  FilterOperator,
  SegmentFilter,
} from "./schema/segments";

// Partition filters carry { buckets, index } rather than a scalar value.
export const MAX_BUCKETS = 1000;

export function validateBucketValue(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return "Partition count and number are required";
  }
  const { buckets, index } = value as Record<string, unknown>;
  if (!Number.isInteger(buckets) || (buckets as number) < 2) {
    return "Partition count must be a whole number of at least 2";
  }
  if ((buckets as number) > MAX_BUCKETS) {
    return `Partition count cannot exceed ${MAX_BUCKETS}`;
  }
  // 1-based: "partition 1 of 6" through "partition 6 of 6".
  if (!Number.isInteger(index) || (index as number) < 1) {
    return "Partition number must be a whole number of at least 1";
  }
  if ((index as number) > (buckets as number)) {
    return `Partition number must be between 1 and ${buckets as number}`;
  }
  return null;
}

// Operators that carry no value of their own.
const VALUELESS_OPERATORS = new Set<FilterOperator>([
  "exists",
  "notExists",
  "triggered",
  "notTriggered",
]);

const EVENT_OPERATORS = new Set<FilterOperator>([
  "triggered",
  "notTriggered",
  "triggeredWithin",
]);

const LIST_OPERATORS = new Set<FilterOperator>(["inList", "notInList"]);

// The event name lives in the field, not the value.
function validateEventName(field: string): string | null {
  const eventName = field.startsWith("event.")
    ? field.slice("event.".length)
    : field;
  return eventName.trim() && eventName !== "event"
    ? null
    : "Event name is required";
}

// List operators bind their value as an array param. A scalar compiles to SQL
// Postgres refuses to run, so catch it here rather than at send time.
function validateListValue(value: unknown): string | null {
  return Array.isArray(value) && value.length > 0
    ? null
    : "Select one or more values for this filter";
}

function validateFilter(filter: SegmentFilter): string | null {
  if (!filter.field) {
    return "Filter field is required";
  }
  if (!filter.operator) {
    return "Filter operator is required";
  }

  // A malformed partition filter compiles to no SQL and would silently widen
  // the segment to every contact, so reject it before it can be saved.
  if (filter.operator === "inBucket") {
    return validateBucketValue(filter.value);
  }

  if (EVENT_OPERATORS.has(filter.operator)) {
    const nameError = validateEventName(filter.field);
    if (nameError) {
      return nameError;
    }
  }

  if (LIST_OPERATORS.has(filter.operator)) {
    return validateListValue(filter.value);
  }

  if (
    !VALUELESS_OPERATORS.has(filter.operator) &&
    (filter.value === undefined || filter.value === "")
  ) {
    return "Filter value is required";
  }

  return null;
}

// Validate a filter condition
export function validateCondition(condition: FilterCondition): string | null {
  if (!condition.groups || condition.groups.length === 0) {
    return "At least one filter group is required";
  }

  for (const group of condition.groups) {
    if (!group.filters || group.filters.length === 0) {
      return "Each group must have at least one filter";
    }

    for (const filter of group.filters) {
      const filterError = validateFilter(filter);
      if (filterError) {
        return filterError;
      }
    }

    // Recursively validate nested conditions
    if (group.nested) {
      const nestedError = validateCondition(group.nested);
      if (nestedError) {
        return nestedError;
      }
    }
  }

  return null;
}
