import { describe, expect, it } from "vitest";
import { countYAxisProps, createCountAxisFormatter } from "../chart-axis";

describe("createCountAxisFormatter", () => {
  it("formats as whole k above 100k", () => {
    const format = createCountAxisFormatter(250_000);
    expect(format(150_000)).toBe("150k");
    expect(format(0)).toBe("0k");
  });

  it("formats as one-decimal k between 10k and 100k", () => {
    const format = createCountAxisFormatter(45_000);
    expect(format(12_500)).toBe("12.5k");
  });

  it("formats as one-decimal k between 1k and 10k", () => {
    const format = createCountAxisFormatter(5000);
    expect(format(1500)).toBe("1.5k");
  });

  it("keeps counts below 1k exact instead of rounding to a coarse grid", () => {
    expect(createCountAxisFormatter(600)(340)).toBe("340");
    expect(createCountAxisFormatter(80)(47)).toBe("47");
    expect(createCountAxisFormatter(8)(3.4)).toBe("3");
  });

  // Regression: the tens/hundreds buckets mapped several distinct ticks onto
  // one label, so an axis of 0/2/4/6/8/10/12 rendered as "0, 0, 0, 10, ...".
  it("gives every tick a distinct label across sub-1k ranges", () => {
    for (const maxValue of [6, 12, 80, 340, 600]) {
      const format = createCountAxisFormatter(maxValue);
      const ticks = [0, 1, 2, 3, 4, 5, 6].map((i) =>
        Math.round((maxValue / 6) * i)
      );
      const labels = ticks.map(format);

      expect(new Set(labels).size).toBe(new Set(ticks).size);
    }
  });

  it("switches buckets exactly at each threshold", () => {
    expect(createCountAxisFormatter(100_000)(100_000)).toBe("100k");
    expect(createCountAxisFormatter(10_000)(10_000)).toBe("10.0k");
    expect(createCountAxisFormatter(1000)(1000)).toBe("1.0k");
    expect(createCountAxisFormatter(100)(100)).toBe("100");
    expect(createCountAxisFormatter(10)(10)).toBe("10");
  });
});

describe("countYAxisProps", () => {
  it("carries the shared scaling system", () => {
    const props = countYAxisProps(5000);
    expect(props.domain).toEqual([0, "auto"]);
    expect(props.axisLine).toBe(false);
    expect(props.tickLine).toBe(false);
    expect(props.tickMargin).toBe(8);
    expect(props.tickFormatter(1500)).toBe("1.5k");
  });

  it("compresses with sqrt only once the range is wide enough to need it", () => {
    expect(countYAxisProps(5000).scale).toBe("sqrt");
    expect(countYAxisProps(100).scale).toBe("sqrt");
    expect(countYAxisProps(99).scale).toBe("linear");
    expect(countYAxisProps(6).scale).toBe("linear");
  });

  it("never asks for fractional ticks on counted events", () => {
    expect(countYAxisProps(6).allowDecimals).toBe(false);
  });
});
