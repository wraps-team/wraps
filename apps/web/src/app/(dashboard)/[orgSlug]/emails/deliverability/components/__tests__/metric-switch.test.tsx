/**
 * The page-level metric switch: it reads and writes the `metric` URL param,
 * which the chart, the driving panel and the side card all follow.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetricSwitch } from "../metric-switch";

afterEach(() => {
  cleanup();
});

describe("MetricSwitch", () => {
  it("labels the control and lists the three metrics, Bounces first", () => {
    render(
      <NuqsTestingAdapter searchParams={{}}>
        <MetricSwitch />
      </NuqsTestingAdapter>
    );
    const group = screen.getByRole("group", {
      name: "Metric for this section",
    });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => r.textContent)
    ).toEqual(["Bounces", "Complaints", "Suppressed"]);
    expect(screen.getByText("Showing")).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "Bounces" })).toBeChecked();
  });

  it("writes metric to the URL when another metric is chosen", async () => {
    const onUrlUpdate = vi.fn();
    render(
      <NuqsTestingAdapter onUrlUpdate={onUrlUpdate} searchParams={{}}>
        <MetricSwitch />
      </NuqsTestingAdapter>
    );
    await userEvent.click(screen.getByRole("radio", { name: "Complaints" }));
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("metric")).toBe(
      "complaint"
    );
  });

  it("reads the metric from the URL", () => {
    render(
      <NuqsTestingAdapter searchParams={{ metric: "suppression" }}>
        <MetricSwitch />
      </NuqsTestingAdapter>
    );
    expect(screen.getByRole("radio", { name: "Suppressed" })).toBeChecked();
  });
});
