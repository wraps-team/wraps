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

const { checkSegmentEntry } = await import("../services/workflow-events");
const { enqueueWorkflowStepBatch } = await import("../services/workflow-queue");
const { log } = await import("../lib/logger");

function selectChainNoLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

const BASE_PARAMS = {
  contactId: "contact-1",
  organizationId: "org-1",
  previousSegmentIds: [] as string[],
};

const mockSegment = (id: string, name = "Test Segment") => ({
  id,
  name,
  condition: { operator: "and", filters: [] },
  organizationId: "org-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
  description: null,
});

describe("checkSegmentEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { workflowsTriggered: 0 } when no segment_entry workflows exist", async () => {
    mockDbSelect.mockReturnValue(selectChainNoLimit([]));

    const result = await checkSegmentEntry(BASE_PARAMS);

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(mockGetSegmentsByIds).not.toHaveBeenCalled();
    expect(enqueueWorkflowStepBatch).not.toHaveBeenCalled();
  });

  it("returns { workflowsTriggered: 0 } and skips segment fetch when no workflow has a valid segmentId", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([
        { id: "wf-1", triggerConfig: null },
        { id: "wf-2", triggerConfig: {} },
      ])
    );

    const result = await checkSegmentEntry(BASE_PARAMS);

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(mockGetSegmentsByIds).not.toHaveBeenCalled();
    expect(enqueueWorkflowStepBatch).not.toHaveBeenCalled();
  });

  it("enqueues a trigger job when contact matches the segment condition", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([
        { id: "wf-1", triggerConfig: { segmentId: "seg-1" } },
      ])
    );
    mockGetSegmentsByIds.mockResolvedValue(
      new Map([["seg-1", mockSegment("seg-1", "VIP Customers")]])
    );
    mockContactMatchesCondition.mockResolvedValue(true);

    const result = await checkSegmentEntry(BASE_PARAMS);

    expect(result).toEqual({ workflowsTriggered: 1 });
    expect(enqueueWorkflowStepBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "trigger",
        workflowId: "wf-1",
        contactId: "contact-1",
        organizationId: "org-1",
        eventData: expect.objectContaining({
          segmentId: "seg-1",
          segmentName: "VIP Customers",
          enteredAt: expect.any(String),
        }),
      }),
    ]);
  });

  it("does NOT enqueue when contact does not match the segment condition", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([
        { id: "wf-1", triggerConfig: { segmentId: "seg-1" } },
      ])
    );
    mockGetSegmentsByIds.mockResolvedValue(
      new Map([["seg-1", mockSegment("seg-1")]])
    );
    mockContactMatchesCondition.mockResolvedValue(false);

    const result = await checkSegmentEntry(BASE_PARAMS);

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(enqueueWorkflowStepBatch).not.toHaveBeenCalled();
  });

  it("enqueues jobs for multiple matching segment+workflow pairs", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([
        { id: "wf-1", triggerConfig: { segmentId: "seg-1" } },
        { id: "wf-2", triggerConfig: { segmentId: "seg-2" } },
      ])
    );
    mockGetSegmentsByIds.mockResolvedValue(
      new Map([
        ["seg-1", mockSegment("seg-1", "Segment One")],
        ["seg-2", mockSegment("seg-2", "Segment Two")],
      ])
    );
    mockContactMatchesCondition.mockResolvedValue(true);

    const result = await checkSegmentEntry(BASE_PARAMS);

    expect(result).toEqual({ workflowsTriggered: 2 });
    expect(enqueueWorkflowStepBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ workflowId: "wf-1" }),
        expect.objectContaining({ workflowId: "wf-2" }),
      ])
    );
  });

  it("catches and logs errors from condition evaluation without throwing", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([
        { id: "wf-1", triggerConfig: { segmentId: "seg-1" } },
      ])
    );
    mockGetSegmentsByIds.mockResolvedValue(
      new Map([["seg-1", mockSegment("seg-1")]])
    );
    mockContactMatchesCondition.mockRejectedValue(
      new Error("DB connection error")
    );

    const result = await checkSegmentEntry(BASE_PARAMS);

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(log.error).toHaveBeenCalled();
    expect(enqueueWorkflowStepBatch).not.toHaveBeenCalled();
  });

  it("does not enqueue when the contact already was in the segment", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([
        { id: "wf-1", triggerConfig: { segmentId: "seg-1" } },
      ])
    );
    mockGetSegmentsByIds.mockResolvedValue(
      new Map([["seg-1", mockSegment("seg-1")]])
    );
    mockContactMatchesCondition.mockResolvedValue(true);

    const result = await checkSegmentEntry({
      ...BASE_PARAMS,
      previousSegmentIds: ["seg-1"],
    });

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(enqueueWorkflowStepBatch).not.toHaveBeenCalled();
  });

  it("enqueues only the newly entered segment", async () => {
    mockDbSelect.mockReturnValue(
      selectChainNoLimit([
        { id: "wf-1", triggerConfig: { segmentId: "seg-1" } },
        { id: "wf-2", triggerConfig: { segmentId: "seg-2" } },
      ])
    );
    mockGetSegmentsByIds.mockResolvedValue(
      new Map([["seg-2", mockSegment("seg-2", "Segment Two")]])
    );
    mockContactMatchesCondition.mockResolvedValue(true);

    const result = await checkSegmentEntry({
      ...BASE_PARAMS,
      previousSegmentIds: ["seg-1"],
    });

    expect(result).toEqual({ workflowsTriggered: 1 });
    expect(enqueueWorkflowStepBatch).toHaveBeenCalledWith([
      expect.objectContaining({ workflowId: "wf-2" }),
    ]);
  });
});
