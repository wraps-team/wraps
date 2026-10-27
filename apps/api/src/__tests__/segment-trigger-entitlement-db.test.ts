/**
 * Segment entry and exit workflow triggers need the segments feature
 * (Business and up). Runtime half: real database, real plan lookup.
 *
 * An org that no longer has segments keeps its enabled workflows, but they do
 * not fire on segment membership. Licensed self-hosted deployments are always
 * open, so WRAPS_LICENSE_KEY is stubbed empty to make the gate run.
 *
 * File suffix `-db.test.ts` = real test database.
 */

import {
  db,
  eq,
  insertSegment,
  segment,
  subscription,
  workflow,
  workflowExecution,
} from "@wraps/db";
import { inArray } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanupBaseOrg,
  seedBaseOrg,
  workflowRow,
} from "../(ee)/__tests__/fixtures/real-db";

const { mockEnqueue } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(async () => undefined),
}));

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStepBatch: mockEnqueue,
  enqueueWorkflowStep: vi.fn(),
  deleteScheduledStep: vi.fn(),
}));

const { checkSegmentEntry, checkSegmentExit, getSegmentMembership } =
  await import("../services/workflow-events");

const PREFIX = `segtrig-${crypto.randomUUID().slice(0, 8)}`;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];
let matchingSegmentId: string;
let nonMatchingSegmentId: string;

// The fixture contact is active, so this matches it; the other never does.
const matches = {
  logic: "AND" as const,
  groups: [
    {
      filters: [
        { field: "status", operator: "equals" as const, value: "active" },
      ],
    },
  ],
};
const neverMatches = {
  logic: "AND" as const,
  groups: [
    {
      filters: [
        { field: "status", operator: "equals" as const, value: "bounced" },
      ],
    },
  ],
};

async function setPlan(plan: string, status = "active") {
  await db
    .update(subscription)
    .set({ plan, status })
    .where(eq(subscription.id, ids.subscription));
}

async function clearWorkflows() {
  await db
    .delete(workflowExecution)
    .where(eq(workflowExecution.organizationId, ids.org));
  await db.delete(workflow).where(eq(workflow.organizationId, ids.org));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
  const a = await insertSegment({
    organizationId: ids.org,
    name: "Matches the contact",
    condition: matches,
  });
  const b = await insertSegment({
    organizationId: ids.org,
    name: "Never matches",
    condition: neverMatches,
  });
  matchingSegmentId = a.id;
  nonMatchingSegmentId = b.id;
});

beforeEach(async () => {
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
  mockEnqueue.mockClear();
  await clearWorkflows();
  await db.insert(workflow).values([
    workflowRow(ids, {
      id: `${ids.org}-wf-entry`,
      name: "On entry",
      triggerType: "segment_entry",
      triggerConfig: { segmentId: matchingSegmentId },
      awsAccountId: ids.awsAccount,
    }),
    workflowRow(ids, {
      id: `${ids.org}-wf-exit`,
      name: "On exit",
      triggerType: "segment_exit",
      triggerConfig: { segmentId: nonMatchingSegmentId },
      awsAccountId: ids.awsAccount,
    }),
  ]);
});

afterEach(() => vi.unstubAllEnvs());

afterAll(async () => {
  await clearWorkflows();
  await db
    .delete(segment)
    .where(inArray(segment.id, [matchingSegmentId, nonMatchingSegmentId]));
  await cleanupBaseOrg(PREFIX);
});

const NO_SEGMENTS = ["free", "pro", "starter"];
const WITH_SEGMENTS = ["business", "growth", "scale"];

describe("segment_entry trigger", () => {
  it.each(NO_SEGMENTS)("does not fire on the %s plan", async (plan) => {
    await setPlan(plan);

    const result = await checkSegmentEntry({
      contactId: ids.contact,
      organizationId: ids.org,
      previousSegmentIds: [],
    });

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it.each(WITH_SEGMENTS)("fires on the %s plan", async (plan) => {
    await setPlan(plan);

    const result = await checkSegmentEntry({
      contactId: ids.contact,
      organizationId: ids.org,
      previousSegmentIds: [],
    });

    expect(result.workflowsTriggered).toBe(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("treats an org with a cancelled subscription as Free", async () => {
    await setPlan("business", "canceled");

    const result = await checkSegmentEntry({
      contactId: ids.contact,
      organizationId: ids.org,
      previousSegmentIds: [],
    });

    expect(result).toEqual({ workflowsTriggered: 0 });
  });

  it("starts firing again as soon as the org is on Business", async () => {
    await setPlan("pro");
    const blocked = await checkSegmentEntry({
      contactId: ids.contact,
      organizationId: ids.org,
      previousSegmentIds: [],
    });
    await setPlan("business");
    const allowed = await checkSegmentEntry({
      contactId: ids.contact,
      organizationId: ids.org,
      previousSegmentIds: [],
    });

    expect(blocked.workflowsTriggered).toBe(0);
    expect(allowed.workflowsTriggered).toBe(1);
  });
});

describe("segment_exit trigger", () => {
  it.each(NO_SEGMENTS)("does not fire on the %s plan", async (plan) => {
    await setPlan(plan);

    const result = await checkSegmentExit({
      contactId: ids.contact,
      organizationId: ids.org,
      previousSegmentIds: [nonMatchingSegmentId],
    });

    expect(result).toEqual({ workflowsTriggered: 0 });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it.each(WITH_SEGMENTS)("fires on the %s plan", async (plan) => {
    await setPlan(plan);

    const result = await checkSegmentExit({
      contactId: ids.contact,
      organizationId: ids.org,
      previousSegmentIds: [nonMatchingSegmentId],
    });

    expect(result.workflowsTriggered).toBe(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });
});

describe("getSegmentMembership", () => {
  it("reports no memberships for an org without segments", async () => {
    await setPlan("pro");

    expect(
      await getSegmentMembership({
        contactId: ids.contact,
        organizationId: ids.org,
      })
    ).toEqual([]);
  });

  it("reports the contact's segments for a Business org", async () => {
    await setPlan("business");

    expect(
      await getSegmentMembership({
        contactId: ids.contact,
        organizationId: ids.org,
      })
    ).toContain(matchingSegmentId);
  });
});
