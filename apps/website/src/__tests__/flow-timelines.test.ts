import { describe, expect, it } from "vitest";
import { BROADCAST_FLOW } from "@/app/landing/components/broadcast-flow";
import { HEALTH_FLOW } from "@/app/landing/components/health-flow";
import { HERO_FLOW } from "@/app/landing/components/hero-flow";
import { SEND_FLOW } from "@/app/landing/components/send-flow";
import { WORKFLOW_FLOW } from "@/app/landing/components/workflow-flow";

// Each product animation is a timeline of [ms, stage] steps that must end on
// the finished frame it renders first, or the loop would settle somewhere else.
const FLOWS = {
  hero: HERO_FLOW,
  send: SEND_FLOW,
  broadcast: BROADCAST_FLOW,
  workflow: WORKFLOW_FLOW,
  health: HEALTH_FLOW,
};

describe.each(Object.entries(FLOWS))("%s flow timeline", (_name, flow) => {
  it("moves forward in time and in stage", () => {
    for (let i = 1; i < flow.timeline.length; i++) {
      expect(flow.timeline[i][0]).toBeGreaterThan(flow.timeline[i - 1][0]);
      expect(flow.timeline[i][1]).toBeGreaterThan(flow.timeline[i - 1][1]);
    }
  });

  it("ends on the finished frame it renders first", () => {
    expect(flow.timeline.at(-1)?.[1]).toBe(flow.final);
  });

  it("holds the finished frame for at least two seconds before looping", () => {
    const lastStep = flow.timeline.at(-1)?.[0] ?? 0;
    expect(flow.loopMs - lastStep).toBeGreaterThanOrEqual(2000);
  });
});
