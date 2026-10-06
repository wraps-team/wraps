import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDbSelect = vi.fn();
const mockGetSegmentsByIds = vi.fn();
const mockContactMatchesCondition = vi.fn();

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn(),
  deleteScheduledStep: vi.fn(),
  enqueueWorkflowStepBatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");
  return {
    ...actual,
    db: { select: mockDbSelect },
    getSegmentsByIds: mockGetSegmentsByIds,
    contactMatchesCondition: mockContactMatchesCondition,
  };
});

const { getSegmentMembership } = await import("../services/workflow-events");

function selectChainNoLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

const PARAMS = { contactId: "contact-1", organizationId: "org-1" };

const mockSegment = (id: string) => ({
  id,
  name: id,
  condition: { operator: "and", filters: [] },
  organizationId: "org-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
  description: null,
});

describe("getSegmentMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] and skips segment lookup when there are no segment workflows", async () => {
    mockDbSelect.mockReturnValue(selectChainNoLimit([]));

    const result = await getSegmentMembership(PARAMS);

    expect(result).toEqual([]);
    expect(mockGetSegmentsByIds).not.toHaveBeenCalled();
  });

  it("returns only the segment IDs whose condition matches", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([
        { triggerConfig: { segmentId: "seg-1" } },
        { triggerConfig: { segmentId: "seg-2" } },
      ])
    );
    mockGetSegmentsByIds.mockResolvedValue(
      new Map([
        ["seg-1", mockSegment("seg-1")],
        ["seg-2", mockSegment("seg-2")],
      ])
    );
    mockContactMatchesCondition
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await getSegmentMembership(PARAMS);

    expect(result).toEqual(["seg-1"]);
    expect(mockContactMatchesCondition).toHaveBeenCalledTimes(2);
  });

  it("evaluates a segment once when entry and exit workflows both reference it", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([
        { triggerConfig: { segmentId: "seg-1" } },
        { triggerConfig: { segmentId: "seg-1" } },
      ])
    );
    mockGetSegmentsByIds.mockResolvedValue(
      new Map([["seg-1", mockSegment("seg-1")]])
    );
    mockContactMatchesCondition.mockResolvedValue(true);

    const result = await getSegmentMembership(PARAMS);

    expect(result).toEqual(["seg-1"]);
    expect(mockContactMatchesCondition).toHaveBeenCalledTimes(1);
    expect(mockGetSegmentsByIds).toHaveBeenCalledWith(
      expect.anything(),
      ["seg-1"],
      "org-1"
    );
  });

  it("skips workflows with no segmentId in triggerConfig", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([{ triggerConfig: {} }, { triggerConfig: null }])
    );

    const result = await getSegmentMembership(PARAMS);

    expect(result).toEqual([]);
    expect(mockGetSegmentsByIds).not.toHaveBeenCalled();
  });

  it("rejects when contactMatchesCondition rejects", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([{ triggerConfig: { segmentId: "seg-1" } }])
    );
    mockGetSegmentsByIds.mockResolvedValue(
      new Map([["seg-1", mockSegment("seg-1")]])
    );
    mockContactMatchesCondition.mockRejectedValue(new Error("db down"));

    await expect(getSegmentMembership(PARAMS)).rejects.toThrow("db down");
  });
});
