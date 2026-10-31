import { describe, expect, it } from "vitest";
import type { FilterCondition } from "../schema/segments";
import { validateCondition } from "../segment-condition";

// The API passes the request's condition through untyped, so these shapes
// reach validateCondition as-is. Each must be a message, never a TypeError.
const asCondition = (value: unknown) => value as FilterCondition;

describe("validateCondition rejects malformed shapes with a message", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "status = active"],
    ["an array", []],
  ])("a condition that is %s", (_label, value) => {
    expect(validateCondition(asCondition(value))).toBe(
      "Condition must be an object with logic and groups"
    );
  });

  it("an object without groups, as in { operator, conditions }", () => {
    expect(
      validateCondition(asCondition({ operator: "and", conditions: [] }))
    ).toBe("At least one filter group is required");
  });

  it("groups that is not an array", () => {
    expect(validateCondition(asCondition({ logic: "AND", groups: {} }))).toBe(
      "At least one filter group is required"
    );
  });

  it("a group that is not an object, or has no filters array", () => {
    expect(
      validateCondition(asCondition({ logic: "AND", groups: ["x"] }))
    ).toBe("Each group must have at least one filter");
    expect(
      validateCondition(asCondition({ logic: "AND", groups: [{ filters: 1 }] }))
    ).toBe("Each group must have at least one filter");
  });

  it("a filter that is not an object", () => {
    expect(
      validateCondition(
        asCondition({ logic: "AND", groups: [{ filters: [null] }] })
      )
    ).toBe("Each filter must be an object with field, operator and value");
  });

  it("still accepts a well-formed condition", () => {
    expect(
      validateCondition({
        logic: "AND",
        groups: [
          {
            filters: [{ field: "status", operator: "equals", value: "active" }],
          },
        ],
      } as FilterCondition)
    ).toBeNull();
  });
});
