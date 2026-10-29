/**
 * Changes table: one row per change, the selected metric's comparison only,
 * and the one sentence for a comparison that is not ready. The marker hook is
 * mocked, so this runs without a server.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrilldownWindow } from "@/lib/analytics-drilldown-window";
import type { ChangeMarker, ChangeMarkersResponse } from "@/lib/change-markers";
import { ChangesTable, withoutKind } from "../changes-table";

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

function renderTable(
  metric: "bounce" | "complaint" | "suppression" = "bounce"
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ChangesTable metric={metric} orgSlug="acme" window={WINDOW} />
    </QueryClientProvider>
  );
}

const READY_BOUNCE_DELTA = {
  afterClosesAt: Date.parse("2026-10-26T11:00:00.000Z"),
  beforeSent: 10000,
  afterSent: 10000,
  metrics: [
    {
      metric: "bounce" as const,
      status: "ready" as const,
      before: 1.2,
      after: 2.9,
      deltaPts: 1.7,
      direction: "up" as const,
    },
    {
      metric: "complaint" as const,
      status: "ready" as const,
      before: 0.01,
      after: 0.01,
      deltaPts: 0,
      direction: "flat" as const,
    },
    {
      metric: "suppression" as const,
      status: "ready" as const,
      before: 0.5,
      after: 0.5,
      deltaPts: 0,
      direction: "flat" as const,
    },
  ],
};

beforeEach(() => {
  mockUseChangeMarkers.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ChangesTable", () => {
  it("asks for markers with deltas, the window's days and its timezone", () => {
    setQuery({ data: response() });
    renderTable();
    expect(mockUseChangeMarkers).toHaveBeenCalledWith(
      "acme",
      14,
      expect.objectContaining({ withDeltas: true, enabled: true, tz: "UTC" })
    );
  });

  it("shows the footer copy", () => {
    setQuery({ data: response({ markers: [markerWith()], totalMarkers: 1 }) });
    renderTable();
    expect(
      screen.getByText(
        "Changes cover the whole 14-day window. Choosing a day does not filter this list."
      )
    ).toBeInTheDocument();
  });

  it("lists each change in a row, with its kind and a link to its href", () => {
    setQuery({ data: response({ markers: [markerWith()], totalMarkers: 1 }) });
    renderTable();
    const row = screen.getByRole("row", { name: /Broadcast started/ });
    expect(within(row).getByText("Broadcast started")).toBeInTheDocument();
    const link = within(row).getByRole("link", {
      name: "October launch (1,200 recipients)",
    });
    expect(link).toHaveAttribute("href", "/acme/emails/broadcasts/b1");
  });

  it("shows only the selected metric's before and after, with its chip", () => {
    setQuery({
      data: response({
        markers: [markerWith({ delta: READY_BOUNCE_DELTA })],
        totalMarkers: 1,
      }),
    });
    renderTable("bounce");
    expect(screen.getByText("1.20% → 2.90%")).toBeInTheDocument();
    expect(screen.getByText("Notable increase")).toBeInTheDocument();
    // The other metrics are not repeated in the table.
    expect(screen.queryByText(/Complaint rate/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Suppression rate/)).not.toBeInTheDocument();
  });

  it("gives the header the selected metric's name", () => {
    setQuery({ data: response({ markers: [markerWith()], totalMarkers: 1 }) });
    renderTable("complaint");
    expect(
      screen.getByRole("columnheader", {
        name: "Complaint rate before → after",
      })
    ).toBeInTheDocument();
  });

  it("states the one sentence for an insufficient comparison, once per change", () => {
    setQuery({
      data: response({
        markers: [
          markerWith({
            delta: {
              afterClosesAt: Date.parse("2026-10-26T11:00:00.000Z"),
              beforeSent: 3,
              afterSent: 10,
              metrics: [
                {
                  metric: "bounce",
                  status: "insufficient_volume",
                  before: null,
                  after: null,
                  deltaPts: null,
                  direction: null,
                },
                {
                  metric: "complaint",
                  status: "insufficient_volume",
                  before: null,
                  after: null,
                  deltaPts: null,
                  direction: null,
                },
              ],
            },
          }),
        ],
        totalMarkers: 1,
      }),
    });
    renderTable("bounce");
    expect(
      screen.getAllByText(
        "Not enough sends to compare: 3 before and 10 after. Each window needs 200 sends."
      )
    ).toHaveLength(1);
  });

  it("says a group has no single comparison", () => {
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
    renderTable();
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
    renderTable();
    expect(
      screen.getByText(
        "Showing the 100 most recent of 140 changes. Narrow the window to see older ones."
      )
    ).toBeInTheDocument();
  });

  it("shows the empty copy when no change falls in the window", () => {
    setQuery({ data: response() });
    renderTable();
    expect(
      screen.getByText(
        /No changes were recorded in the last 14 days\. Changes appear here when a broadcast starts/
      )
    ).toBeInTheDocument();
  });

  it("shows three loading rows without the error copy", () => {
    setQuery({ isLoading: true });
    renderTable();
    expect(
      screen.queryByText("Could not load changes.")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the error copy and a Try again button that refetches", async () => {
    const refetch = vi.fn();
    setQuery({ error: new Error("boom"), refetch });
    renderTable();
    expect(screen.getByText("Could not load changes.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("withoutKind", () => {
  it("drops a leading kind and its colon", () => {
    expect(withoutKind("Template saved: Welcome (v2)", "Template saved")).toBe(
      "Welcome (v2)"
    );
  });

  it("keeps a label that has no kind prefix", () => {
    expect(
      withoutKind("Suppressed address removed", "Suppressed address removed")
    ).toBe("Suppressed address removed");
  });
});
