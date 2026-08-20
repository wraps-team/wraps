/**
 * Contact Growth card — the health buckets are the table's status filter.
 *
 * The card reported five counts the reader could do nothing with: seeing "80
 * bounced" meant walking down to the table and re-picking the same status out
 * of a <Select>. These pin the link contract (which params survive, which are
 * cleared), the affordance for the bucket already applied, the telemetry, and
 * the focus move onto the table the numbers describe.
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
import { CONTACTS_TABLE_HEADING_ID } from "@/lib/contacts";

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

const capture = vi.fn();
vi.mock("posthog-js", () => ({
  default: { capture: (...args: unknown[]) => capture(...args) },
}));

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

// The focus-move test stands the table's anchor up outside the render tree, so
// `cleanup` does not take it back down.
afterEach(() => {
  document.getElementById(CONTACTS_TABLE_HEADING_ID)?.remove();
});

beforeEach(() => {
  getContactAnalytics.mockReset();
  capture.mockReset();
  currentSearchParams = new URLSearchParams();
});

describe("Contact Growth card — health buckets as filter links", () => {
  it("links a non-zero bounced count to the contacts list filtered to bounced", async () => {
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    const link = await screen.findByRole("link", { name: /^80 bounced$/ });
    const params = new URLSearchParams(
      link.getAttribute("href")?.split("?")[1]
    );
    expect(link.getAttribute("href")).toContain("/acme/contacts?");
    expect(params.get("emailStatus")).toBe("bounced");
  });

  it("keeps the reader's sort and page size but drops the search, topic and open contact", async () => {
    currentSearchParams = new URLSearchParams({
      contactId: "contact-9",
      emailStatus: "active",
      page: "5",
      pageSize: "100",
      search: "ada",
      sortBy: "email",
      sortDir: "asc",
      topicId: "topic-9",
    });
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    const link = await screen.findByRole("link", { name: /^80 bounced$/ });
    const params = new URLSearchParams(
      link.getAttribute("href")?.split("?")[1]
    );
    expect(params.get("sortBy")).toBe("email");
    expect(params.get("sortDir")).toBe("asc");
    expect(params.get("pageSize")).toBe("100");
    expect(params.get("page")).toBe("1");
    expect(params.get("search")).toBeNull();
    expect(params.get("topicId")).toBeNull();
    expect(params.get("contactId")).toBeNull();
  });

  it("shows a zero-count bucket as plain text rather than a link", async () => {
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics({
        listHealth: {
          active: 1800,
          unsubscribed: 100,
          bounced: 80,
          complained: 0,
          suppressed: 0,
          noEmailStatus: 0,
        },
      }),
    });

    renderCard();

    await screen.findByRole("link", { name: /^80 bounced$/ });
    expect(screen.queryByRole("link", { name: /complained/ })).toBeNull();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("reports the click as a health_bucket filter change, with no contact details", async () => {
    const user = userEvent.setup();
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    await user.click(await screen.findByRole("link", { name: /^80 bounced$/ }));

    expect(capture).toHaveBeenCalledWith("contacts_filter_changed", {
      control: "health_bucket",
      from: "all",
      to: "bounced",
    });
    for (const call of capture.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("ada@example.com");
    }
  });

  it("moves keyboard focus onto the contacts table's heading", async () => {
    const user = userEvent.setup();
    // The table is not rendered by this suite, so stand its focus anchor up by
    // hand — unit 7 in contacts-table-a11y.test.tsx is the other half of the
    // contract, that the table really renders this id.
    const anchor = document.createElement("h2");
    anchor.id = CONTACTS_TABLE_HEADING_ID;
    anchor.tabIndex = -1;
    document.body.append(anchor);

    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    await user.click(await screen.findByRole("link", { name: /^80 bounced$/ }));

    await waitFor(() => expect(anchor).toHaveFocus());
  });

  it("marks the bucket already on the URL as current and reports no change when it is re-clicked", async () => {
    const user = userEvent.setup();
    currentSearchParams = new URLSearchParams({ emailStatus: "bounced" });
    getContactAnalytics.mockResolvedValue({
      success: true,
      analytics: analytics(),
    });

    renderCard();

    const link = await screen.findByRole("link", { name: /^80 bounced$/ });
    expect(link).toHaveAttribute("aria-current", "true");

    // "Current" only means anything against the buckets that are not. Asserted
    // on every other link, so marking them all current — the ambiguity this
    // affordance exists to remove — cannot pass.
    const others = [
      screen.getByRole("link", { name: /^1,800 active$/ }),
      screen.getByRole("link", { name: /^100 unsubscribed$/ }),
      screen.getByRole("link", { name: /^13 complained$/ }),
    ];
    for (const other of others) {
      expect(other).not.toHaveAttribute("aria-current");
    }

    // The visual half of the same affordance. jsdom computes no styles, so the
    // selected treatment can only be asserted as the variant class encoding it.
    expect(link.className).toContain("bg-secondary");
    for (const other of others) {
      expect(other.className).not.toContain("bg-secondary");
    }

    await user.click(link);

    // Scoped to the event name rather than `not.toHaveBeenCalled()`, so an
    // unrelated capture elsewhere in the card cannot fail this.
    expect(capture).not.toHaveBeenCalledWith(
      "contacts_filter_changed",
      expect.anything()
    );
  });
});
