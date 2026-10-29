/**
 * The bar table: the bar geometry and colour bands, the review tick, and the
 * accessible label of each bar. Pure rows, no data hooks.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AttributionGroup } from "@/lib/analytics-drilldown-rank";
import { RateBarTable, rateBar } from "../rate-bar-table";

afterEach(() => {
  cleanup();
});

function group(
  overrides: Partial<{
    key: string;
    label: string;
    sent: number;
    rate: number | null;
  }>
): AttributionGroup {
  return {
    key: "b1",
    label: "Weekly digest",
    sourceTypes: [],
    sent: 3100,
    events: 108,
    rate: 3.5,
    share: 60,
    excess: 1,
    eligible: true,
    ...overrides,
  } as unknown as AttributionGroup;
}

describe("rateBar", () => {
  it("is green below half the review line, amber below it, red at or over it", () => {
    expect(rateBar("bounce", 2.4, 5).tone).toBe("success");
    expect(rateBar("bounce", 2.5, 5).tone).toBe("warning");
    expect(rateBar("bounce", 4.9, 5).tone).toBe("warning");
    expect(rateBar("bounce", 5, 5).tone).toBe("destructive");
  });

  it("puts the review line at the middle of a bounce bar", () => {
    expect(rateBar("bounce", 5, 5).fillPct).toBe(50);
    expect(rateBar("bounce", 10, 5).fillPct).toBe(100);
    expect(rateBar("bounce", 1, 5).fillPct).toBe(10);
  });

  it("shows the review tick for bounce and complaint, never for suppression", () => {
    expect(rateBar("bounce", 1, 5).reviewTick).toBe(true);
    expect(rateBar("complaint", 0.05, 0.1).reviewTick).toBe(true);
    expect(rateBar("suppression", 3, 5).reviewTick).toBe(false);
  });

  it("scales suppression to the largest rate and keeps it neutral", () => {
    const bar = rateBar("suppression", 2, 8);
    expect(bar.fillPct).toBe(25);
    expect(bar.tone).toBe("muted");
  });
});

describe("RateBarTable", () => {
  it("labels each bar with its group, rate and review line", () => {
    render(
      <RateBarTable
        belowFloor={[]}
        belowFloorOpen={false}
        by="broadcast"
        caption="Bounce rate is 2.74% for the last 90 days: 17 of 621 sends."
        floor={100}
        metric="bounce"
        omitted={{
          sent: 0,
          bounced: 0,
          permanent: 0,
          transient: 0,
          undetermined: 0,
          complained: 0,
          suppressed: 0,
          groups: 0,
        }}
        orgSlug="acme"
        ranked={[group({})]}
        workflowLinks={false}
      />
    );
    expect(
      screen.getByRole("img", {
        name: /^Weekly digest bounce rate 3\.5 percent, SES review line 5 percent/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Bounce rate is 2.74% for the last 90 days: 17 of 621 sends."
      )
    ).toBeInTheDocument();
  });

  it("drops the share and comparison columns", () => {
    render(
      <RateBarTable
        belowFloor={[]}
        belowFloorOpen={false}
        by="broadcast"
        caption="caption"
        floor={100}
        metric="bounce"
        omitted={{
          sent: 0,
          bounced: 0,
          permanent: 0,
          transient: 0,
          undetermined: 0,
          complained: 0,
          suppressed: 0,
          groups: 0,
        }}
        orgSlug="acme"
        ranked={[group({})]}
        workflowLinks={false}
      />
    );
    expect(screen.queryByRole("columnheader", { name: "Share" })).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "Compared with window rate" })
    ).toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "Sends" })
    ).toBeInTheDocument();
  });

  const omitted = {
    sent: 0,
    bounced: 0,
    permanent: 0,
    transient: 0,
    undetermined: 0,
    complained: 0,
    suppressed: 0,
    groups: 0,
  };

  function renderMetric(
    metric: "bounce" | "complaint" | "suppression",
    overrides: Partial<{
      events: number;
      sent: number;
      rate: number | null;
    }> = {}
  ) {
    render(
      <RateBarTable
        belowFloor={[]}
        belowFloorOpen={false}
        by="broadcast"
        caption="Totals sentence."
        floor={100}
        metric={metric}
        omitted={omitted}
        orgSlug="acme"
        ranked={[group(overrides)]}
        workflowLinks={false}
      />
    );
  }

  it("names the bar scale in its header: the SES line, or the share of max", () => {
    renderMetric("bounce");
    expect(
      screen.getByRole("columnheader", { name: "vs SES line (5%)" })
    ).toBeInTheDocument();
    cleanup();
    renderMetric("complaint");
    expect(
      screen.getByRole("columnheader", { name: "vs SES line (0.1%)" })
    ).toBeInTheDocument();
    cleanup();
    renderMetric("suppression");
    expect(
      screen.getByRole("columnheader", { name: "Share of max" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: /Bounce rate/ })
    ).toBeNull();
  });

  it("explains the bar scale under the table", () => {
    renderMetric("bounce");
    expect(
      screen.getByText(
        "Each bar runs from 0 to twice the SES review line; the tick is the line itself (5%). Bars turn amber past half the line and red at it."
      )
    ).toBeInTheDocument();
    cleanup();
    renderMetric("suppression");
    expect(
      screen.getByText("Bars are relative to the highest rate in this table.")
    ).toBeInTheDocument();
  });

  it("shows the events of the sends under the rate", () => {
    renderMetric("bounce", { events: 5, sent: 144, rate: 3.47 });
    expect(screen.getByText("5 of 144")).toBeInTheDocument();
    expect(screen.getByText("3.47%")).toBeInTheDocument();
  });

  it("says the counts, the rate and the line about each bar", () => {
    renderMetric("bounce", { events: 5, sent: 144, rate: 3.47 });
    expect(
      screen.getByRole("img", { name: /Weekly digest bounce rate/ })
    ).toHaveAccessibleName(
      "Weekly digest bounce rate 3.47 percent, SES review line 5 percent. 5 of 144 sends bounced (3.47%). SES reviews accounts at 5%."
    );
  });
});
