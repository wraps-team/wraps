/**
 * Timeline tab: the default export contract and the list it renders. The
 * marker hook is mocked, so this runs without a server.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrilldownWindow } from "@/lib/analytics-drilldown-window";
import type { ChangeMarker, ChangeMarkersResponse } from "@/lib/change-markers";
import timelineTab from "../timeline-tab";

const mockUseChangeMarkers = vi.fn();
vi.mock("../../../analytics/hooks/use-analytics", () => ({
  useChangeMarkers: (...args: unknown[]) => mockUseChangeMarkers(...args),
}));

function markerWith(overrides: Partial<ChangeMarker> = {}): ChangeMarker {
  return {
    id: "broadcast_started:b1",
    type: "broadcast_started",
    at: Date.parse("2026-10-25T10:20:00.000Z"),
    date: "2026-10-25",
    label: "Broadcast started: October launch (1,200 recipients)",
    href: "/acme/emails/broadcasts/b1",
    weight: "major",
    count: 1,
    value: 1200,
    delta: null,
    ...overrides,
  };
}

function response(
  overrides: Partial<ChangeMarkersResponse> = {}
): ChangeMarkersResponse {
  return {
    generatedAt: Date.parse("2026-10-28T12:00:00.000Z"),
    window: {
      startMs: Date.parse("2026-10-14T12:00:00.000Z"),
      endMs: Date.parse("2026-10-28T12:00:00.000Z"),
      timezone: "UTC",
    },
    markers: [],
    totalMarkers: 0,
    truncated: false,
    deltasIncluded: true,
    ...overrides,
  };
}

const WINDOW: DrilldownWindow = {
  days: 14,
  startTime: new Date("2026-10-14T12:00:00.000Z"),
  endTime: new Date("2026-10-28T12:00:00.000Z"),
  day: null,
  tz: "UTC",
};

function setQuery(
  partial: Partial<{
    data: ChangeMarkersResponse | undefined;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
  }> = {}
) {
  mockUseChangeMarkers.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...partial,
  });
}

function renderTab(metric: "bounce" | "complaint" | "suppression" = "bounce") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { Component } = timelineTab;
  return render(
    <QueryClientProvider client={client}>
      <Component metric={metric} orgSlug="acme" window={WINDOW} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockUseChangeMarkers.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("timelineTab default export", () => {
  it("is enabled with id timeline and a Component", () => {
    expect(timelineTab.id).toBe("timeline");
    expect(timelineTab.label).toBe("Timeline");
    expect(timelineTab.enabled).toBe(true);
    expect(typeof timelineTab.Component).toBe("function");
  });
});

describe("TimelineTab", () => {
  it("asks for markers with deltas, the window's days and its timezone", () => {
    setQuery({ data: response() });
    renderTab();
    expect(mockUseChangeMarkers).toHaveBeenCalledWith(
      "acme",
      14,
      expect.objectContaining({ withDeltas: true, enabled: true, tz: "UTC" })
    );
  });

  it("renders the heading, the description and the footer copy", () => {
    setQuery({ data: response() });
    renderTab();
    expect(
      screen.getByRole("heading", { name: "Changes" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Changes made in this window, listed next to the rate movements that happened around the same time. These are timing records only, not a diagnosis."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Changes cover the whole 14-day window. Choosing a day does not filter this list."
      )
    ).toBeInTheDocument();
  });

  it("lists each change as a link to its href, with its label", () => {
    setQuery({ data: response({ markers: [markerWith()], totalMarkers: 1 }) });
    renderTab();
    const link = screen.getByRole("link", {
      name: /Broadcast started: October launch/,
    });
    expect(link).toHaveAttribute("href", "/acme/emails/broadcasts/b1");
  });

  it("shows a ready delta with its heading, a notable chip and the sentence", () => {
    setQuery({
      data: response({
        markers: [
          markerWith({
            delta: {
              afterClosesAt: Date.parse("2026-10-26T11:00:00.000Z"),
              beforeSent: 10000,
              afterSent: 10000,
              metrics: [
                {
                  metric: "bounce",
                  status: "ready",
                  before: 1.2,
                  after: 2.9,
                  deltaPts: 1.7,
                  direction: "up",
                },
                {
                  metric: "complaint",
                  status: "ready",
                  before: 0.01,
                  after: 0.01,
                  deltaPts: 0,
                  direction: "flat",
                },
                {
                  metric: "suppression",
                  status: "ready",
                  before: 0.5,
                  after: 0.5,
                  deltaPts: 0,
                  direction: "flat",
                },
              ],
            },
          }),
        ],
        totalMarkers: 1,
      }),
    });
    renderTab("bounce");
    expect(
      screen.getByText("Bounce rate 1.20% -> 2.90% (+1.70 points)")
    ).toBeInTheDocument();
    expect(screen.getByText("Notable increase")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The bounce rate was 1.20% in the 24 hours before and 2.90% in the 24 hours after. This change happened around the same time as that movement."
      )
    ).toBeInTheDocument();
  });

  it("lists the selected metric first within a change's delta block", () => {
    setQuery({
      data: response({
        markers: [
          markerWith({
            delta: {
              afterClosesAt: Date.parse("2026-10-26T11:00:00.000Z"),
              beforeSent: 10000,
              afterSent: 10000,
              metrics: [
                {
                  metric: "bounce",
                  status: "ready",
                  before: 1.2,
                  after: 2.9,
                  deltaPts: 1.7,
                  direction: "up",
                },
                {
                  metric: "complaint",
                  status: "accruing",
                  before: null,
                  after: null,
                  deltaPts: null,
                  direction: null,
                },
                {
                  metric: "suppression",
                  status: "ready",
                  before: 0.5,
                  after: 0.5,
                  deltaPts: 0,
                  direction: "flat",
                },
              ],
            },
          }),
        ],
        totalMarkers: 1,
      }),
    });
    const { container } = renderTab("complaint");
    const text = container.textContent ?? "";
    const complaint = text.indexOf("Complaint figures are still arriving");
    const bounce = text.indexOf("Bounce rate 1.20%");
    const suppression = text.indexOf("Suppression rate 0.50%");
    expect(complaint).toBeGreaterThan(-1);
    expect(bounce).toBeGreaterThan(-1);
    expect(suppression).toBeGreaterThan(-1);
    // The metric the user came from comes first, then the others in order.
    expect(complaint).toBeLessThan(bounce);
    expect(bounce).toBeLessThan(suppression);
  });

  it("states that a group has no single comparison", () => {
    setQuery({
      data: response({
        markers: [
          markerWith({
            id: "group:broadcast_started:2026-10-25",
            count: 3,
            label: "3 broadcasts started",
            href: "/acme/emails/broadcasts",
            delta: null,
          }),
        ],
        totalMarkers: 1,
      }),
    });
    renderTab();
    expect(
      screen.getByText("3 changes that day. No single comparison is shown.")
    ).toBeInTheDocument();
  });

  it("shows the truncation banner when the response is capped", () => {
    setQuery({
      data: response({
        markers: [markerWith()],
        totalMarkers: 140,
        truncated: true,
      }),
    });
    renderTab();
    expect(
      screen.getByText(
        "Showing the 100 most recent of 140 changes. Narrow the window to see older ones."
      )
    ).toBeInTheDocument();
  });

  it("shows the empty copy when no change falls in the window", () => {
    setQuery({ data: response() });
    renderTab();
    expect(
      screen.getByText(
        /No changes were recorded in the last 14 days\. Changes appear here when a broadcast starts/
      )
    ).toBeInTheDocument();
  });

  it("shows three loading rows without the error copy", () => {
    setQuery({ isLoading: true });
    renderTab();
    expect(
      screen.queryByText("Could not load changes.")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the error copy and a Try again button that refetches", async () => {
    const refetch = vi.fn();
    setQuery({ error: new Error("boom"), refetch });
    renderTab();
    expect(screen.getByText("Could not load changes.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
