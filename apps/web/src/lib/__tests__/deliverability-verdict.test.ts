import { describe, expect, it } from "vitest";
import {
  deliverabilityVerdict,
  MIN_SENDS_FOR_VERDICT,
} from "@/lib/deliverability-verdict";

const rated = (bounceRate: number | null, complaintRate: number | null) =>
  deliverabilityVerdict({
    bounceRate,
    complaintRate,
    sends: 5000,
    rangeLabel: "30 days",
  });

describe("volume gate", () => {
  it("returns none for zero sends whatever the rates", () => {
    const v = deliverabilityVerdict({
      bounceRate: 10,
      complaintRate: 1,
      sends: 0,
      rangeLabel: "7 days",
    });
    expect(v.level).toBe("none");
    expect(v.label).toBe("—");
    expect(v.sentence).toBe(
      "Nothing sent in the last 7 days. Deliverability appears here once you start sending."
    );
  });

  it("returns insufficient below the minimum, even at a 10% bounce rate", () => {
    const v = deliverabilityVerdict({
      bounceRate: 10,
      complaintRate: 0,
      sends: 99,
      rangeLabel: "30 days",
    });
    expect(v.level).toBe("insufficient");
    expect(v.label).toBe("Not rated");
    expect(v.worst).toBeNull();
  });

  it("interpolates sends, range and the one-bounce step into the insufficient sentence", () => {
    const v = deliverabilityVerdict({
      bounceRate: 7.14,
      complaintRate: 0,
      sends: 14,
      rangeLabel: "30 days",
    });
    expect(v.sentence).toBe(
      `Not enough sends to judge. You sent 14 emails in the last 30 days, and one bounce moves the rate by 7 points. Ratings start at ${MIN_SENDS_FOR_VERDICT} sends.`
    );
  });

  it("rates at exactly the minimum", () => {
    const v = deliverabilityVerdict({
      bounceRate: 5,
      complaintRate: 0,
      sends: MIN_SENDS_FOR_VERDICT,
      rangeLabel: "30 days",
    });
    expect(v.level).toBe("risk");
  });

  it("ignores the gate while sends is null (loading)", () => {
    const v = deliverabilityVerdict({
      bounceRate: 5,
      complaintRate: 0,
      sends: null,
      rangeLabel: "30 days",
    });
    expect(v.level).toBe("risk");
  });
});

describe("per-metric thresholds", () => {
  it.each([
    [2.4, "healthy"],
    [2.5, "watch"],
    [4.99, "watch"],
    [5, "risk"],
  ])("bounce %s is %s", (bounce, level) => {
    expect(rated(bounce, 0).level).toBe(level);
  });

  it.each([
    [0.049, "healthy"],
    [0.05, "watch"],
    [0.1, "risk"],
  ])("complaint %s is %s", (complaint, level) => {
    expect(rated(0, complaint).level).toBe(level);
  });
});

describe("overall level and worst metric", () => {
  it("takes the worse of the two metrics", () => {
    const v = rated(2.6, 0.12);
    expect(v.level).toBe("risk");
    expect(v.worst).toBe("complaint");
  });

  it("lets bounce win a tie", () => {
    const v = rated(5.8, 0.1);
    expect(v.level).toBe("risk");
    expect(v.worst).toBe("bounce");
  });

  it("names bounce as worst when both are healthy", () => {
    expect(rated(1, 0.01).worst).toBe("bounce");
  });

  it("returns unknown when both rates are null", () => {
    const v = rated(null, null);
    expect(v.level).toBe("unknown");
    expect(v.label).toBe("Not rated");
    expect(v.sentence).toBe(
      "SES has not published a reputation rate for this account yet."
    );
  });

  it("grades from the one rate that is present", () => {
    expect(rated(null, 0.06).level).toBe("watch");
    expect(rated(null, 0.06).worst).toBe("complaint");
    expect(rated(5.2, null).level).toBe("risk");
  });
});

describe("sentences", () => {
  it("uses the bounce line for a bounce watch", () => {
    expect(rated(3, 0).sentence).toBe(
      "Your bounce rate is past half of the SES review line (5%)."
    );
  });

  it("uses the complaint line, with its decimals, for a complaint risk", () => {
    expect(rated(0, 0.1).sentence).toBe(
      "Your complaint rate is at or over the SES review line (0.1%). SES may start an account review."
    );
  });

  it("states healthy in one sentence", () => {
    expect(rated(1, 0.01).sentence).toBe(
      "Bounce and complaint rates are well under half of the SES review lines."
    );
  });
});
