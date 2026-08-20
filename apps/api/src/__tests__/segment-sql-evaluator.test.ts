/**
 * SQL-based Segment Evaluator Tests
 *
 * Tests for contactMatchesCondition and contactIdsMatchingCondition
 * which evaluate segment conditions via SQL queries.
 */

import type { FilterCondition } from "@wraps/db";
import {
  contactIdsMatchingCondition,
  contactMatchesCondition,
} from "@wraps/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Build a mock db chain: db.select().from().where().limit()
function createMockDb() {
  const mockLimit = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockWhere: any = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = { select: mockSelect } as any;
  return { db, mockSelect, mockFrom, mockWhere, mockLimit };
}

describe("contactMatchesCondition", () => {
  let mocks: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mocks = createMockDb();
  });

  it("returns true when contact matches condition (query returns a row)", async () => {
    mocks.mockLimit.mockResolvedValue([{ id: "contact-1" }]);

    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        {
          filters: [{ field: "status", operator: "equals", value: "active" }],
        },
      ],
    };

    const result = await contactMatchesCondition(
      mocks.db,
      "contact-1",
      "org-1",
      condition
    );

    expect(result).toBe(true);
    expect(mocks.mockSelect).toHaveBeenCalled();
  });

  it("returns false when contact does not match condition (query returns empty)", async () => {
    mocks.mockLimit.mockResolvedValue([]);

    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        {
          filters: [{ field: "status", operator: "equals", value: "active" }],
        },
      ],
    };

    const result = await contactMatchesCondition(
      mocks.db,
      "contact-2",
      "org-1",
      condition
    );

    expect(result).toBe(false);
  });

  it("returns false for empty condition (no groups) — fails closed", async () => {
    const condition: FilterCondition = {
      logic: "AND",
      groups: [],
    };

    const result = await contactMatchesCondition(
      mocks.db,
      "contact-1",
      "org-1",
      condition
    );

    expect(result).toBe(false);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });

  it("returns false when condition has only unknown fields (buildConditionSQL returns null)", async () => {
    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        {
          filters: [
            { field: "unknownField", operator: "equals", value: "test" },
          ],
        },
      ],
    };

    const result = await contactMatchesCondition(
      mocks.db,
      "contact-1",
      "org-1",
      condition
    );

    expect(result).toBe(false);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });
});

describe("contactIdsMatchingCondition", () => {
  let mocks: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mocks = createMockDb();
  });

  it("returns matching contact IDs from a batch", async () => {
    mocks.mockWhere.mockResolvedValue([
      { id: "contact-1" },
      { id: "contact-3" },
    ]);

    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        {
          filters: [{ field: "status", operator: "equals", value: "active" }],
        },
      ],
    };

    const result = await contactIdsMatchingCondition(
      mocks.db,
      ["contact-1", "contact-2", "contact-3"],
      "org-1",
      condition
    );

    expect(result).toEqual(["contact-1", "contact-3"]);
  });

  it("returns empty array when no contacts match", async () => {
    mocks.mockWhere.mockResolvedValue([]);

    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        {
          filters: [{ field: "status", operator: "equals", value: "bounced" }],
        },
      ],
    };

    const result = await contactIdsMatchingCondition(
      mocks.db,
      ["contact-1", "contact-2"],
      "org-1",
      condition
    );

    expect(result).toEqual([]);
  });

  it("returns no IDs for empty condition — fails closed", async () => {
    const condition: FilterCondition = {
      logic: "AND",
      groups: [],
    };

    const result = await contactIdsMatchingCondition(
      mocks.db,
      ["contact-1", "contact-2", "contact-3"],
      "org-1",
      condition
    );

    expect(result).toEqual([]);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });

  it("returns empty array when given empty contactIds", async () => {
    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        {
          filters: [{ field: "status", operator: "equals", value: "active" }],
        },
      ],
    };

    const result = await contactIdsMatchingCondition(
      mocks.db,
      [],
      "org-1",
      condition
    );

    expect(result).toEqual([]);
    expect(mocks.mockSelect).not.toHaveBeenCalled();
  });
});
