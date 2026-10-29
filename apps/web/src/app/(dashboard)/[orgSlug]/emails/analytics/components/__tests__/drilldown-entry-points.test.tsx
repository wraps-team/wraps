/**
 * Entry points into the drill-down: the Bounced and Complaints rows, and a day
 * click on the bounce chart. Recharts is replaced by a stub that fires the
 * click handler, so the test runs without layout.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserTimeZone } from "@/lib/analytics-drilldown-window";
import { BounceTypeChart } from "../bounce-type-chart";
import { PerformanceMetrics } from "../performance-metrics";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

let lastClickLabel: string | undefined;
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    // The stub renders no children: real axes and areas need recharts' layout context.
    AreaChart: (props: {
      onClick?: (state: { activeLabel?: string }) => void;
    }) => (
      <div
        data-testid="area-chart"
        onClick={() => props.onClick?.({ activeLabel: lastClickLabel })}
      />
    ),
  };
});

const overview = {
  totalSent: 100,
  totalDelivered: 94,
  totalBounced: 5,
  totalComplaints: 1,
  deliveryRate: 94,
  bounceRate: 0,
  complaintRate: 0,
  meta: null,
};

vi.mock("../../hooks/use-analytics", () => ({
  // Charts call this hook unconditionally. With the overlay off it sends no request.
  useChangeMarkers: () => ({ data: undefined, isLoading: false, error: null }),
  useAnalyticsOverview: () => ({
    data: overview,
    isLoading: false,
    error: null,
  }),
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
    ],
    isLoading: false,
    error: null,
  }),
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

beforeEach(() => {
  pushSpy.mockReset();
  lastClickLabel = undefined;
});

afterEach(() => {
  cleanup();
});

describe("drill-down entry points", () => {
  it("the Bounced row links to the drill-down with metric=bounce and days=30", async () => {
    render(<PerformanceMetrics orgSlug="acme" />);
    const links = screen.getAllByRole("link", { name: "View causes" });
    const bounced = links.find((a) =>
      a.getAttribute("href")?.includes("metric=bounce")
    );
    expect(bounced).toBeDefined();
    const href = bounced?.getAttribute("href") ?? "";
    expect(href.startsWith("/acme/emails/analytics/drilldown?")).toBe(true);
    expect(href).toContain("days=30");
    // The timezone is set after mount, so wait for the browser value.
    await waitFor(() => {
      const current = screen
        .getAllByRole("link", { name: "View causes" })
        .find((a) => a.getAttribute("href")?.includes("metric=bounce"))
        ?.getAttribute("href");
      expect(current).toContain(`tz=${encodeURIComponent(browserTimeZone())}`);
    });
  });

  it("the Complaints row links with metric=complaint", async () => {
    render(<PerformanceMetrics orgSlug="acme" />);
    const complaint = screen
      .getAllByRole("link", { name: "View causes" })
      .find((a) => a.getAttribute("href")?.includes("metric=complaint"));
    expect(complaint).toBeDefined();
    expect(complaint?.getAttribute("href")).toContain("days=30");
  });

  it("a day click on the bounce chart builds a URL with that day and the chart's days", async () => {
    const user = userEvent.setup();
    render(<BounceTypeChart orgSlug="acme" />);
    lastClickLabel = "2026-10-20";
    await user.click(screen.getByTestId("area-chart"));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const url = String(pushSpy.mock.calls[0][0]);
    expect(url.startsWith("/acme/emails/analytics/drilldown?")).toBe(true);
    const params = new URL(url, "https://x.test").searchParams;
    expect(params.get("metric")).toBe("bounce");
    expect(params.get("day")).toBe("2026-10-20");
    expect(params.get("days")).toBe("30");
  });

  it("a click with no active day does not navigate", async () => {
    const user = userEvent.setup();
    render(<BounceTypeChart orgSlug="acme" />);
    lastClickLabel = undefined;
    await user.click(screen.getByTestId("area-chart"));
    expect(pushSpy).not.toHaveBeenCalled();
  });
});
