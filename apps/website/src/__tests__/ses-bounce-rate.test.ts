import { describe, expect, it } from "vitest";
import {
  BOUNCE_THRESHOLDS,
  COMPLAINT_THRESHOLDS,
  estimateSesRates,
} from "@/lib/ses-bounce-rate";

function rates(
  sends: number,
  hardBounces: number,
  complaints = 0,
  softBounces = 0
) {
  const result = estimateSesRates({
    sends,
    hardBounces,
    softBounces,
    complaints,
  });
  if (!result) {
    throw new Error("expected an estimate");
  }
  return result;
}

describe("thresholds", () => {
  it("match the values quoted on /ses/bounce-rate and /ses/complaint-rate", () => {
    expect(BOUNCE_THRESHOLDS).toEqual({
      bestPracticeBp: 200,
      reviewBp: 500,
      pauseBp: 1000,
    });
    expect(COMPLAINT_THRESHOLDS).toEqual({
      bestPracticeBp: 10,
      reviewBp: 10,
      pauseBp: 50,
    });
  });
});

describe("bounce status at each boundary (1,000 sends)", () => {
  it("is within best practice below 2%", () => {
    expect(rates(1000, 19).bounce.status).toBe("within-best-practice");
  });

  it("is above best practice from 2% up to just under 5%", () => {
    expect(rates(1000, 20).bounce.status).toBe("above-best-practice");
    expect(rates(1000, 49).bounce.status).toBe("above-best-practice");
  });

  it("enters review at exactly 5%, not just above it", () => {
    expect(rates(1000, 50).bounce.status).toBe("review");
    expect(rates(1000, 51).bounce.status).toBe("review");
    expect(rates(1000, 99).bounce.status).toBe("review");
  });

  it("enters pause at exactly 10%", () => {
    expect(rates(1000, 100).bounce.status).toBe("pause");
    expect(rates(1000, 101).bounce.status).toBe("pause");
  });
});

describe("complaint status at each boundary (10,000 sends)", () => {
  it("is within best practice below 0.1%", () => {
    expect(rates(10_000, 0, 9).complaint.status).toBe("within-best-practice");
  });

  it("enters review at exactly 0.1%", () => {
    expect(rates(10_000, 0, 10).complaint.status).toBe("review");
    expect(rates(10_000, 0, 11).complaint.status).toBe("review");
    expect(rates(10_000, 0, 49).complaint.status).toBe("review");
  });

  it("enters pause at exactly 0.5%", () => {
    expect(rates(10_000, 0, 50).complaint.status).toBe("pause");
    expect(rates(10_000, 0, 51).complaint.status).toBe("pause");
  });
});

describe("headroom", () => {
  it("counts hard bounces left before the 5% review line", () => {
    expect(rates(1000, 0).bounce.headroomToReview).toBe(50);
    expect(rates(1000, 49).bounce.headroomToReview).toBe(1);
    expect(rates(1000, 50).bounce.headroomToReview).toBe(0);
    expect(rates(1000, 51).bounce.headroomToReview).toBe(0);
  });

  it("rounds up when the line falls between whole bounces", () => {
    // 5% of 333 is 16.65, so 16 bounces (4.8%) is below the line and 17 is not.
    const below = rates(333, 16).bounce;
    expect(below.countAtReview).toBe(17);
    expect(below.headroomToReview).toBe(1);
    expect(below.status).toBe("above-best-practice");
    expect(rates(333, 17).bounce.status).toBe("review");
  });

  it("does not drift on floating point boundaries", () => {
    // Whole-number results must stay whole (float math gives 0.07 * 100 = 7.000000000000001).
    expect(
      estimateSesRates({
        sends: 100,
        hardBounces: 0,
        softBounces: 0,
        complaints: 0,
      })?.bounce.countAtReview
    ).toBe(5);
    expect(rates(3000, 0).complaint.countAtReview).toBe(3);
  });

  it("counts complaints left before 0.1%", () => {
    expect(rates(10_000, 0, 9).complaint.headroomToReview).toBe(1);
    expect(rates(10_000, 0, 10).complaint.headroomToReview).toBe(0);
  });

  it("gives headroom to the pause line too", () => {
    expect(rates(1000, 60).bounce.headroomToPause).toBe(40);
    expect(rates(1000, 100).bounce.headroomToPause).toBe(0);
  });
});

describe("inputs", () => {
  it("returns null for zero sends instead of dividing by zero", () => {
    expect(
      estimateSesRates({
        sends: 0,
        hardBounces: 5,
        softBounces: 0,
        complaints: 0,
      })
    ).toBeNull();
  });

  it("returns null for negative or non-finite sends", () => {
    expect(
      estimateSesRates({
        sends: -5,
        hardBounces: 0,
        softBounces: 0,
        complaints: 0,
      })
    ).toBeNull();
    expect(
      estimateSesRates({
        sends: Number.NaN,
        hardBounces: 0,
        softBounces: 0,
        complaints: 0,
      })
    ).toBeNull();
  });

  it("computes the bounce rate from hard bounces only", () => {
    const result = rates(1000, 10, 0, 500);
    expect(result.bounce.ratePercent).toBeCloseTo(1, 10);
    expect(result.bounce.status).toBe("within-best-practice");
    expect(result.softBounces).toBe(500);
  });

  it("flags hard bounces or complaints above sends as inconsistent", () => {
    expect(rates(100, 101).inconsistent).toBe(true);
    expect(rates(100, 0, 101).inconsistent).toBe(true);
    expect(rates(100, 100).inconsistent).toBe(false);
  });

  it("treats fractional and negative counts as whole, non-negative numbers", () => {
    const result = rates(1000, 10.9, -3);
    expect(result.bounce.count).toBe(10);
    expect(result.complaint.count).toBe(0);
  });
});
