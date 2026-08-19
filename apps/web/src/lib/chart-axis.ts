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
  const scale: YAxisProps["scale"] = maxValue >= 100 ? "sqrt" : "linear";

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
