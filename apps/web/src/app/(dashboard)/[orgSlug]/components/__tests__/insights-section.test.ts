import { describe, expect, it } from "vitest";
import { detectVolumeAnomalies } from "../insights-section";

type EmailPoint = {
  date: string;
  sent: number;
  delivered?: number;
  bounced?: number;
  renderingFailures?: number;
};

const findDelivery = (data: EmailPoint[]) =>
  detectVolumeAnomalies(data).find((a) => a.metric === "Email delivery rate");

describe("detectVolumeAnomalies — delivery rate", () => {
  it("does not subtract rendering failures from the previous denominator", () => {
    // Regression for the double-subtraction skew. `sent` from /analytics/volume
    // counts status != 'failed' and `renderingFailures` counts status =
    // 'failed' — disjoint sets, so `sent` is already the effective denominator.
    // Both halves here delivered 297 of 300 non-failed sends = 99%, so nothing
    // dropped. Subtracting the previous half's 30 rendering failures would put
    // its denominator at 270, reporting a 110% previous rate and a fabricated
    // 11pp 'critical' delivery-rate drop.
    const data: EmailPoint[] = [
      { date: "1", sent: 150, delivered: 149, renderingFailures: 15 },
      { date: "2", sent: 150, delivered: 148, renderingFailures: 15 },
      { date: "3", sent: 150, delivered: 149, renderingFailures: 0 },
      { date: "4", sent: 150, delivered: 148, renderingFailures: 0 },
    ];
    expect(findDelivery(data)).toBeUndefined();
  });

  it("does not subtract rendering failures from the current denominator", () => {
    // Previous: 297/300 = 99%. Current: 297 delivered of 330 non-failed sends
    // = 90%, alongside 30 rendering failures that are counted separately. That
    // 9pp drop is real and must surface. Subtracting the rendering failures
    // would put the denominator back at 300, restore 99%, and silence it.
    const data: EmailPoint[] = [
      { date: "1", sent: 150, delivered: 149, renderingFailures: 0 },
      { date: "2", sent: 150, delivered: 148, renderingFailures: 0 },
      { date: "3", sent: 165, delivered: 149, renderingFailures: 15 },
      { date: "4", sent: 165, delivered: 148, renderingFailures: 15 },
    ];
    const anomaly = findDelivery(data);
    expect(anomaly?.severity).toBe("warning");
    expect(anomaly?.previous).toBeCloseTo(99, 0);
    expect(anomaly?.current).toBeCloseTo(90, 0);
  });

  it("ignores low-volume noise (the dogfood 98.7% → 86.4% case)", () => {
    // 149 then 110 sends — a 12.3pp swing, but on a few dozen sends it's noise.
    const data: EmailPoint[] = [
      { date: "1", sent: 75, delivered: 74, renderingFailures: 0 },
      { date: "2", sent: 74, delivered: 73, renderingFailures: 0 },
      { date: "3", sent: 55, delivered: 48, renderingFailures: 4 },
      { date: "4", sent: 55, delivered: 47, renderingFailures: 4 },
    ];
    expect(findDelivery(data)).toBeUndefined();
  });

  it("still fires critical on a genuine high-volume drop", () => {
    // 99% → 88% on 300 effective sends per half = real 11pp drop.
    const data: EmailPoint[] = [
      { date: "1", sent: 150, delivered: 149, renderingFailures: 0 },
      { date: "2", sent: 150, delivered: 148, renderingFailures: 0 },
      { date: "3", sent: 150, delivered: 132, renderingFailures: 0 },
      { date: "4", sent: 150, delivered: 132, renderingFailures: 0 },
    ];
    const anomaly = findDelivery(data);
    expect(anomaly?.severity).toBe("critical");
    expect(anomaly?.previous).toBeCloseTo(99, 0);
    expect(anomaly?.current).toBeCloseTo(88, 0);
  });
});
