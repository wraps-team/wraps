/**
 * Email Activity card - honest empty state and a reachable chart.
 *
 * Two defects motivated these: the card gated its empty state on `sent` alone,
 * so a window holding opens and clicks on older mail reported "No emails sent
 * in this period"; and the plot was an unlabelled SVG with no keyboard path,
 * which made every number on it mouse-only.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// recharts' ResponsiveContainer observes its box; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {
    // no layout in jsdom, so nothing to report
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
} as unknown as typeof ResizeObserver;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/acme/emails",
  useSearchParams: () => new URLSearchParams("days=30"),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/actions/analytics", () => ({
  refreshEmailChart: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
  captureEmailsErrorRetried: vi.fn(),
}));

type VolumePoint = {
  date: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
};

const queryResult = {
  data: undefined as unknown,
  isError: false,
  isFetching: false,
  isLoading: false,
  refetch: vi.fn(),
};

vi.mock("../../analytics/hooks/use-analytics", () => ({
  useEmailChartData: () => queryResult,
}));

import { EmailAnalytics } from "../email-analytics";

function payload(volume: VolumePoint[]) {
  return {
    volume,
    engagement: [],
    overview: {
      totalSent: volume.reduce((n, v) => n + v.sent, 0),
      totalDelivered: volume.reduce((n, v) => n + v.delivered, 0),
      deliveryRate: 100,
      bounceRate: 0.04,
      complaintRate: 0,
    },
  };
}

afterEach(cleanup);

beforeEach(() => {
  queryResult.data = undefined;
  queryResult.isError = false;
  queryResult.isFetching = false;
  queryResult.isLoading = false;
});

describe("EmailAnalytics", () => {
  it("names the plot for assistive tech instead of shipping a bare SVG", () => {
    queryResult.data = payload([
      { date: "2026-08-17", sent: 40, delivered: 40, opens: 12, clicks: 3 },
      { date: "2026-08-18", sent: 28, delivered: 28, opens: 9, clicks: 1 },
    ]);

    render(<EmailAnalytics orgSlug="acme" />);

    expect(
      screen.getByRole("figure", { name: /68 sent, 68 delivered/i })
    ).toBeInTheDocument();
  });

  it("still charts a period whose only activity is opens and clicks", () => {
    // Engagement lands on mail sent before the window opened.
    queryResult.data = payload([
      { date: "2026-08-17", sent: 0, delivered: 0, opens: 6, clicks: 2 },
    ]);

    render(<EmailAnalytics orgSlug="acme" />);

    expect(
      screen.queryByText(/no email activity in this period/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("figure", { name: /email activity/i })
    ).toBeTruthy();
  });

  it("reports an empty period only when every series is zero", () => {
    queryResult.data = payload([
      { date: "2026-08-17", sent: 0, delivered: 0, opens: 0, clicks: 0 },
    ]);

    render(<EmailAnalytics orgSlug="acme" />);

    expect(
      screen.getByText(/no email activity in this period/i)
    ).toBeInTheDocument();
  });

  it("puts the card in the heading outline and names both controls", () => {
    queryResult.data = payload([
      { date: "2026-08-17", sent: 5, delivered: 5, opens: 1, clicks: 0 },
    ]);

    render(<EmailAnalytics orgSlug="acme" />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Email Activity" })
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Time range" })).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Refresh email activity" }).length
    ).toBeGreaterThan(0);
  });

  it("does not claim an empty period when the fetch failed", () => {
    queryResult.isError = true;

    render(<EmailAnalytics orgSlug="acme" />);

    expect(
      screen.queryByText(/no email activity in this period/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/couldn't load email activity/i)).toBeTruthy();
  });
});
