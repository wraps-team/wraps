"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wraps/ui/components/ui/toggle-group";
import { Plus, Trash2, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createEmptyFilter,
  createEmptyGroup,
  EMAIL_STATUS_OPTIONS,
  FILTER_FIELDS,
  type FilterCondition,
  type FilterGroup,
  type FilterOperator,
  OPERATOR_LABELS,
  type SegmentFilter,
} from "@/lib/segments";
import type { TopicWithMeta } from "@/lib/topics";
import {
  captureSegmentFilterFieldChanged,
  captureSegmentFilterOperatorChanged,
} from "./lib/analytics";

const ORDERED_OPERATORS = new Set([
  "greaterThan",
  "lessThan",
  "greaterThanOrEqual",
  "lessThanOrEqual",
]);

const DATE_LIKE_VALUE = /^\d{4}-\d{2}-\d{2}/;

const LIST_OPERATORS = new Set<FilterOperator>(["inList", "notInList"]);

const EVENT_OPERATORS = new Set<FilterOperator>([
  "triggered",
  "notTriggered",
  "triggeredWithin",
]);

// List operators bind their value as an array. Older conditions (and the
// single-select this control replaced) hold a scalar, so widen rather than
// drop it — the SQL builder refuses anything that is not an array.
function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [String(value)];
}

function eventNameOf(field: string): string {
  return field.startsWith("event.") ? field.slice("event.".length) : "";
}

// Custom properties are untyped JSON, so an ordered comparison could mean
// either a number or a date. Seed the picker from whatever is already stored.
function isDateLikeValue(value: unknown): boolean {
  return typeof value === "string" && DATE_LIKE_VALUE.test(value);
}

type SegmentBuilderProps = {
  condition: FilterCondition;
  onChange: (condition: FilterCondition) => void;
  propertyKeys: string[];
  topics: TopicWithMeta[];
};

export function SegmentBuilder({
  condition,
  onChange,
  propertyKeys,
  topics,
}: SegmentBuilderProps) {
  // Update logic (AND/OR)
  const handleLogicChange = useCallback(
    (logic: "AND" | "OR") => {
      onChange({ ...condition, logic });
    },
    [condition, onChange]
  );

  // Add a new group
  const handleAddGroup = useCallback(() => {
    onChange({
      ...condition,
      groups: [...condition.groups, createEmptyGroup()],
    });
  }, [condition, onChange]);

  // Remove a group
  const handleRemoveGroup = useCallback(
    (groupIndex: number) => {
      if (condition.groups.length <= 1) {
        return;
      }
      onChange({
        ...condition,
        groups: condition.groups.filter((_, i) => i !== groupIndex),
      });
    },
    [condition, onChange]
  );

  // Update a group
  const handleUpdateGroup = useCallback(
    (groupIndex: number, group: FilterGroup) => {
      onChange({
        ...condition,
        groups: condition.groups.map((g, i) => (i === groupIndex ? group : g)),
      });
    },
    [condition, onChange]
  );

  return (
    <div className="space-y-4">
      {/* Logic selector */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          Match contacts where
        </span>
        <Select
          onValueChange={(value) => handleLogicChange(value as "AND" | "OR")}
          value={condition.logic}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">ALL</SelectItem>
            <SelectItem value="OR">ANY</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-sm">
          of the following conditions are true:
        </span>
      </div>

      {/* Filter groups */}
      <div className="space-y-3">
        {condition.groups.map((group, groupIndex) => (
          <FilterGroupComponent
            canRemove={condition.groups.length > 1}
            group={group}
            groupIndex={groupIndex}
            key={group.id || `group-${groupIndex}`}
            onChange={(updatedGroup) =>
              handleUpdateGroup(groupIndex, updatedGroup)
            }
            onRemove={() => handleRemoveGroup(groupIndex)}
            propertyKeys={propertyKeys}
            topics={topics}
          />
        ))}
      </div>

      {/* Add group button */}
      <Button
        className="w-full"
        onClick={handleAddGroup}
        size="sm"
        variant="outline"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add {condition.logic === "AND" ? "AND" : "OR"} condition group
      </Button>
    </div>
  );
}

type FilterGroupComponentProps = {
  group: FilterGroup;
  groupIndex: number;
  canRemove: boolean;
  propertyKeys: string[];
  topics: TopicWithMeta[];
  onChange: (group: FilterGroup) => void;
  onRemove: () => void;
};

function FilterGroupComponent({
  group,
  groupIndex,
  canRemove,
  propertyKeys,
  topics,
  onChange,
  onRemove,
}: FilterGroupComponentProps) {
  // Add a filter to the group
  const handleAddFilter = useCallback(() => {
    onChange({
      ...group,
      filters: [...group.filters, createEmptyFilter()],
    });
  }, [group, onChange]);

  // Remove a filter from the group
  const handleRemoveFilter = useCallback(
    (filterIndex: number) => {
      if (group.filters.length <= 1) {
        return;
      }
      onChange({
        ...group,
        filters: group.filters.filter((_, i) => i !== filterIndex),
      });
    },
    [group, onChange]
  );

  // Update a filter in the group
  const handleUpdateFilter = useCallback(
    (filterIndex: number, filter: SegmentFilter) => {
      onChange({
        ...group,
        filters: group.filters.map((f, i) => (i === filterIndex ? filter : f)),
      });
    },
    [group, onChange]
  );

  return (
    <div className="relative rounded-lg border bg-card p-4">
      {/* Remove group button */}
      {canRemove && (
        <Button
          className="absolute top-2 right-2 h-6 w-6 p-0"
          onClick={onRemove}
          size="sm"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      <div className="space-y-3">
        {group.filters.map((filter, filterIndex) => (
          <div
            className="flex items-start gap-2"
            key={filter.id || `filter-${groupIndex}-${filterIndex}`}
          >
            {filterIndex > 0 && (
              <span className="flex h-9 w-12 items-center justify-center text-muted-foreground text-sm">
                AND
              </span>
            )}
            <FilterRow
              canRemove={group.filters.length > 1}
              filter={filter}
              onChange={(updated) => handleUpdateFilter(filterIndex, updated)}
              onRemove={() => handleRemoveFilter(filterIndex)}
              propertyKeys={propertyKeys}
              topics={topics}
            />
          </div>
        ))}
      </div>

      {/* Add filter button */}
      <Button
        className="mt-3"
        onClick={handleAddFilter}
        size="sm"
        variant="ghost"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add filter
      </Button>
    </div>
  );
}

type FilterRowProps = {
  filter: SegmentFilter;
  canRemove: boolean;
  propertyKeys: string[];
  topics: TopicWithMeta[];
  onChange: (filter: SegmentFilter) => void;
  onRemove: () => void;
};

function FilterRow({
  filter,
  canRemove,
  propertyKeys,
  topics,
  onChange,
  onRemove,
}: FilterRowProps) {
  const [propertyValueMode, setPropertyValueMode] = useState<"number" | "date">(
    isDateLikeValue(filter.value) ? "date" : "number"
  );

  // Get field definition
  const fieldDef =
    FILTER_FIELDS.find((f) => f.id === filter.field) ||
    FILTER_FIELDS.find((f) => filter.field.startsWith(`${f.id}.`));

  // Get available operators for the field
  const availableOperators = fieldDef?.operators || [];

  // Handle field change
  const handleFieldChange = useCallback(
    (fieldId: string) => {
      const newFieldDef = FILTER_FIELDS.find((f) => f.id === fieldId);
      const defaultOperator = newFieldDef?.operators[0] || "equals";
      captureSegmentFilterFieldChanged({ field: fieldId });
      onChange({
        // Event filters carry the event name in the field itself.
        field: newFieldDef?.type === "event" ? "event." : fieldId,
        operator: defaultOperator,
        value: LIST_OPERATORS.has(defaultOperator) ? [] : undefined,
      });
    },
    [onChange]
  );

  // Handle operator change
  const handleOperatorChange = useCallback(
    (operator: string) => {
      const next = operator as FilterOperator;
      let value = filter.value;
      if (next === "exists" || next === "notExists") {
        value = undefined;
      } else if (LIST_OPERATORS.has(next)) {
        // Switching into "is one of" must widen the scalar the previous
        // operator held, not carry it through as a string.
        value = asStringList(filter.value);
      } else if (LIST_OPERATORS.has(filter.operator)) {
        value = asStringList(filter.value)[0];
      }
      captureSegmentFilterOperatorChanged({
        field: fieldDef?.id ?? filter.field,
        operator: next,
      });
      onChange({ ...filter, operator: next, value });
    },
    [fieldDef, filter, onChange]
  );

  // Handle value change
  const handleValueChange = useCallback(
    (value: unknown) => {
      onChange({
        ...filter,
        value,
      });
    },
    [filter, onChange]
  );

  // Render value input based on field type
  const renderValueInput = () => {
    // No value input for exists/notExists operators
    if (filter.operator === "exists" || filter.operator === "notExists") {
      return null;
    }

    // Topic selector for topic-based filters
    if (filter.field === "topics") {
      return (
        <Select
          onValueChange={handleValueChange}
          value={(filter.value as string) || ""}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select topic" />
          </SelectTrigger>
          <SelectContent>
            {topics.map((topic) => (
              <SelectItem key={topic.id} value={topic.id}>
                {topic.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Email status selector
    if (filter.field === "status") {
      if (LIST_OPERATORS.has(filter.operator)) {
        return (
          <ToggleGroup
            aria-label="Email Status values"
            className="flex-1 flex-wrap justify-start"
            onValueChange={handleValueChange}
            size="sm"
            type="multiple"
            value={asStringList(filter.value)}
            variant="outline"
          >
            {EMAIL_STATUS_OPTIONS.map((status) => (
              <ToggleGroupItem key={status.value} value={status.value}>
                {status.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        );
      }
      return (
        <Select
          onValueChange={handleValueChange}
          value={(filter.value as string) || ""}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {EMAIL_STATUS_OPTIONS.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Event filters: the name is free text because contact_event names are
    // caller-defined and an org can emit one the dashboard has never seen.
    if (EVENT_OPERATORS.has(filter.operator)) {
      return (
        <div className="flex flex-1 items-center gap-2">
          <Input
            aria-label="Event name"
            className="flex-1"
            onChange={(e) =>
              onChange({ ...filter, field: `event.${e.target.value}` })
            }
            placeholder="event name"
            value={eventNameOf(filter.field)}
          />
          {filter.operator === "triggeredWithin" && (
            <>
              <span className="text-muted-foreground text-sm">in the last</span>
              <Input
                aria-label="Duration"
                className="w-20"
                min={1}
                onChange={(e) =>
                  handleValueChange(
                    Number.parseInt(e.target.value, 10) || undefined
                  )
                }
                placeholder="30"
                type="number"
                value={filter.value?.toString() || ""}
              />
              <Select
                onValueChange={(unit) =>
                  onChange({
                    ...filter,
                    unit: unit as "days" | "hours" | "minutes",
                  })
                }
                value={filter.unit || "days"}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">days</SelectItem>
                  <SelectItem value="hours">hours</SelectItem>
                  <SelectItem value="minutes">minutes</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      );
    }

    // Within operator needs value + unit
    if (filter.operator === "within") {
      return (
        <div className="flex flex-1 items-center gap-2">
          <Input
            className="w-20"
            min={1}
            onChange={(e) =>
              onChange({
                ...filter,
                value: Number.parseInt(e.target.value, 10) || undefined,
              })
            }
            placeholder="30"
            type="number"
            value={filter.value?.toString() || ""}
          />
          <Select
            onValueChange={(unit) =>
              onChange({
                ...filter,
                unit: unit as "days" | "hours" | "minutes",
              })
            }
            value={filter.unit || "days"}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="days">days</SelectItem>
              <SelectItem value="hours">hours</SelectItem>
              <SelectItem value="minutes">minutes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }

    // Partition: "N of M" — splits the audience into M even, stable cohorts
    if (filter.operator === "inBucket") {
      const bucketValue = (filter.value ?? {}) as {
        buckets?: number;
        index?: number;
      };
      const updateBucket = (patch: { buckets?: number; index?: number }) =>
        handleValueChange({ ...bucketValue, ...patch });

      return (
        <div className="flex flex-1 items-center gap-2">
          <Input
            aria-label="Partition number"
            className="w-20"
            min={1}
            onChange={(e) =>
              updateBucket({
                index:
                  e.target.value === ""
                    ? undefined
                    : Number.parseInt(e.target.value, 10),
              })
            }
            placeholder="1"
            type="number"
            value={bucketValue.index?.toString() ?? ""}
          />
          <span className="text-muted-foreground text-sm">of</span>
          <Input
            aria-label="Partition count"
            className="w-20"
            min={2}
            onChange={(e) =>
              updateBucket({
                buckets:
                  e.target.value === ""
                    ? undefined
                    : Number.parseInt(e.target.value, 10),
              })
            }
            placeholder="6"
            type="number"
            value={bucketValue.buckets?.toString() ?? ""}
          />
        </div>
      );
    }

    // Number input for numeric fields
    if (fieldDef?.type === "number") {
      return (
        <Input
          className="flex-1"
          onChange={(e) =>
            handleValueChange(Number.parseInt(e.target.value, 10) || undefined)
          }
          placeholder="0"
          type="number"
          value={filter.value?.toString() || ""}
        />
      );
    }

    // Date input for date fields
    if (fieldDef?.type === "date" && (filter.operator as string) !== "within") {
      return (
        <Input
          className="flex-1"
          onChange={(e) => handleValueChange(e.target.value)}
          type="date"
          value={(filter.value as string) || ""}
        />
      );
    }

    // Custom property input
    if (
      filter.field === "properties" ||
      filter.field.startsWith("properties.")
    ) {
      // Extract property key - if field is just "properties", key is empty
      const currentPropertyKey =
        filter.field === "properties"
          ? ""
          : filter.field.replace("properties.", "");
      return (
        <div className="flex flex-1 items-center gap-2">
          {propertyKeys.length > 0 ? (
            <Select
              onValueChange={(key) =>
                onChange({
                  ...filter,
                  field: `properties.${key}`,
                })
              }
              value={currentPropertyKey || ""}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select property" />
              </SelectTrigger>
              <SelectContent>
                {propertyKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="w-32"
              onChange={(e) =>
                onChange({
                  ...filter,
                  field: `properties.${e.target.value}`,
                })
              }
              placeholder="property name"
              value={currentPropertyKey}
            />
          )}
          {ORDERED_OPERATORS.has(filter.operator) ? (
            <div className="flex flex-1 items-center gap-2">
              <Select
                onValueChange={(mode) => {
                  setPropertyValueMode(mode as "number" | "date");
                  handleValueChange(undefined);
                }}
                value={propertyValueMode}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">number</SelectItem>
                  <SelectItem value="date">date</SelectItem>
                </SelectContent>
              </Select>
              {propertyValueMode === "date" ? (
                <Input
                  className="flex-1"
                  onChange={(e) => handleValueChange(e.target.value)}
                  type="date"
                  value={(filter.value as string) || ""}
                />
              ) : (
                <Input
                  className="flex-1"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    handleValueChange(
                      e.target.value === "" || !Number.isFinite(n)
                        ? undefined
                        : n
                    );
                  }}
                  placeholder="0"
                  step="any"
                  type="number"
                  value={filter.value?.toString() || ""}
                />
              )}
            </div>
          ) : (
            <Input
              className="flex-1"
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder="value"
              value={(filter.value as string) || ""}
            />
          )}
        </div>
      );
    }

    // Default text input
    return (
      <Input
        className="flex-1"
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder="value"
        value={(filter.value as string) || ""}
      />
    );
  };

  return (
    <div className="flex flex-1 items-center gap-2">
      {/* Field selector */}
      <Select
        onValueChange={handleFieldChange}
        value={fieldDef?.id ?? filter.field.split(".")[0]}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          {FILTER_FIELDS.map((field) => (
            <SelectItem key={field.id} value={field.id}>
              {field.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator selector */}
      <Select onValueChange={handleOperatorChange} value={filter.operator}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Select operator" />
        </SelectTrigger>
        <SelectContent>
          {availableOperators.map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input */}
      {renderValueInput()}

      {/* Remove button */}
      {canRemove && (
        <Button
          className="h-9 w-9 shrink-0 p-0"
          onClick={onRemove}
          size="sm"
          variant="ghost"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
