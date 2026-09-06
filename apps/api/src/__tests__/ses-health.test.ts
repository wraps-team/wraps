import { describe, expect, it } from "vitest";
import {
  classifySesHealth,
  rollUpSesHealth,
  type SesHealthInput,
} from "../lib/ses-health.js";

const ALL_NULL: SesHealthInput = {
  sendingEnabled: null,
  enforcementStatus: null,
  bounceRate: null,
  complaintRate: null,
  quotaUsedRatio: null,
};

describe("classifySesHealth", () => {
  it("returns healthy with no reasons for an all-null input", () => {
    const verdict = classifySesHealth(ALL_NULL);
    expect(verdict.status).toBe("healthy");
    expect(verdict.reasons).toEqual([]);
  });

  it("classifies sendingEnabled: false as in_danger", () => {
    const verdict = classifySesHealth({ ...ALL_NULL, sendingEnabled: false });
    expect(verdict.status).toBe("in_danger");
    expect(verdict.reasons).toContain("sending_disabled");
  });

  it("classifies enforcementStatus SHUTDOWN as in_danger", () => {
    const verdict = classifySesHealth({
      ...ALL_NULL,
      enforcementStatus: "SHUTDOWN",
    });
    expect(verdict.status).toBe("in_danger");
    expect(verdict.reasons).toContain("enforcement_shutdown");
  });

  it("classifies enforcementStatus PROBATION as at_risk", () => {
    const verdict = classifySesHealth({
      ...ALL_NULL,
      enforcementStatus: "PROBATION",
    });
    expect(verdict.status).toBe("at_risk");
    expect(verdict.reasons).toContain("enforcement_probation");
  });

  it("classifies enforcementStatus HEALTHY as healthy", () => {
    const verdict = classifySesHealth({
      ...ALL_NULL,
      enforcementStatus: "HEALTHY",
    });
    expect(verdict.status).toBe("healthy");
    expect(verdict.reasons).toEqual([]);
  });

  it("bounce rate exactly at the review boundary (0.05) is at_risk (inclusive)", () => {
    const verdict = classifySesHealth({ ...ALL_NULL, bounceRate: 0.05 });
    expect(verdict.status).toBe("at_risk");
    expect(verdict.reasons).toContain("bounce_review");
  });

  it("bounce rate exactly at the pause boundary (0.10) is in_danger (inclusive)", () => {
    const verdict = classifySesHealth({ ...ALL_NULL, bounceRate: 0.1 });
    expect(verdict.status).toBe("in_danger");
    expect(verdict.reasons).toContain("bounce_pause");
  });

  it("bounce rate just under the review boundary (0.049) is healthy", () => {
    const verdict = classifySesHealth({ ...ALL_NULL, bounceRate: 0.049 });
    expect(verdict.status).toBe("healthy");
    expect(verdict.reasons).toEqual([]);
  });

  it("complaint rate exactly at the review boundary (0.001) is at_risk (inclusive)", () => {
    const verdict = classifySesHealth({ ...ALL_NULL, complaintRate: 0.001 });
    expect(verdict.status).toBe("at_risk");
    expect(verdict.reasons).toContain("complaint_review");
  });

  it("complaint rate exactly at the pause boundary (0.005) is in_danger (inclusive)", () => {
    const verdict = classifySesHealth({ ...ALL_NULL, complaintRate: 0.005 });
    expect(verdict.status).toBe("in_danger");
    expect(verdict.reasons).toContain("complaint_pause");
  });

  it("quotaUsedRatio 0.8 is at_risk", () => {
    const verdict = classifySesHealth({ ...ALL_NULL, quotaUsedRatio: 0.8 });
    expect(verdict.status).toBe("at_risk");
    expect(verdict.reasons).toContain("quota_high");
  });

  it("quotaUsedRatio 0.79 is healthy", () => {
    const verdict = classifySesHealth({ ...ALL_NULL, quotaUsedRatio: 0.79 });
    expect(verdict.status).toBe("healthy");
    expect(verdict.reasons).toEqual([]);
  });

  it("accumulates every fired rule, worst first, when multiple problems fire simultaneously", () => {
    const verdict = classifySesHealth({
      ...ALL_NULL,
      sendingEnabled: false,
      bounceRate: 0.06,
    });
    expect(verdict.status).toBe("in_danger");
    expect(verdict.reasons).toContain("sending_disabled");
    expect(verdict.reasons).toContain("bounce_review");
  });

  it("a null rate does not suppress a rule firing on another field", () => {
    const verdict = classifySesHealth({
      ...ALL_NULL,
      bounceRate: null,
      complaintRate: 0.006,
    });
    expect(verdict.status).toBe("in_danger");
    expect(verdict.reasons).toContain("complaint_pause");
  });
});

describe("rollUpSesHealth", () => {
  it("rolls an empty list up to unknown", () => {
    expect(rollUpSesHealth([])).toBe("unknown");
  });

  it("rolls a list of only null up to unknown", () => {
    expect(rollUpSesHealth([null])).toBe("unknown");
  });

  it("unknown outranks healthy", () => {
    expect(rollUpSesHealth(["healthy", null])).toBe("unknown");
  });

  it("at_risk outranks healthy", () => {
    expect(rollUpSesHealth(["healthy", "at_risk"])).toBe("at_risk");
  });

  it("in_danger outranks at_risk", () => {
    expect(rollUpSesHealth(["at_risk", "in_danger"])).toBe("in_danger");
  });
});
