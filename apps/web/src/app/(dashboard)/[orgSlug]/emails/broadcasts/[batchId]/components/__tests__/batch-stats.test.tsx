// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { BatchStats } from "../batch-stats";

afterEach(cleanup);

describe("BatchStats", () => {
  const completedBatch = {
    id: "batch-1",
    status: "completed",
    channel: "email" as const,
    totalRecipients: 12_500,
    processedRecipients: 12_500,
    sent: 12_450,
    delivered: 12_380,
    opened: 4952,
    clicked: 1238,
    bounced: 20,
    complained: 2,
    failed: 50,
    hardBounced: 12,
    softBounced: 8,
    startedAt: new Date("2026-02-22T08:36:50Z"),
    completedAt: new Date("2026-02-22T09:06:50Z"),
  };

  const zeroSendBatch = {
    ...completedBatch,
    totalRecipients: 1200,
    processedRecipients: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    failed: 0,
    hardBounced: 0,
    softBounced: 0,
  };

  it("renders the status badge", () => {
    render(<BatchStats batch={completedBatch} organizationId="org-1" />);
    expect(screen.getByText("Completed")).toBeTruthy();
  });

  it("renders the sankey chart with node labels", () => {
    // Scoped to the SVG: the new outcome-numbers row (added by this plan)
    // also renders a "Sent" label/count outside the chart, so an unscoped
    // query would match both and throw on ambiguity.
    const { container } = render(
      <BatchStats batch={completedBatch} organizationId="org-1" />
    );
    const svg = Array.from(container.querySelectorAll("svg")).find(
      (el) => el.querySelector("rect") !== null
    ) as unknown as HTMLElement;
    const chart = within(svg);
    expect(chart.getByText("Sent")).toBeTruthy();
    expect(chart.getByText("Delivered")).toBeTruthy();
    expect(chart.getByText("Opened")).toBeTruthy();
    expect(chart.getByText("Clicked")).toBeTruthy();
  });

  it("renders sankey chart counts", () => {
    // Scoped to the SVG for the same reason as above: "12,450" is both the
    // Sent node's value in the chart and the Sent number in the outcome row.
    const { container } = render(
      <BatchStats batch={completedBatch} organizationId="org-1" />
    );
    const svg = Array.from(container.querySelectorAll("svg")).find(
      (el) => el.querySelector("rect") !== null
    ) as unknown as HTMLElement;
    const chart = within(svg);
    expect(chart.getByText("12,450")).toBeTruthy();
    expect(chart.getByText("12,380")).toBeTruthy();
    expect(chart.getByText("4,952")).toBeTruthy();
    expect(chart.getByText("1,238")).toBeTruthy();
  });

  it("renders an SVG for the sankey diagram", () => {
    const { container } = render(
      <BatchStats batch={completedBatch} organizationId="org-1" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // Should have rect elements for sankey nodes
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThan(0);
  });

  it("renders refresh button", () => {
    render(<BatchStats batch={completedBatch} organizationId="org-1" />);
    expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy();
  });

  it("renders duration", () => {
    render(<BatchStats batch={completedBatch} organizationId="org-1" />);
    expect(screen.getByText(/30m/)).toBeTruthy();
  });

  it("renders the outcome numbers for a zero-send batch", () => {
    render(<BatchStats batch={zeroSendBatch} organizationId="org-1" />);
    expect(screen.getByText("Sent")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Not sent")).toBeTruthy();
  });

  it("names the shortfall for a zero-send batch", () => {
    render(<BatchStats batch={zeroSendBatch} organizationId="org-1" />);
    expect(
      screen.getByText(/1,200 of 1,200 recipients were never sent/)
    ).toBeTruthy();
  });

  it("does not present a zero-send batch as success", () => {
    render(<BatchStats batch={zeroSendBatch} organizationId="org-1" />);
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.getByText("Completed — nothing sent")).toBeTruthy();
  });

  it("shows failures on screen for a partially-failed terminal batch", () => {
    // Because sent > 0 here, the Sankey chart also renders and shows its own
    // "1,199" Failed-node value — so this asserts the count is present
    // OUTSIDE the chart (the actual point of the test: not only inside the
    // chart), rather than using a single getByText that would ambiguously
    // match both.
    const { container } = render(
      <BatchStats
        batch={{
          ...completedBatch,
          sent: 1,
          failed: 1199,
          totalRecipients: 1200,
          processedRecipients: 1200,
        }}
        organizationId="org-1"
      />
    );
    const matches = screen.getAllByText("1,199");
    const outsideChart = matches.some((el) => !el.closest("svg"));
    expect(outsideChart).toBe(true);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("still renders the plain Completed badge and Sankey labels for a healthy batch", () => {
    render(<BatchStats batch={completedBatch} organizationId="org-1" />);
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByText("Completed — nothing sent")).toBeNull();
    expect(screen.getByText("Delivered")).toBeTruthy();
  });
});

describe("BatchStats — missing delivery events (M6)", () => {
  const sentButNoFates = {
    id: "batch-no-events",
    status: "completed",
    channel: "email" as const,
    totalRecipients: 500,
    processedRecipients: 500,
    sent: 500,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    failed: 0,
    hardBounced: 0,
    softBounced: 0,
    startedAt: new Date("2026-02-22T08:36:50Z"),
    completedAt: new Date("2026-02-22T09:06:50Z"),
  };

  it("says rates are unknown when no delivery event ever arrived", () => {
    render(<BatchStats batch={sentButNoFates} organizationId="org-1" />);

    expect(
      screen.getByText(/No delivery events have arrived/i)
    ).toBeTruthy();
    expect(screen.getByText(/unknown, not zero/i)).toBeTruthy();
  });

  it("stays quiet once any fate has been recorded", () => {
    render(
      <BatchStats
        batch={{ ...sentButNoFates, delivered: 500 }}
        organizationId="org-1"
      />
    );

    expect(
      screen.queryByText(/No delivery events have arrived/i)
    ).toBeNull();
  });

  it("stays quiet on a broadcast that never sent — C1 already covers that", () => {
    render(
      <BatchStats
        batch={{ ...sentButNoFates, sent: 0, processedRecipients: 0 }}
        organizationId="org-1"
      />
    );

    expect(
      screen.queryByText(/No delivery events have arrived/i)
    ).toBeNull();
  });
});

describe("BatchStats — unsubscribe denominator (M5)", () => {
  const engagedBatch = {
    id: "batch-unsub",
    status: "completed",
    channel: "email" as const,
    totalRecipients: 1000,
    processedRecipients: 1000,
    sent: 1000,
    delivered: 800,
    opened: 400,
    clicked: 100,
    bounced: 200,
    complained: 0,
    failed: 0,
    hardBounced: 200,
    softBounced: 0,
    startedAt: new Date("2026-02-22T08:36:50Z"),
    completedAt: new Date("2026-02-22T09:06:50Z"),
  };

  it("rates unsubscribes against delivered and names the population", () => {
    // 40 of 800 delivered = 5.0%. Against `sent` (1000) it would read 4.0%,
    // which is not comparable to the open and click rates beside it.
    render(
      <BatchStats
        batch={engagedBatch}
        organizationId="org-1"
        unsubscribeCount={40}
      />
    );

    expect(
      screen.getByText(/5\.0% of 800 delivered/i)
    ).toBeTruthy();
  });
});

describe("BatchStats — clicked-URL truncation (L2)", () => {
  const clickedBatch = {
    id: "batch-clicks",
    status: "completed",
    channel: "email" as const,
    totalRecipients: 100,
    processedRecipients: 100,
    sent: 100,
    delivered: 100,
    opened: 50,
    clicked: 20,
    bounced: 0,
    complained: 0,
    failed: 0,
    hardBounced: 0,
    softBounced: 0,
    startedAt: new Date("2026-02-22T08:36:50Z"),
    completedAt: new Date("2026-02-22T09:06:50Z"),
  };

  it("says how many links it left out rather than truncating silently", () => {
    render(
      <BatchStats
        batch={clickedBatch}
        clicksByUrl={[{ url: "https://example.com/a", count: 20 }]}
        omittedUrlCount={137}
        organizationId="org-1"
      />
    );

    expect(screen.getByText(/137 more distinct links/i)).toBeTruthy();
  });

  it("says nothing when the full list fits", () => {
    render(
      <BatchStats
        batch={clickedBatch}
        clicksByUrl={[{ url: "https://example.com/a", count: 20 }]}
        omittedUrlCount={0}
        organizationId="org-1"
      />
    );

    expect(screen.queryByText(/more distinct links/i)).toBeNull();
  });
});
