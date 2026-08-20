// recharts ships its runtime under lib/ and its declarations under types/, with
// no exports map pairing the two, so this internal module resolves at runtime
// but has no declaration file of its own.
// @ts-expect-error - typed via the declaration import below
import * as chartUtilsRuntime from "recharts/lib/util/ChartUtils";
import type * as ChartUtils from "recharts/types/util/ChartUtils";
import { describe, expect, it } from "vitest";
import { countYAxisProps, createCountAxisFormatter } from "../chart-axis";

const { getTicksOfScale, parseScale } =
  chartUtilsRuntime as unknown as typeof ChartUtils;

// recharts' own default for a cartesian axis.
const TICK_COUNT = 5;

const AXIS = {
  axisType: "yAxis",
  layout: "horizontal",
  type: "number",
} as const;

// Mirrors what recharts does for a <YAxis>: resolve the scale name, ask for
// nice ticks, and fall back to raw d3 ticks when getTicksOfScale refuses.
function renderedAxis(maxValue: number) {
  const props = countYAxisProps(maxValue);
  const { scale, realScaleType } = parseScale(
    { ...AXIS, scale: props.scale },
    "LineChart",
    false
  );

  scale.domain([0, maxValue]).range([0, 100]);

  const nice = getTicksOfScale(scale, {
    allowDecimals: props.allowDecimals,
    originalDomain: props.domain,
    realScaleType,
    tickCount: TICK_COUNT,
    type: "number",
  }) as { niceTicks: number[] } | null;

  const ticks: number[] = nice?.niceTicks ?? scale.ticks(TICK_COUNT);

  return {
    labels: ticks.map((tick) => props.tickFormatter(tick)),
    realScaleType,
    ticks,
    usedNiceTicks: nice !== null,
  };
}

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
    expect(countYAxisProps(99).scale).toBe("auto");
    expect(countYAxisProps(6).scale).toBe("auto");
  });

  it("never asks for fractional ticks on counted events", () => {
    expect(countYAxisProps(6).allowDecimals).toBe(false);
  });
});

describe("countYAxisProps gridlines as recharts draws them", () => {
  // The reported defect: a day whose peak was 2 drew five gridlines labelled
  // "2, 2, 1, 1, 0" because the axis fell through to d3's 0/0.5/1/1.5/2 and
  // the formatter rounded them.
  it("draws 0/1/2/3/4 for the two-message day that rendered 2, 2, 1, 1, 0", () => {
    const { labels, ticks } = renderedAxis(2);

    expect(ticks).toEqual([0, 1, 2, 3, 4]);
    expect(labels).toEqual(["0", "1", "2", "3", "4"]);
  });

  it.each([1, 2, 3, 4, 5, 7, 12, 40, 99])(
    "gives a max of %i whole-number gridlines with no repeated label",
    (maxValue) => {
      const { labels, ticks, usedNiceTicks } = renderedAxis(maxValue);

      expect(usedNiceTicks).toBe(true);
      expect(ticks.filter(Number.isInteger)).toEqual(ticks);
      expect(new Set(labels).size).toBe(labels.length);
      expect(Math.max(...ticks)).toBeGreaterThanOrEqual(maxValue);
    }
  );

  // Pins the trap the fix walked out of: recharts expands a string scale to
  // "scale" + upperFirst(scale), and getTicksOfScale only runs for exactly
  // "auto" or "linear". Naming the scale "linear" therefore disables nice
  // ticks and allowDecimals — the opposite of what the name suggests.
  it("would lose nice ticks again if the scale were named 'linear'", () => {
    const { scale, realScaleType } = parseScale(
      { ...AXIS, scale: "linear" },
      "LineChart",
      false
    );
    scale.domain([0, 2]).range([0, 100]);

    expect(realScaleType).toBe("scaleLinear");
    expect(
      getTicksOfScale(scale, {
        allowDecimals: false,
        originalDomain: [0, "auto"],
        realScaleType,
        tickCount: TICK_COUNT,
        type: "number",
      })
    ).toBeNull();
    expect(scale.ticks(TICK_COUNT)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  // Known and accepted: sqrt hits that same bail, so counts of 100+ get raw d3
  // ticks. They are whole numbers at that magnitude, so nothing collapses.
  it("hands the sqrt branch at 100 to d3, still without repeated labels", () => {
    const small = renderedAxis(99);
    const large = renderedAxis(100);

    expect(small.realScaleType).toBe("linear");
    expect(small.usedNiceTicks).toBe(true);

    expect(large.realScaleType).toBe("scaleSqrt");
    expect(large.usedNiceTicks).toBe(false);
    expect(large.ticks.filter(Number.isInteger)).toEqual(large.ticks);
    expect(new Set(large.labels).size).toBe(large.labels.length);
  });
});
