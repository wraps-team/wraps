/**
 * The Addresses drill-down tab: the top-100 line, the empty state, and the
 * rendered order. The server action and the organization context are mocked.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrilldownWindow } from "@/lib/analytics-drilldown-window";

const mockListProblemAddresses = vi.fn();
vi.mock("@/actions/address-detail", () => ({
  listProblemAddresses: (...args: unknown[]) =>
    mockListProblemAddresses(...args),
  getAddressDetail: vi.fn(),
}));

vi.mock("@/contexts/organization-context", () => ({
  useActiveOrganization: () => ({
    activeOrganization: { id: "org-tab-test" },
  }),
}));

vi.mock("@/actions/contacts-analytics", () => ({
  getContactTimeline: vi.fn(),
}));

import addressesTab from "../addresses-tab";

const WINDOW: DrilldownWindow = {
  days: 30,
  startTime: new Date("2026-09-28T00:00:00.000Z"),
  endTime: new Date("2026-10-28T00:00:00.000Z"),
  day: null,
  tz: "UTC",
};

function renderTab(metric: "bounce" | "complaint" | "suppression" = "bounce") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Tab = addressesTab.Component;
  return render(
    <QueryClientProvider client={client}>
      <Tab metric={metric} orgSlug="acme" window={WINDOW} />
    </QueryClientProvider>
  );
}

function row(address: string, complaints: number, bounces: number) {
  return {
    address,
    complaints,
    bounces,
    suppressed: 0,
    lastProblemAt: "2026-10-20T10:00:00.000Z",
  };
}

beforeEach(() => {
  mockListProblemAddresses.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("addresses drill-down tab", () => {
  it('renders the top 100 with the total line "Showing top 100 of N addresses"', async () => {
    const rows = Array.from({ length: 100 }, (_, index) =>
      row(`top-${index}@example.com`, 0, 1)
    );
    mockListProblemAddresses.mockResolvedValue({
      success: true,
      rows,
      totals: { complaints: 0, bounces: 100, suppressed: 0 },
      uniqueAddresses: 150,
    });
    renderTab();
    expect(
      await screen.findByText("Showing top 100 of 150 addresses")
    ).toBeInTheDocument();
    expect(
      screen.getByText("0 complaints · 100 bounces · 0 suppressed")
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /top-\d+@example\.com/ })
    ).toHaveLength(100);
  });

  it("shows the empty state when the window has no problems", async () => {
    mockListProblemAddresses.mockResolvedValue({
      success: true,
      rows: [],
      totals: { complaints: 0, bounces: 0, suppressed: 0 },
      uniqueAddresses: 0,
    });
    renderTab();
    expect(
      await screen.findByText("No problems in this window")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No addresses bounced, complained or were suppressed in this period."
      )
    ).toBeInTheDocument();
  });

  it("sorts complaints first in the rendered order", async () => {
    // The server sorts complaints, then bounces. The tab renders that order
    // as given, so the complaint row comes first.
    mockListProblemAddresses.mockResolvedValue({
      success: true,
      rows: [
        row("complaint@example.com", 1, 0),
        row("bounces@example.com", 0, 5),
      ],
      totals: { complaints: 1, bounces: 5, suppressed: 0 },
      uniqueAddresses: 2,
    });
    renderTab();
    const table = await screen.findByRole("table");
    const addresses = within(table)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(addresses).toEqual(["complaint@example.com", "bounces@example.com"]);
  });
});
