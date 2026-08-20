/**
 * Contact Growth card — honest states, a recoverable error, and a window that
 * cannot be overwritten by a stale response.
 *
 * Three defects motivated these. The card reported "Failed to load analytics"
 * in a 250px box with no retry and no hint at whose fault it was (audit M3).
 * Its fetch lived in a `useEffect` that called `setAnalytics` unconditionally,
 * so toggling 30d → 7d quickly let a slow 30-day response land last and sit
 * under a pressed "7 days" button (audit M1). And the all-time figures shared a
 * card with the window-scoped ones with nothing saying which was which (M4).
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactAnalytics as ContactAnalyticsData } from "@/actions/contacts-analytics";

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

globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {
    // no OS preference or viewport changes in jsdom
  },
  removeEventListener() {
    // no-op
  },
})) as unknown as typeof matchMedia;

// The card reads the org slug and the current filters straight off the router
// to build its health-bucket hrefs.
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "acme" }),
  useSearchParams: () => currentSearchParams,
}));

const getContactAnalytics = vi.fn();
vi.mock("@/actions/contacts-analytics", () => ({
  getContactAnalytics: (...args: unknown[]) => getContactAnalytics(...args),
}));

import { ContactAnalytics } from "../contact-analytics";

const ORG_ID = "org-1";

function analytics(
  overrides: Partial<ContactAnalyticsData> = {}
): ContactAnalyticsData {
  return {
    totalContacts: 1993,
    newContactsThisPeriod: 42,
    growthPercent: 12.5,
    avgOpenRate: 38.8,
    avgClickRate: 4.1,
    dailyGrowth: [
      { date: "2026-08-17", count: 20 },
      { date: "2026-08-18", count: 22 },
    ],
    listHealth: {
      active: 1800,
      unsubscribed: 100,
      bounced: 80,
      complained: 13,
      suppressed: 0,
      noEmailStatus: 0,
    },
    ...overrides,
  };
}

function renderCard(): ReactElement {
  const client = new QueryClient({
    // Retries would turn the error-state assertions into a timing race.
    defaultOptions: { queries: { retry: false } },
  });
  const element = (
    <QueryClientProvider client={client}>
      <ContactAnalytics organizationId={ORG_ID} />
    </QueryClientProvider>
  );
  render(element);
  return element;
}

afterEach(cleanup);

beforeEach(() => {
  getContactAnalytics.mockReset();
  currentSearchParams = new URLSearchParams();
});

describe("ContactAnalytics — empty period", () => {
  it("says no new contacts rather than plotting a flat empty series", async () => {
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics({
        newContactsThisPeriod: 0,
        growthPercent: 0,
        dailyGrowth: [
          { date: "2026-08-17", count: 0 },
          { date: "2026-08-18", count: 0 },
        ],
      }),
    });

    renderCard();

    expect(
      await screen.findByText(/no new contacts in this period/i)
    ).toBeInTheDocument();
    // The plot must be gone, not merely flat.
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
    // ...and the all-time figures, which do not depend on the window, stay.
    expect(screen.getByText("1,993")).toBeInTheDocument();
  });

  it("charts the period when any day has contacts", async () => {
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    expect(
      await screen.findByRole("figure", { name: /42 new contacts/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no new contacts in this period/i)
    ).not.toBeInTheDocument();
  });
});

describe("ContactAnalytics — proportions on a narrow card", () => {
  it("does not reserve the plot's height for the no-activity notice", async () => {
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics({
        newContactsThisPeriod: 0,
        growthPercent: 0,
        dailyGrowth: [
          { date: "2026-08-17", count: 0 },
          { date: "2026-08-18", count: 0 },
        ],
      }),
    });

    renderCard();

    // jsdom evaluates no container query and computes no layout, so the height
    // contract can only be asserted as the class that encodes it.
    const notice = await screen.findByText(/no new contacts in this period/i);
    expect(notice.className).toContain("h-24");
    expect(notice.className).not.toContain("h-[200px]");
  });

  it("stacks the health buckets in two columns until the card is wide enough for a row", async () => {
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    // Same reason as above: jsdom evaluates no container query, so the only
    // thing this environment can assert is the class that encodes the contract.
    const row = (await screen.findByText("List health")).nextElementSibling;
    expect(row?.className).toContain("grid-cols-2");
    expect(row?.className).toContain("@[540px]/card:flex");
  });
});

describe("ContactAnalytics — failed fetch (audit M3)", () => {
  it("blames the request, not the customer's data, and offers a retry", async () => {
    getContactAnalytics.mockResolvedValue({
      success: false,
      error: "Failed to fetch contact analytics",
    });

    renderCard();

    expect(
      await screen.findByText(/couldn't load contact growth/i)
    ).toBeInTheDocument();
    // A failed fetch is not an empty period.
    expect(
      screen.queryByText(/no new contacts in this period/i)
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("recovers the card when Retry succeeds", async () => {
    getContactAnalytics.mockResolvedValueOnce({
      success: false,
      error: "Failed to fetch contact analytics",
    });
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    await userEvent.click(
      await screen.findByRole("button", { name: /retry/i })
    );

    expect(
      await screen.findByRole("figure", { name: /contact growth/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't load contact growth/i)
    ).not.toBeInTheDocument();
  });
});

describe("ContactAnalytics — stale response race (audit M1)", () => {
  it("never shows 30 days of data under a pressed 7 days button", async () => {
    const resolvers = new Map<number, (value: unknown) => void>();
    getContactAnalytics.mockImplementation(
      (_orgId: string, days: number) =>
        new Promise((resolve) => {
          resolvers.set(days, resolve);
        })
    );

    renderCard();

    // The 30-day request is in flight. Switch windows before it lands.
    await waitFor(() => expect(resolvers.has(30)).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(resolvers.has(7)).toBe(true));

    resolvers.get(7)?.({
      success: true,
      analytics: analytics({ newContactsThisPeriod: 7 }),
    });
    expect(await screen.findByText("+7")).toBeInTheDocument();

    // The slow 30-day response arrives last.
    resolvers.get(30)?.({
      success: true,
      analytics: analytics({ newContactsThisPeriod: 300 }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await waitFor(() => {
      expect(screen.getByText("+7")).toBeInTheDocument();
    });
    expect(screen.queryByText("+300")).not.toBeInTheDocument();
    expect(screen.getByText(/new in the last 7 days/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});

describe("ContactAnalytics — scope and refresh", () => {
  it("keeps the all-time scope prose behind a disclosure (audit M4)", async () => {
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    const trigger = await screen.findByRole("button", {
      name: /what these figures cover/i,
    });
    expect(
      screen.queryByText(/do not change when you switch the time range/i)
    ).not.toBeInTheDocument();

    await userEvent.click(trigger);

    expect(
      await screen.findByText(/do not change when you switch the time range/i)
    ).toBeInTheDocument();
  });

  it("keeps the caveat about the filtered table on the surface", async () => {
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    expect(
      await screen.findByText(
        /whole organization, not the filtered list below/i
      )
    ).toBeInTheDocument();
  });

  it("announces the outcome of a refresh (audit M2)", async () => {
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    await screen.findByRole("figure", { name: /contact growth/i });
    const [refresh] = screen.getAllByRole("button", {
      name: "Refresh contact growth",
    });

    await userEvent.click(refresh);

    expect(refresh).not.toBeDisabled();
    await waitFor(() =>
      expect(screen.getByText("Contact growth refreshed.")).toBeInTheDocument()
    );
  });

  it("says so when the refresh itself failed", async () => {
    getContactAnalytics.mockResolvedValueOnce({
      success: true,
      analytics: analytics(),
    });
    getContactAnalytics.mockResolvedValue({
      success: false,
      error: "Failed to fetch contact analytics",
    });

    renderCard();

    await screen.findByRole("figure", { name: /contact growth/i });

    await userEvent.click(
      screen.getAllByRole("button", { name: "Refresh contact growth" })[0]
    );

    await waitFor(() =>
      expect(
        screen.getByText("Could not refresh contact growth.")
      ).toBeInTheDocument()
    );
  });
});
