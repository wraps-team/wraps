/**
 * checkSegmentEntry / checkSegmentExit Tests
 *
 * Verifies that segment entry/exit checking uses SQL-based evaluation
 * via contactMatchesCondition instead of in-memory JS evaluation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @wraps/db — single combined mock
const mockDbWhere = vi.fn();

vi.mock("@wraps/db", () => {
  const mockDbLimit = vi.fn();
  const mockWhere = (...args: unknown[]) => {
    const result = mockDbWhere(...args);
    return Object.assign(Promise.resolve(result), {
      limit: (...lArgs: unknown[]) => mockDbLimit(...lArgs),
    });
  };
  const mockDbFrom = vi.fn(() => ({ where: mockWhere }));
  const mockDbSelect = vi.fn(() => ({ from: mockDbFrom }));

  return {
    db: { select: mockDbSelect },
    eq: vi.fn(),
    contactMatchesCondition: vi.fn(),
    contactIdsMatchingCondition: vi.fn(),
    getSegmentsByIds: vi.fn(),
    buildConditionSQL: vi.fn(),
    buildFilterSQL: vi.fn(),
    workflow: {
      id: "id",
      organizationId: "organization_id",
      status: "status",
      triggerType: "trigger_type",
      triggerConfig: "trigger_config",
    },
    segment: {
      id: "id",
      name: "name",
      condition: "condition",
      organizationId: "organization_id",
    },
    contact: {
      id: "id",
      organizationId: "organization_id",
    },
    contactEvent: {
      id: "id",
      contactId: "contact_id",
      eventName: "event_name",
      createdAt: "created_at",
    },
    workflowExecution: {
      id: "id",
      workflowId: "workflow_id",
      contactId: "contact_id",
      status: "status",
    },
  };
});

// Mock workflow-queue
vi.mock("../workflow-queue", () => ({
  enqueueWorkflowStepBatch: vi.fn(),
  enqueueWorkflowStep: vi.fn(),
  deleteScheduledStep: vi.fn(),
}));

// Mock logger
vi.mock("../../lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  flushLogger: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks are set up
import { contactMatchesCondition, getSegmentsByIds } from "@wraps/db";
import { checkSegmentEntry, checkSegmentExit } from "../workflow-events";
import { enqueueWorkflowStepBatch } from "../workflow-queue";

const mockContactMatches = vi.mocked(contactMatchesCondition);
const mockGetSegments = vi.mocked(getSegmentsByIds);
const mockEnqueue = vi.mocked(enqueueWorkflowStepBatch);

describe("checkSegmentEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 when no segment_entry workflows exist", async () => {
    mockDbWhere.mockResolvedValueOnce([]);

    const result = await checkSegmentEntry({
      contactId: "contact-1",
      organizationId: "org-1",
    });

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(mockContactMatches).not.toHaveBeenCalled();
  });

  it("uses contactMatchesCondition (SQL) to evaluate segments", async () => {
    // First db call: get segment_entry workflows
    mockDbWhere.mockResolvedValueOnce([
      { id: "wf-1", triggerConfig: { segmentId: "seg-1" } },
    ]);

    const segmentCondition = {
      logic: "AND" as const,
      groups: [
        {
          filters: [{ field: "status", operator: "equals", value: "active" }],
        },
      ],
    };

    // getSegmentsByIds returns a Map
    mockGetSegments.mockResolvedValueOnce(
      new Map([
        [
          "seg-1",
          {
            id: "seg-1",
            name: "Active Users",
            condition: segmentCondition,
          } as never,
        ],
      ])
    );

    mockContactMatches.mockResolvedValue(true);
    mockEnqueue.mockResolvedValue(undefined as never);

    const result = await checkSegmentEntry({
      contactId: "contact-1",
      organizationId: "org-1",
    });

    expect(result).toEqual({ workflowsTriggered: 1 });
    expect(mockGetSegments).toHaveBeenCalledWith(
      expect.anything(), // db
      ["seg-1"],
      "org-1"
    );
    expect(mockContactMatches).toHaveBeenCalledWith(
      expect.anything(), // db
      "contact-1",
      "org-1",
      expect.objectContaining({ logic: "AND" })
    );
  });

  it("does not trigger workflow when contact does not match segment", async () => {
    mockDbWhere.mockResolvedValueOnce([
      { id: "wf-1", triggerConfig: { segmentId: "seg-1" } },
    ]);
    mockGetSegments.mockResolvedValueOnce(
      new Map([
        [
          "seg-1",
          {
            id: "seg-1",
            name: "Active Users",
            condition: {
              logic: "AND",
              groups: [
                {
                  filters: [
                    { field: "status", operator: "equals", value: "active" },
                  ],
                },
              ],
            },
          } as never,
        ],
      ])
    );

    mockContactMatches.mockResolvedValue(false);

    const result = await checkSegmentEntry({
      contactId: "contact-1",
      organizationId: "org-1",
    });

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe("checkSegmentExit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 when no segment_exit workflows exist", async () => {
    mockDbWhere.mockResolvedValueOnce([]);

    const result = await checkSegmentExit({
      contactId: "contact-1",
      organizationId: "org-1",
    });

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(mockContactMatches).not.toHaveBeenCalled();
  });

  it("triggers workflow when contact no longer matches segment (SQL)", async () => {
    mockDbWhere.mockResolvedValueOnce([
      { id: "wf-1", triggerConfig: { segmentId: "seg-1" } },
    ]);
    mockGetSegments.mockResolvedValueOnce(
      new Map([
        [
          "seg-1",
          {
            id: "seg-1",
            name: "Active Users",
            condition: {
              logic: "AND",
              groups: [
                {
                  filters: [
                    { field: "status", operator: "equals", value: "active" },
                  ],
                },
              ],
            },
          } as never,
        ],
      ])
    );

    // false → contact exited segment
    mockContactMatches.mockResolvedValue(false);
    mockEnqueue.mockResolvedValue(undefined as never);

    const result = await checkSegmentExit({
      contactId: "contact-1",
      organizationId: "org-1",
    });

    expect(result).toEqual({ workflowsTriggered: 1 });
    expect(mockContactMatches).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalled();
  });

  it("does not trigger workflow when contact still matches segment", async () => {
    mockDbWhere.mockResolvedValueOnce([
      { id: "wf-1", triggerConfig: { segmentId: "seg-1" } },
    ]);
    mockGetSegments.mockResolvedValueOnce(
      new Map([
        [
          "seg-1",
          {
            id: "seg-1",
            name: "Active Users",
            condition: {
              logic: "AND",
              groups: [
                {
                  filters: [
                    { field: "status", operator: "equals", value: "active" },
                  ],
                },
              ],
            },
          } as never,
        ],
      ])
    );

    // true → still in segment, no exit
    mockContactMatches.mockResolvedValue(true);

    const result = await checkSegmentExit({
      contactId: "contact-1",
      organizationId: "org-1",
    });

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
