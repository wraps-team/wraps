import { describe, expect, it } from "vitest";
import {
  type BroadcastAudience,
  evaluateBroadcastEntitlements,
  hasFeature,
  type PlanId,
  workflowTriggerFeature,
} from "../plans";

const ALL_PLANS: PlanId[] = [
  "free",
  "pro",
  "business",
  "starter",
  "growth",
  "scale",
];

describe("broadcast plan flags", () => {
  it("every plan can broadcast to all contacts", () => {
    for (const plan of ALL_PLANS) {
      expect(hasFeature(plan, "batch")).toBe(true);
    }
  });

  it("scheduling and topics start at Pro", () => {
    expect(hasFeature("free", "campaigns")).toBe(false);
    expect(hasFeature("free", "topics")).toBe(false);
    for (const plan of [
      "pro",
      "business",
      "starter",
      "growth",
      "scale",
    ] as const) {
      expect(hasFeature(plan, "campaigns")).toBe(true);
      expect(hasFeature(plan, "topics")).toBe(true);
    }
  });

  it("segments start at Business; legacy plans rank with their successor", () => {
    expect(hasFeature("free", "segments")).toBe(false);
    expect(hasFeature("pro", "segments")).toBe(false);
    expect(hasFeature("starter", "segments")).toBe(false);
    for (const plan of ["business", "growth", "scale"] as const) {
      expect(hasFeature(plan, "segments")).toBe(true);
    }
  });
});

describe("evaluateBroadcastEntitlements", () => {
  const ok = (
    plan: PlanId,
    audienceType: BroadcastAudience | undefined,
    scheduled: boolean
  ) => evaluateBroadcastEntitlements(plan, { audienceType, scheduled }).allowed;

  it("lets every plan send to all contacts right now", () => {
    for (const plan of ALL_PLANS) {
      expect(ok(plan, "all", false)).toBe(true);
      expect(ok(plan, undefined, false)).toBe(true);
    }
  });

  it("requires Pro for topics and scheduling, Business for segments", () => {
    expect(ok("free", "topic", false)).toBe(false);
    expect(ok("pro", "topic", false)).toBe(true);
    expect(ok("free", "all", true)).toBe(false);
    expect(ok("pro", "all", true)).toBe(true);
    expect(ok("pro", "segment", false)).toBe(false);
    expect(ok("business", "segment", false)).toBe(true);
  });

  it("applies every requirement of a combined request", () => {
    expect(ok("pro", "segment", true)).toBe(false);
    expect(ok("business", "segment", true)).toBe(true);
    expect(ok("starter", "topic", true)).toBe(true);
    expect(ok("starter", "segment", true)).toBe(false);
  });

  it("names the unmet feature and the plan that unlocks it", () => {
    const scheduled = evaluateBroadcastEntitlements("free", {
      audienceType: "all",
      scheduled: true,
    });
    expect(scheduled.allowed).toBe(false);
    expect(scheduled.feature).toBe("campaigns");
    expect(scheduled.requiredPlan).toBe("pro");
    expect(scheduled.message).toMatch(/scheduling/i);

    const segment = evaluateBroadcastEntitlements("pro", {
      audienceType: "segment",
      scheduled: false,
    });
    expect(segment.allowed).toBe(false);
    expect(segment.feature).toBe("segments");
    expect(segment.requiredPlan).toBe("business");
    expect(segment.message).toMatch(/business/i);
  });

  it("reports the segment gap first when several are unmet", () => {
    const r = evaluateBroadcastEntitlements("free", {
      audienceType: "segment",
      scheduled: true,
    });
    expect(r.feature).toBe("segments");
  });

  it("treats an unknown plan as no access beyond the default", () => {
    expect(ok("constructor" as PlanId, "topic", false)).toBe(false);
  });
});

describe("workflowTriggerFeature", () => {
  it("segment triggers need segments; every other trigger is open", () => {
    expect(workflowTriggerFeature("segment_entry")).toBe("segments");
    expect(workflowTriggerFeature("segment_exit")).toBe("segments");
    for (const t of [
      "event",
      "api",
      "schedule",
      "contact_created",
      "topic_subscribed",
      undefined,
      null,
      "",
    ]) {
      expect(workflowTriggerFeature(t)).toBeNull();
    }
  });

  it("resolves to the Business plan for Free and Pro", () => {
    const feature = workflowTriggerFeature("segment_entry");
    expect(feature && hasFeature("free", feature)).toBe(false);
    expect(feature && hasFeature("pro", feature)).toBe(false);
    expect(feature && hasFeature("business", feature)).toBe(true);
  });
});
