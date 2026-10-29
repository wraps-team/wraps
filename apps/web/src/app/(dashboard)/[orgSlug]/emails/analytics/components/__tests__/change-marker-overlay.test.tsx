/**
 * Change markers on the Deliverability card's trend chart, and the overlay
 * pieces the card renders: the list's links, keyboard order, the mobile
 * disclosure, the copy and the toggle. Recharts is stubbed so only the
 * ReferenceLine children render. The data hooks are mocked, so this runs
 * without a server.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailChartMeta } from "@/lib/analytics-scope";
import type { ChangeMarker, ChangeMarkersResponse } from "@/lib/change-markers";
import { DeliverabilityCard } from "../../../deliverability/components/deliverability-card";
import timelineTab from "../../../deliverability/tabs/timeline-tab";
import {
  ChangeMarkerList,
  ChangeMarkersToggle,
  useChartChangeMarkers,
} from "../change-marker-overlay";

const hoisted = vi.hoisted(() => ({ isMobile: false }));

const state = vi.hoisted(() => ({
  email: undefined as unknown,
  overview: undefined as unknown,
  bounce: undefined as unknown,
  complaint: undefined as unknown,
  suppression: undefined as unknown,
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => hoisted.isMobile,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("days=30"),
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
vi.mock("../../hooks/use-analytics", () => {
  const hook = (data: unknown) => ({
    data,
    isLoading: data === undefined,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  return {
    useEmailChartData: () => ({
      data: state.email,
      isLoading: state.email === undefined,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useAnalyticsOverview: () => hook(state.overview),
    useBounceData: () => hook(state.bounce),
    useComplaintData: () => hook(state.complaint),
    useSuppressionData: () => hook(state.suppression),
    useChangeMarkers: (...args: unknown[]) => mockUseChangeMarkers(...args),
  };
});

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

globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {
    // no OS preference changes in jsdom
  },
  removeEventListener() {
    // no-op
  },
})) as unknown as typeof matchMedia;

const NOW = Date.parse("2026-10-26T12:00:00.000Z");
const DAYS = [
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
  "2026-10-24",
  "2026-10-25",
  "2026-10-26",
];

function meta(): EmailChartMeta {
  return {
    reputationScope: "ses-account",
    awsAccountCount: 1,
    awsAccountsUnavailable: 0,
    reputationAsOf: NOW,
    generatedAt: NOW,
  } as EmailChartMeta;
}

/** A rated, healthy account with a bounce series that has a 2026-10-25 row. */
function loadHealthy() {
  state.email = {
    overview: {
      totalSent: 5000,
      totalDelivered: 4990,
      totalBounced: 13,
      totalComplaints: 7,
      totalRenderingFailures: 0,
      deliveryRate: 99.8,
      bounceRate: 2.6,
      complaintRate: 0.03,
    },
    volume: [],
    engagement: [],
    meta: meta(),
  };
  state.overview = {
    totalSent: 5000,
    totalDelivered: 4990,
    totalBounced: 13,
    totalComplaints: 7,
    totalRenderingFailures: 0,
    deliveryRate: 99.8,
    bounceRate: 0,
    complaintRate: 0,
  };
  state.bounce = DAYS.map((date, i) => ({
    date,
    timestamp: NOW - (DAYS.length - i) * 86_400_000,
    permanent: 0,
    transient: 0,
    undetermined: 0,
    total: 0,
    sent: 100,
    bounceRate: i === DAYS.length - 1 ? 2.6 : 1,
  }));
  state.complaint = DAYS.map((date, i) => ({
    date,
    timestamp: NOW - (DAYS.length - i) * 86_400_000,
    complaints: 0,
    sent: 100,
    complaintRate: 0,
  }));
  state.suppression = DAYS.map((date, i) => ({
    date,
    timestamp: NOW - (DAYS.length - i) * 86_400_000,
    suppressed: 0,
    sent: 100,
    suppressionRate: 0,
  }));
}

/** Marker lines only: the card's SES review line has a y, not an x. */
function markerLines() {
  return screen
    .queryAllByTestId("ref-line")
    .filter((el) => el.hasAttribute("data-x"));
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

function renderCard() {
  return render(
    <NuqsTestingAdapter searchParams={{ days: "30" }}>
      <DeliverabilityCard orgSlug="acme" />
    </NuqsTestingAdapter>
  );
}

beforeEach(() => {
  hoisted.isMobile = false;
  mockUseChangeMarkers.mockReset();
  setMarkers([]);
  loadHealthy();
});

afterEach(() => {
  cleanup();
});

describe("change markers on the Deliverability card", () => {
  it("toggle reflects aria-pressed and draws or removes the marker line", async () => {
    setMarkers([marker()]);
    renderCard();
    const toggle = screen.getByRole("button", { name: "Changes" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(markerLines()).toHaveLength(1);
    expect(markerLines()[0]).toHaveAttribute("data-x", "2026-10-25");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(markerLines()).toHaveLength(0);
  });

  it("the card asks for markers without deltas, enabled", () => {
    renderCard();
    expect(mockUseChangeMarkers).toHaveBeenCalledWith(
      "acme",
      30,
      expect.objectContaining({ withDeltas: false, enabled: true })
    );
  });
});

describe("useChartChangeMarkers", () => {
  it("makes the request disabled and draws no lines when the overlay is off", () => {
    setMarkers([marker()]);
    const { result } = renderHook(() =>
      useChartChangeMarkers({
        orgSlug: "acme",
        days: 30,
        enabled: false,
        showMarkers: true,
        dates: ["2026-10-25"],
      })
    );
    expect(mockUseChangeMarkers).toHaveBeenCalledWith(
      "acme",
      30,
      expect.objectContaining({ withDeltas: false, enabled: false })
    );
    expect(result.current.overlayOn).toBe(false);
    expect(result.current.markerLines).toEqual([]);
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
          marker({ id: "b", href: "/acme/emails/inbound", label: "B" }),
          marker({
            id: "c",
            href: "/acme/settings/sender-defaults",
            label: "C",
          }),
        ]}
        metric="bounce"
        orgSlug="acme"
        state="ready"
      />
    );
    const links = screen.getAllByRole("link");
    for (const link of links) {
      await user.tab();
      expect(link).toHaveFocus();
    }
  });

  it("shows at most five items and a +N more link to the hub's changes view", () => {
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
      />
    );
    const list = screen.getByRole("list", { name: "Changes in this period" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    const more = screen.getByRole("link", { name: "+2 more" });
    expect(more).toHaveAttribute(
      "href",
      "/acme/emails?tab=deliverability&metric=complaint&days=30&drive=changes"
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
        />
      </>
    );
    expect(container.textContent ?? "").not.toMatch(causal);
    expect(container.textContent).toContain(
      "Markers show changes that happened around the same time as rate movements. They are timing records only, not a diagnosis."
    );
  });
});
