import type { YAxisProps } from "recharts";

export function createCountAxisFormatter(maxValue: number) {
  if (maxValue >= 100_000) {
    return (value: number) => `${Math.round(value / 1000)}k`;
  }
  if (maxValue >= 1000) {
    return (value: number) => `${(value / 1000).toFixed(1)}k`;
  }
  // Below 1k the ticks recharts generates are already whole numbers, so there
  // is nothing to compact. Rounding them to tens/hundreds collapsed distinct
  // gridlines onto the same label instead: a 12-message day drew ticks at
  // 0/2/4/6/8/10/12 and rendered them as "0, 0, 0, 10, 10, 10, 10".
  return (value: number) => `${Math.round(value)}`;
}

// Shared Y-axis scaling for count-based charts. Rate/percentage charts must
// stay linear.
export function countYAxisProps(maxValue: number) {
  // sqrt keeps low-volume days visible next to spikes, but it only earns its
  // distortion once the range is wide enough to have spikes. Under 100 it
  // compresses nothing and only makes evenly-valued gridlines sit at uneven
  // heights, which reads as a broken axis.
  // "auto", never "linear": recharts turns a string scale into "scale" +
  // upperFirst(scale), so "linear" becomes "scaleLinear", and getTicksOfScale
  // bails on anything that is not exactly "auto" or "linear". That bail skipped
  // nice-tick generation entirely, so allowDecimals was never read and a
  // max of 2 drew d3's 0/0.5/1/1.5/2, which the formatter rounded to
  // "2, 2, 1, 1, 0". "auto" resolves to realScaleType "linear" and passes.
  // The sqrt branch below hits that same bail by design — counts of 100+ still
  // get raw d3 ticks, where whole numbers make the rounding harmless.
  const scale: YAxisProps["scale"] = maxValue >= 100 ? "sqrt" : "auto";

  return {
    allowDecimals: false,
    axisLine: false,
    domain: [0, "auto"],
    scale,
    tickFormatter: createCountAxisFormatter(maxValue),
    tickLine: false,
    tickMargin: 8,
  } satisfies YAxisProps;
}
