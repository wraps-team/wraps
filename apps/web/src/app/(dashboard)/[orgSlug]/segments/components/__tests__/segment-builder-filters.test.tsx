/**
 * @vitest-environment jsdom
 */

/**
 * Segment builder — list operators and event filters.
 *
 * F2: "is one of" / "is not one of" rendered a single-select and emitted a
 * scalar string, which Postgres rejected with `malformed array literal` on
 * every preview and every save. The control must produce an array.
 *
 * F17: event operators were implemented in SQL but no field could emit them.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@wraps/ui/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

import type { FilterCondition } from "@/lib/segments";
import { SegmentBuilder } from "../segment-builder";

const noop = () => {};

function oneFilter(
  filter: FilterCondition["groups"][number]["filters"][number]
): FilterCondition {
  return { logic: "AND", groups: [{ id: "group-1", filters: [filter] }] };
}

function renderBuilder(
  condition: FilterCondition,
  onChange: (c: FilterCondition) => void = noop
) {
  return render(
    <SegmentBuilder
      condition={condition}
      onChange={onChange}
      propertyKeys={[]}
      topics={[]}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("list operators emit an array", () => {
  it("renders a multi-select with every email status pressable", () => {
    renderBuilder(
      oneFilter({
        id: "filter-1",
        field: "status",
        operator: "inList",
        value: ["bounced"],
      })
    );

    const group = screen.getByRole("group", { name: "Email Status values" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bounced" })).toHaveAttribute(
      "data-state",
      "on"
    );
    expect(screen.getByRole("button", { name: "Complained" })).toHaveAttribute(
      "data-state",
      "off"
    );
  });

  it("adds a selected value to the array rather than replacing it", () => {
    const onChange = vi.fn();
    renderBuilder(
      oneFilter({
        id: "filter-1",
        field: "status",
        operator: "inList",
        value: ["bounced"],
      }),
      onChange
    );

    fireEvent.click(screen.getByRole("button", { name: "Complained" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0] as FilterCondition;
    expect(emitted.groups[0].filters[0].value).toEqual([
      "bounced",
      "complained",
    ]);
  });

  it("tolerates a legacy scalar value by treating it as a one-item list", () => {
    renderBuilder(
      oneFilter({
        id: "filter-1",
        field: "status",
        operator: "inList",
        value: "active",
      })
    );

    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute(
      "data-state",
      "on"
    );
  });
});

describe("event filters", () => {
  it("renders a free-text event name input", () => {
    renderBuilder(
      oneFilter({
        id: "filter-1",
        field: "event.course_download",
        operator: "triggered",
      })
    );

    const input = screen.getByLabelText("Event name");
    expect(input).toHaveValue("course_download");
  });

  it("writes the typed name back onto the field, namespaced", () => {
    const onChange = vi.fn();
    renderBuilder(
      oneFilter({ id: "filter-1", field: "event.", operator: "triggered" }),
      onChange
    );

    fireEvent.change(screen.getByLabelText("Event name"), {
      target: { value: "purchase_made" },
    });

    const emitted = onChange.mock.calls[0][0] as FilterCondition;
    expect(emitted.groups[0].filters[0].field).toBe("event.purchase_made");
  });

  it("adds a duration input for triggeredWithin", () => {
    renderBuilder(
      oneFilter({
        id: "filter-1",
        field: "event.course_download",
        operator: "triggeredWithin",
        value: 30,
        unit: "days",
      })
    );

    expect(screen.getByLabelText("Event name")).toHaveValue("course_download");
    expect(screen.getByLabelText("Duration")).toHaveValue(30);
  });

  it("shows no duration input for triggered", () => {
    renderBuilder(
      oneFilter({
        id: "filter-1",
        field: "event.course_download",
        operator: "triggered",
      })
    );

    expect(screen.queryByLabelText("Duration")).not.toBeInTheDocument();
  });
});
