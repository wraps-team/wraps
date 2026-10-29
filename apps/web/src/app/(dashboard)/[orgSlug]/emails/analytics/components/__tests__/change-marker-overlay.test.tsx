/**
 * Chart overlay and change list: opt-in props, the toggle, the reference
 * lines, the list's links, keyboard order, the mobile disclosure, and the
 * copy. Recharts is stubbed so only ReferenceLine children render. The data
 * hooks are mocked, so this runs without a server.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeMarker, ChangeMarkersResponse } from "@/lib/change-markers";
import timelineTab from "../../drilldown/tabs/timeline-tab";
import { BounceTypeChart } from "../bounce-type-chart";
import {
  ChangeMarkerList,
  ChangeMarkersToggle,
} from "../change-marker-overlay";

const hoisted = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => hoisted.isMobile,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const React = await import("react");
  const RefLine = (props: {
    x?: string;
    stroke?: string;
    strokeDasharray?: string;
  }) =>
    React.createElement("div", {
      "data-testid": "ref-line",
      "data-x": props.x,
      "data-stroke": props.stroke,
      "data-dash": props.strokeDasharray ?? "solid",
    });
  // Render only the ReferenceLine children, not the tooltip or axes.
  const Chart = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      "div",
      { "data-testid": "area-chart" },
      React.Children.toArray(children).filter(
        (child) => React.isValidElement(child) && child.type === RefLine
      )
    );
  return {
    ...actual,
    AreaChart: Chart,
    BarChart: Chart,
    ReferenceLine: RefLine,
  };
});

const mockUseChangeMarkers = vi.fn();
vi.mock("../../hooks/use-analytics", () => ({
  useBounceData: () => ({
    data: [
      {
        date: "2026-10-20",
        timestamp: 0,
        permanent: 1,
        transient: 0,
        undetermined: 0,
        total: 1,
        sent: 50,
        bounceRate: 2,
      },
      {
        date: "2026-10-25",
        timestamp: 0,
        permanent: 1,
        transient: 0,
        undetermined: 0,
        total: 1,
        sent: 50,
        bounceRate: 2,
      },
    ],
    isLoading: false,
    error: null,
  }),
  useChangeMarkers: (...args: unknown[]) => mockUseChangeMarkers(...args),
}));

globalThis.ResizeObserver ??= class {
  observe() {
    // no layout
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
} as unknown as typeof ResizeObserver;

/** Marker lines only: the chart's own threshold line uses a different stroke. */
function markerLines() {
  return screen
    .queryAllByTestId("ref-line")
    .filter(
      (el) => el.getAttribute("data-stroke") === "var(--muted-foreground)"
    );
}

function marker(overrides: Partial<ChangeMarker> = {}): ChangeMarker {
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

function markersResponse(markers: ChangeMarker[]): ChangeMarkersResponse {
  return {
    generatedAt: 0,
    window: { startMs: 0, endMs: 0, timezone: "UTC" },
    markers,
    totalMarkers: markers.length,
    truncated: false,
    deltasIncluded: false,
  };
}

function setMarkers(markers: ChangeMarker[]) {
  mockUseChangeMarkers.mockReturnValue({
    data: markersResponse(markers),
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

beforeEach(() => {
  hoisted.isMobile = false;
  mockUseChangeMarkers.mockReset();
  setMarkers([]);
});

afterEach(() => {
  cleanup();
});

describe("charts with showChangeMarkers", () => {
  it("charts render unchanged when showChangeMarkers is absent (no toggle, no request)", () => {
    renderWithClient(<BounceTypeChart orgSlug="acme" />);
    expect(
      screen.queryByRole("button", { name: "Changes" })
    ).not.toBeInTheDocument();
    expect(markerLines()).toHaveLength(0);
    expect(mockUseChangeMarkers).toHaveBeenCalledWith(
      "acme",
      30,
      expect.objectContaining({ withDeltas: false, enabled: false })
    );
  });

  it("the drill-down link stays present with the overlay off (S1 header unchanged)", () => {
    renderWithClient(<BounceTypeChart orgSlug="acme" />);
    expect(
      screen.getByRole("link", { name: "View causes" })
    ).toBeInTheDocument();
  });

  it("toggle reflects aria-pressed and removes the lines when pressed off", async () => {
    setMarkers([marker()]);
    renderWithClient(<BounceTypeChart orgSlug="acme" showChangeMarkers />);
    const toggle = screen.getByRole("button", { name: "Changes" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(markerLines()).toHaveLength(1);
    expect(markerLines()[0]).toHaveAttribute("data-x", "2026-10-25");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(markerLines()).toHaveLength(0);
  });

  it("the overlay asks for markers without deltas, enabled", () => {
    renderWithClient(<BounceTypeChart orgSlug="acme" showChangeMarkers />);
    expect(mockUseChangeMarkers).toHaveBeenCalledWith(
      "acme",
      30,
      expect.objectContaining({ withDeltas: false, enabled: true })
    );
  });
});

describe("ChangeMarkerList", () => {
  it("list items are links with the marker href", () => {
    render(
      <ChangeMarkerList
        active
        days={30}
        markers={[
          marker(),
          marker({
            id: "x",
            href: "/acme/contacts",
            label: "Contacts imported: 5 new",
          }),
        ]}
        metric="bounce"
        orgSlug="acme"
        state="ready"
        tz="UTC"
      />
    );
    const list = screen.getByRole("list", { name: "Changes in this period" });
    const links = within(list).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/acme/emails/broadcasts/b1");
    expect(links[1]).toHaveAttribute("href", "/acme/contacts");
  });

  it("keyboard Tab reaches each list item", async () => {
    const user = userEvent.setup();
    render(
      <ChangeMarkerList
        active
        days={30}
        markers={[
          marker({ id: "a", href: "/acme/contacts", label: "A" }),
          marker({ id: "b", href: "/acme/emails/suppressions", label: "B" }),
          marker({
            id: "c",
            href: "/acme/settings/sender-defaults",
            label: "C",
          }),
        ]}
        metric="bounce"
        orgSlug="acme"
        state="ready"
        tz="UTC"
      />
    );
    const links = screen.getAllByRole("link");
    for (const link of links) {
      await user.tab();
      expect(link).toHaveFocus();
    }
  });

  it("shows at most five items and a +N more link to the timeline tab", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      marker({ id: `m${i}`, label: `Change ${i}`, href: `/acme/x/${i}` })
    );
    render(
      <ChangeMarkerList
        active
        days={30}
        markers={many}
        metric="complaint"
        orgSlug="acme"
        state="ready"
        tz="UTC"
      />
    );
    const list = screen.getByRole("list", { name: "Changes in this period" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    const more = screen.getByRole("link", { name: "+2 more" });
    expect(more).toHaveAttribute(
      "href",
      "/acme/emails/analytics/drilldown?metric=complaint&days=30&tz=UTC&tab=timeline"
    );
  });

  it("mobile list starts collapsed with aria-expanded=false", async () => {
    hoisted.isMobile = true;
    render(
      <ChangeMarkerList
        active
        days={30}
        markers={[marker({ id: "a" }), marker({ id: "b" })]}
        metric="bounce"
        orgSlug="acme"
        state="ready"
        tz="UTC"
      />
    );
    const disclosure = screen.getByRole("button", { name: "Show 2 changes" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: /Broadcast started/ })
    ).not.toBeInTheDocument();
    await userEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getAllByRole("link", { name: /Broadcast started/ })
    ).toHaveLength(2);
  });

  it("shows the empty copy when the window has no change", () => {
    render(
      <ChangeMarkerList
        active
        days={30}
        markers={[]}
        metric="bounce"
        orgSlug="acme"
        state="ready"
        tz="UTC"
      />
    );
    expect(screen.getByText("No changes in this period.")).toBeInTheDocument();
  });

  it("shows the error copy when the markers failed to load", () => {
    render(
      <ChangeMarkerList
        active
        days={30}
        markers={[]}
        metric="bounce"
        orgSlug="acme"
        state="error"
        tz="UTC"
      />
    );
    expect(
      screen.getByText("Could not load changes. Try again.")
    ).toBeInTheDocument();
  });
});

describe("ChangeMarkersToggle", () => {
  it("is a pressed-state button labelled Changes", async () => {
    const onChange = vi.fn();
    render(<ChangeMarkersToggle enabled onPressedChange={onChange} pressed />);
    const toggle = screen.getByRole("button", { name: "Changes" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe("timeline copy in the overlay tests", () => {
  it("timeline shows Not enough sends copy and never a percentage change for insufficient_volume", () => {
    mockUseChangeMarkers.mockReturnValue({
      data: markersResponse([
        marker({
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
              {
                metric: "suppression",
                status: "insufficient_volume",
                before: null,
                after: null,
                deltaPts: null,
                direction: null,
              },
            ],
          },
        }),
      ]),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    const { Component } = timelineTab;
    const { container } = renderWithClient(
      <Component
        metric="bounce"
        orgSlug="acme"
        window={{
          days: 30,
          startTime: new Date("2026-09-28T12:00:00.000Z"),
          endTime: new Date("2026-10-28T12:00:00.000Z"),
          day: null,
          tz: "UTC",
        }}
      />
    );
    expect(
      screen.getAllByText(
        "Not enough sends to compare: 3 before and 10 after. Each window needs 200 sends."
      )
    ).toHaveLength(3);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d+(\.\d+)?% -> /);
    expect(text).not.toMatch(/points\)/);
  });
});

describe("copy", () => {
  it("the list and timeline copy contain no causal wording", () => {
    setMarkers([marker({ delta: null })]);
    const causal =
      /\b(caused|causes|causing|because|due to|led to|resulted in|driven by|blame)\b/i;
    const { container } = renderWithClient(
      <>
        <ChangeMarkerList
          active
          days={30}
          markers={[marker()]}
          metric="bounce"
          orgSlug="acme"
          state="ready"
          tz="UTC"
        />
      </>
    );
    expect(container.textContent ?? "").not.toMatch(causal);
    expect(container.textContent).toContain(
      "Markers show changes that happened around the same time as rate movements. They are timing records only, not a diagnosis."
    );
  });
});
