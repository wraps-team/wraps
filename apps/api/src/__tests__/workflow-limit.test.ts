import { describe, expect, it } from "vitest";
import {
  exceedsWorkflowLimit,
  getMaxWorkflows,
} from "../(ee)/lib/workflow-limit";

describe("exceedsWorkflowLimit", () => {
  it("never exceeds when unlimited (-1)", () => {
    expect(
      exceedsWorkflowLimit({ limit: -1, current: 1000, newCount: 1000 })
    ).toBe(false);
  });

  it("allows reaching the limit exactly", () => {
    expect(exceedsWorkflowLimit({ limit: 2, current: 1, newCount: 1 })).toBe(
      false
    );
  });

  it("refuses creating past the limit", () => {
    expect(exceedsWorkflowLimit({ limit: 2, current: 2, newCount: 1 })).toBe(
      true
    );
  });

  it("allows updates by an org already over the limit", () => {
    expect(exceedsWorkflowLimit({ limit: 2, current: 5, newCount: 0 })).toBe(
      false
    );
  });

  it("refuses a single batch that would overshoot", () => {
    expect(exceedsWorkflowLimit({ limit: 2, current: 0, newCount: 3 })).toBe(
      true
    );
  });
});

describe("getMaxWorkflows", () => {
  it("returns the plan's limit", () => {
    expect(getMaxWorkflows("free")).toBe(2);
    expect(getMaxWorkflows("pro")).toBe(-1);
  });

  it("falls back to the free limit for null and non-plan strings", () => {
    expect(getMaxWorkflows(null)).toBe(2);
    expect(getMaxWorkflows("constructor")).toBe(2);
  });
});
