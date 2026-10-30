/**
 * Deliverability card: the verdict is graded from SES account reputation, the
 * rail labels its two populations apart, the metric toggle is URL state, and
 * the low-volume states replace the chart. The data hooks are mocked, and
 * recharts is sized so the review-line label reaches the DOM.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailChartMeta } from "@/lib/analytics-scope";
import { DeliverabilityBody, DeliverabilityCard } from "../deliverability-card";

const push = vi.hoisted(() => vi.fn());

const state = vi.hoisted(() => ({
  email: undefined as unknown,
  emailError: false,
  overview: undefined as unknown,
  bounce: undefined as unknown,
  complaint: undefined as unknown,
  suppression: undefined as unknown,
}));

vi.mock("../../../analytics/hooks/use-analytics", () => {
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
      isLoading: state.email === undefined && !state.emailError,
      isError: state.emailError,
      error: state.emailError ? new Error("boom") : null,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useAnalyticsOverview: () => hook(state.overview),
    useBounceData: () => hook(state.bounce),
    useComplaintData: () => hook(state.complaint),
    useSuppressionData: () => hook(state.suppression),
    useChangeMarkers: () => ({
      data: undefined,
      isLoading: false,
      error: null,
    }),
  };
});

// The panel's tabs fetch their own data; the card test checks only the card.
vi.mock("../../tabs/sends-tab", () => ({
  default: {
    id: "sends",
    label: "Sends",
    enabled: true,
    Component: () => <p>Causes stub</p>,
  },
}));
// The side card runs its own reasons query, so the body test stubs it.
vi.mock("../metric-reasons-card", () => ({
  MetricReasonsCard: (props: { metric: string }) => (
    <p>{`Reasons card stub: ${props.metric}`}</p>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("days=30"),
}));

// Size the chart so its labels render; the card asserts on them.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const React = await import("react");
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: React.ReactElement<{ width?: number; height?: number }>;
    }) => React.cloneElement(children, { width: 640, height: 180 }),
    // jsdom has no pointer geometry, so a stand-in button fires a day click.
    AreaChart: (props: React.ComponentProps<typeof actual.AreaChart>) => (
      <>
        <button
          onClick={() =>
            (
              props.onClick as unknown as
                | ((state: { activeLabel: string }) => void)
                | undefined
            )?.({ activeLabel: "2026-10-22" })
          }
          type="button"
        >
          Click day 22
        </button>
        <actual.AreaChart {...props} />
      </>
    ),
  };
});

globalThis.ResizeObserver ??= class {
  observe() {
    // no layout in jsdom
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

const meta = (overrides: Partial<EmailChartMeta> = {}): EmailChartMeta => ({
  reputationScope: "ses-account",
  awsAccountCount: 1,
  awsAccountsUnavailable: 0,
  reputationAsOf: NOW,
  generatedAt: NOW,
  ...overrides,
});

function email(
  rates: { bounceRate: number; complaintRate: number },
  metaOverrides: Partial<EmailChartMeta> = {}
) {
  return {
    overview: {
      totalSent: 0,
      totalDelivered: 0,
      totalBounced: 0,
      totalComplaints: 0,
      totalRenderingFailures: 0,
      deliveryRate: 100,
      ...rates,
    },
    volume: [],
    engagement: [],
    meta: meta(metaOverrides),
  };
}

function overview(totalSent: number, totalComplaints = 0) {
  return {
    totalSent,
    totalDelivered: totalSent,
    totalBounced: 0,
    totalComplaints,
    totalRenderingFailures: 0,
    deliveryRate: 100,
    bounceRate: 0,
    complaintRate: 0,
  };
}

const DAYS = [
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
  "2026-10-24",
  "2026-10-25",
  "2026-10-26",
];

function series(key: string, values: number[]) {
  return DAYS.map((date, i) => ({
    date,
    timestamp: NOW - (DAYS.length - i) * 86_400_000,
    [key]: values[i] ?? 0,
  }));
}

function bounceRows(rate: number) {
  return DAYS.map((date, i) => ({
    date,
    timestamp: NOW - (DAYS.length - i) * 86_400_000,
    permanent: 0,
    transient: 0,
    undetermined: 0,
    total: 0,
    sent: 100,
    bounceRate: i === DAYS.length - 1 ? rate : 1,
  }));
}

function complaintRows(rate: number) {
  return DAYS.map((date, i) => ({
    date,
    timestamp: NOW - (DAYS.length - i) * 86_400_000,
    complaints: 0,
    sent: 100,
    complaintRate: i === DAYS.length - 1 ? rate : 0,
  }));
}

function suppressionRows() {
  return DAYS.map((date, i) => ({
    date,
    timestamp: NOW - (DAYS.length - i) * 86_400_000,
    suppressed: i === 0 ? 3 : 2,
    sent: 100,
    suppressionRate: 1,
  }));
}

/** A healthy, rated account with no sends issues: the default fixture. */
function loadHealthy(rates = { bounceRate: 2.6, complaintRate: 0.03 }) {
  state.email = email(rates);
  state.overview = overview(5000, 7);
  state.bounce = bounceRows(2.6);
  state.complaint = complaintRows(0.03);
  state.suppression = suppressionRows();
}

function renderCard(
  search: Record<string, string> = {},
  onUrlUpdate = vi.fn()
) {
  render(
    <NuqsTestingAdapter onUrlUpdate={onUrlUpdate} searchParams={search}>
      <DeliverabilityCard orgSlug="acme" />
    </NuqsTestingAdapter>
  );
  return onUrlUpdate;
}

beforeEach(() => {
  state.email = undefined;
  state.emailError = false;
  state.overview = undefined;
  state.bounce = undefined;
  state.complaint = undefined;
  state.suppression = undefined;
});

afterEach(() => {
  cleanup();
});

describe("verdict and rail", () => {
  it("grades the SES account rates, not the window's", () => {
    loadHealthy({ bounceRate: 2.6, complaintRate: 0.03 });
    renderCard();
    expect(screen.getByText("Watch")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your bounce rate is past half of the SES review line (5%)."
      )
    ).toBeInTheDocument();
  });

  it("shows At risk at or over the bounce review line", () => {
    loadHealthy({ bounceRate: 5.8, complaintRate: 0.03 });
    renderCard();
    expect(screen.getByText("At risk")).toBeInTheDocument();
  });

  it("takes its reputation title from the scope label", () => {
    loadHealthy();
    renderCard();
    expect(
      screen.getByText("Account reputation", { selector: "div" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: 'What "Account reputation" measures' })
    ).toBeInTheDocument();
  });

  it("warns when an AWS account did not report", () => {
    loadHealthy();
    state.email = email(
      { bounceRate: 2.6, complaintRate: 0.03 },
      { awsAccountCount: 2, awsAccountsUnavailable: 1 }
    );
    renderCard();
    expect(
      screen.getByText("1 of 2 AWS accounts did not report reputation")
    ).toBeInTheDocument();
  });

  it("takes Complaints and Suppressed from the window hooks", () => {
    loadHealthy();
    renderCard();
    expect(screen.getByText("7")).toBeInTheDocument();
    // Suppressed sums the window's rows: 3 + 2 * 6.
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("sends blocked")).toBeInTheDocument();
  });
});

describe("chart and metric toggle", () => {
  it("draws the bounce review line by default, labelled 5%", () => {
    loadHealthy();
    renderCard();
    expect(
      screen.getByRole("figure", { name: /Bounce rate over the last 30 days/ })
    ).toBeInTheDocument();
    expect(screen.getByText("SES review line · 5%")).toBeInTheDocument();
  });

  it("draws the complaint chart and its 0.1% review line from metric=complaint", () => {
    loadHealthy();
    renderCard({ metric: "complaint" });
    expect(
      screen.getByRole("figure", {
        name: /Complaint rate over the last 30 days/,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("SES review line · 0.1%")).toBeInTheDocument();
  });

  it("draws no review line for suppression", () => {
    loadHealthy();
    renderCard({ metric: "suppression" });
    expect(
      screen.getByRole("figure", { name: /Suppression rate/ })
    ).toBeInTheDocument();
    expect(screen.queryByText(/SES review line ·/)).not.toBeInTheDocument();
  });

  it("shows the population caption and no legend", () => {
    loadHealthy();
    renderCard();
    expect(
      screen.getByText(
        /Rate of mail sent through Wraps over the selected range/
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: /legend/i })
    ).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading and an error message on failure", () => {
    renderCard();
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();

    cleanup();
    state.email = undefined;
    state.emailError = true;
    renderCard();
    expect(
      screen.getByText("Failed to load deliverability data")
    ).toBeInTheDocument();
  });
});

describe("low-volume and no-activity states", () => {
  it("shows a dash, dashes for rates, and no chart when nothing was sent", () => {
    loadHealthy();
    state.overview = overview(0, 0);
    renderCard();
    // The badge, and the two account reputation rates.
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByText("no sends yet")).toBeInTheDocument();
    expect(screen.getByText("No data for this period")).toHaveClass(
      "border-dashed"
    );
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
    expect(screen.queryByText(/SES review line ·/)).not.toBeInTheDocument();
  });

  it("does not rate 14 sends as At risk, and says why", () => {
    loadHealthy({ bounceRate: 7.14, complaintRate: 0 });
    state.overview = overview(14, 0);
    renderCard();
    expect(screen.getByText("Not rated")).toBeInTheDocument();
    expect(screen.queryByText("At risk")).not.toBeInTheDocument();
    expect(screen.getByText("of 14 sends")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Based on 14 sends. Rates this small swing on a single bounce."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("figure")).toBeInTheDocument();
    expect(screen.getByText("SES review line · 5%")).toBeInTheDocument();
  });

  it("rates the same payload At risk at 5000 sends", () => {
    loadHealthy({ bounceRate: 7.14, complaintRate: 0 });
    renderCard();
    expect(screen.getByText("At risk")).toBeInTheDocument();
  });
});

describe("chart day click", () => {
  it("sets day in the URL and does not navigate to the drilldown", async () => {
    loadHealthy();
    const onUrlUpdate = renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Click day 22" }));
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("day")).toBe(
      "2026-10-22"
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a pointer cursor on the chart when a day can be clicked", () => {
    loadHealthy();
    renderCard();
    expect(screen.getByRole("figure")).toHaveClass("cursor-pointer");
  });

  it("does nothing on a day click in the low-volume state", async () => {
    loadHealthy();
    state.overview = overview(14, 0);
    const onUrlUpdate = renderCard();
    expect(screen.getByRole("figure")).not.toHaveClass("cursor-pointer");
    await userEvent.click(screen.getByRole("button", { name: "Click day 22" }));
    expect(
      onUrlUpdate.mock.calls.every(
        (call) => call[0].searchParams.get("day") === null
      )
    ).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("has no View causes link", () => {
    loadHealthy();
    renderCard();
    expect(
      screen.queryByRole("link", { name: "View causes" })
    ).not.toBeInTheDocument();
  });
});

describe("refetch", () => {
  it("keeps the drawn chart while the next range loads", () => {
    loadHealthy();
    const { rerender } = render(
      <NuqsTestingAdapter searchParams={{}}>
        <DeliverabilityCard orgSlug="acme" />
      </NuqsTestingAdapter>
    );
    expect(
      screen.getByRole("figure", { name: /Bounce rate over the last 30 days/ })
    ).toBeInTheDocument();

    state.bounce = undefined;
    rerender(
      <NuqsTestingAdapter searchParams={{}}>
        <DeliverabilityCard orgSlug="acme" />
      </NuqsTestingAdapter>
    );
    expect(
      screen.getByRole("figure", { name: /Bounce rate over the last 30 days/ })
    ).toBeInTheDocument();
  });
});

describe("DeliverabilityBody", () => {
  it("mounts the causes panel under the card at normal volume", () => {
    loadHealthy();
    render(
      <NuqsTestingAdapter searchParams={{}}>
        <DeliverabilityBody orgSlug="acme" />
      </NuqsTestingAdapter>
    );
    expect(
      screen.getByRole("heading", { name: "What's driving your bounce rate" })
    ).toBeInTheDocument();
    expect(screen.getByText("Causes stub")).toBeInTheDocument();
    expect(screen.getByText("Reasons card stub: bounce")).toBeInTheDocument();
  });

  it("shows no causes panel in the low-volume state", () => {
    loadHealthy();
    state.overview = overview(14, 0);
    render(
      <NuqsTestingAdapter searchParams={{}}>
        <DeliverabilityBody orgSlug="acme" />
      </NuqsTestingAdapter>
    );
    expect(screen.queryByText("Causes stub")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /What's driving/ })
    ).not.toBeInTheDocument();
  });

  it("shows the Breakdown note while the window is too small to compare", () => {
    loadHealthy();
    state.overview = overview(14, 0);
    render(
      <NuqsTestingAdapter searchParams={{}}>
        <DeliverabilityBody orgSlug="acme" />
      </NuqsTestingAdapter>
    );
    const note = screen.getByText("Breakdown").closest("section");
    expect(note).not.toBeNull();
    expect(
      within(note as HTMLElement).getByText(
        "Breakdowns need enough sends to compare. You have 14 so far; they appear at 100."
      )
    ).toBeInTheDocument();
  });

  it("shows no Breakdown note at 5000 sends", () => {
    loadHealthy();
    render(
      <NuqsTestingAdapter searchParams={{}}>
        <DeliverabilityBody orgSlug="acme" />
      </NuqsTestingAdapter>
    );
    expect(
      screen.queryByText(/Breakdowns need enough sends/)
    ).not.toBeInTheDocument();
  });

  it("shows no side card for suppression", () => {
    loadHealthy();
    render(
      <NuqsTestingAdapter searchParams={{ metric: "suppression" }}>
        <DeliverabilityBody orgSlug="acme" />
      </NuqsTestingAdapter>
    );
    expect(screen.getByText("Causes stub")).toBeInTheDocument();
    expect(screen.queryByText(/Reasons card stub/)).not.toBeInTheDocument();
  });
});
