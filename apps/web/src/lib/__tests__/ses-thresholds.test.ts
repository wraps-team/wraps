import { describe, expect, it } from "vitest";
import {
  formatRate,
  formatThreshold,
  meterGeometry,
  SES_THRESHOLDS,
} from "../ses-thresholds";

describe("SES_THRESHOLDS", () => {
  // These mirror apps/api/src/lib/ses-health.ts, which apps/web cannot
  // import. If that file's numbers change and this copy doesn't, the strip
  // draws AWS's lines in the wrong place — so pin them rather than trust the
  // comment.
  it("carries AWS's own bounce lines as decimals", () => {
    expect(SES_THRESHOLDS.bounce.review).toBe(0.05);
    expect(SES_THRESHOLDS.bounce.pause).toBe(0.1);
  });

  it("carries AWS's own complaint lines as decimals", () => {
    expect(SES_THRESHOLDS.complaint.review).toBe(0.001);
    expect(SES_THRESHOLDS.complaint.pause).toBe(0.005);
  });

  it("keeps the quota warning at 80%", () => {
    expect(SES_THRESHOLDS.quotaWarnRatio).toBe(0.8);
  });
});

describe("meterGeometry", () => {
  const { review, pause } = SES_THRESHOLDS.bounce;

  it("puts the pause line at 80% of the bar, leaving headroom past it", () => {
    const { pausePct } = meterGeometry(0, review, pause);
    expect(pausePct).toBeCloseTo(80);
  });

  it("keeps both lines apart enough to read", () => {
    const { reviewPct, pausePct } = meterGeometry(0, review, pause);
    expect(reviewPct).toBeCloseTo(40);
    expect(pausePct - reviewPct).toBeGreaterThan(20);
  });

  it("grades a rate against the lines", () => {
    expect(meterGeometry(0.02, review, pause).level).toBe("ok");
    expect(meterGeometry(0.05, review, pause).level).toBe("review");
    expect(meterGeometry(0.1, review, pause).level).toBe("pause");
  });

  it("treats the lines as inclusive, matching classifySesHealth's >=", () => {
    expect(meterGeometry(0.049_99, review, pause).level).toBe("ok");
    expect(meterGeometry(0.099_99, review, pause).level).toBe("review");
  });

  it("clamps a rate past the end of the scale instead of overflowing", () => {
    const { valuePct, level } = meterGeometry(0.9, review, pause);
    expect(valuePct).toBe(100);
    expect(level).toBe("pause");
  });

  it("never returns a negative fill", () => {
    expect(meterGeometry(0, review, pause).valuePct).toBe(0);
  });

  it("scales the complaint lines the same way despite being 50x smaller", () => {
    const complaint = SES_THRESHOLDS.complaint;
    const { reviewPct, pausePct } = meterGeometry(
      0,
      complaint.review,
      complaint.pause
    );
    expect(reviewPct).toBeCloseTo(16);
    expect(pausePct).toBeCloseTo(80);
  });
});

describe("formatRate", () => {
  it("keeps enough decimals for a complaint rate to be readable", () => {
    expect(formatRate(0.0004)).toBe("0.04%");
    expect(formatRate(0.021_3)).toBe("2.13%");
  });

  it("honours a requested precision", () => {
    expect(formatRate(0.021_3, 1)).toBe("2.1%");
  });
});

describe("formatThreshold", () => {
  it("drops trailing zeros so the lines read as AWS states them", () => {
    expect(formatThreshold(SES_THRESHOLDS.bounce.review)).toBe("5%");
    expect(formatThreshold(SES_THRESHOLDS.bounce.pause)).toBe("10%");
    expect(formatThreshold(SES_THRESHOLDS.complaint.review)).toBe("0.1%");
    expect(formatThreshold(SES_THRESHOLDS.complaint.pause)).toBe("0.5%");
  });
});
