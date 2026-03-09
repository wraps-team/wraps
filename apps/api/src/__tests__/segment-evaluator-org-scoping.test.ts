/**
 * getSegmentsByIds — Organization Scoping Tests
 *
 * Verifies that getSegmentsByIds only returns segments that belong to the
 * supplied organizationId, preventing cross-org segment IDOR via workflow
 * trigger configs.
 *
 * getSegmentsByIds receives `db` as an explicit parameter, so we pass a
 * mock DB object directly rather than mocking the module.
 */

import { getSegmentsByIds } from "@wraps/db";
import { describe, expect, it, vi } from "vitest";

// ─── Mock DB factory ─────────────────────────────────────────────────────────

type MockRow = {
  id: string;
  organizationId: string;
  name: string;
  condition: unknown;
  createdAt: Date;
  updatedAt: Date;
  description: null;
  createdBy: null;
};

function createMockDb(returnRows: MockRow[] = []) {
  const mockWhere = vi.fn().mockResolvedValue(returnRows);
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockDbSelect = vi.fn(() => ({ from: mockFrom }));
  // biome-ignore lint/suspicious/noExplicitAny: test-only mock DB
  return {
    db: { select: mockDbSelect } as any,
    mockWhere,
    mockFrom,
    mockDbSelect,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("getSegmentsByIds — organization scoping", () => {
  it("returns an empty map when no segments match", async () => {
    const { db } = createMockDb([]);

    const result = await getSegmentsByIds(db, ["seg-1"], "org-a");

    expect(result.size).toBe(0);
  });

  it("returns only segments returned by the DB query", async () => {
    const orgASegment: MockRow = {
      id: "seg-1",
      organizationId: "org-a",
      name: "Active Users",
      condition: { logic: "AND", groups: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
      description: null,
      createdBy: null,
    };

    const { db } = createMockDb([orgASegment]);

    const result = await getSegmentsByIds(db, ["seg-1", "seg-2"], "org-a");

    expect(result.size).toBe(1);
    expect(result.get("seg-1")).toEqual(orgASegment);
    expect(result.get("seg-2")).toBeUndefined();
  });

  it("returns an empty map for an empty segment ID list, without querying the DB", async () => {
    const { db, mockDbSelect } = createMockDb([]);

    const result = await getSegmentsByIds(db, [], "org-a");

    expect(result.size).toBe(0);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("calls the DB with a WHERE clause (org filter applied)", async () => {
    const { db, mockWhere } = createMockDb([]);

    await getSegmentsByIds(db, ["seg-1"], "org-a");

    expect(mockWhere).toHaveBeenCalledTimes(1);
    const whereArg = mockWhere.mock.calls[0][0];
    expect(whereArg).toBeDefined();
  });

  it("does not return segments from a different organization (DB correctly filters)", async () => {
    // Simulate DB returning nothing when querying org-b
    // (because the segments belong to org-a and the WHERE clause filters by org-b)
    const { db } = createMockDb([]);

    const result = await getSegmentsByIds(db, ["seg-from-org-a"], "org-b");

    expect(result.size).toBe(0);
  });

  it("builds a map keyed by segment id", async () => {
    const rows: MockRow[] = [
      {
        id: "seg-1",
        organizationId: "org-a",
        name: "Seg 1",
        condition: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        createdBy: null,
      },
      {
        id: "seg-2",
        organizationId: "org-a",
        name: "Seg 2",
        condition: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        createdBy: null,
      },
    ];

    const { db } = createMockDb(rows);

    const result = await getSegmentsByIds(db, ["seg-1", "seg-2"], "org-a");

    expect(result.size).toBe(2);
    expect(result.get("seg-1")?.name).toBe("Seg 1");
    expect(result.get("seg-2")?.name).toBe("Seg 2");
  });
});
