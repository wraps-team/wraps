/**
 * The Bounced and Complaints rows of the performance breakdown link to the
 * hub's Deliverability tab: Bounced opens the reasons view, Complaints the
 * causes view. The window carries over from the page's `days` param.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceMetrics } from "../performance-metrics";

const search = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search.value),
}));

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
  useAnalyticsOverview: () => ({
    data: overview,
    isLoading: false,
    error: null,
  }),
}));

afterEach(() => {
  cleanup();
  search.value = "";
});

function viewCausesHref(metric: "bounce" | "complaint") {
  return screen
    .getAllByRole("link", { name: "View causes" })
    .find((a) => a.getAttribute("href")?.includes(`metric=${metric}`))
    ?.getAttribute("href");
}

describe("performance breakdown links", () => {
  it("the Bounced row opens the hub's reasons view at the default window", () => {
    render(<PerformanceMetrics orgSlug="acme" />);
    expect(viewCausesHref("bounce")).toBe(
      "/acme/emails?tab=deliverability&metric=bounce&drive=reasons"
    );
  });

  it("the Complaints row opens the hub's causes view", () => {
    render(<PerformanceMetrics orgSlug="acme" />);
    expect(viewCausesHref("complaint")).toBe(
      "/acme/emails?tab=deliverability&metric=complaint"
    );
  });

  it("carries the page's days window into both links", () => {
    search.value = "days=7";
    render(<PerformanceMetrics orgSlug="acme" />);
    expect(viewCausesHref("bounce")).toBe(
      "/acme/emails?tab=deliverability&days=7&metric=bounce&drive=reasons"
    );
    expect(viewCausesHref("complaint")).toBe(
      "/acme/emails?tab=deliverability&days=7&metric=complaint"
    );
  });
});
