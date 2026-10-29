/**
 * The side card: the total and rate, the hard and soft tags from bounceType,
 * the "Other" roll-up, and the empty copy. The data hooks are mocked.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricReasonsCard } from "../metric-reasons-card";
import type { ReasonGroup, ReasonsResponse } from "../reason-groups";

const state = vi.hoisted(() => ({
  reasons: undefined as unknown,
  reasonsError: false,
  sends: 6115 as number | undefined,
}));

vi.mock("@/hooks/use-hub-days", () => ({ useHubDays: () => 30 }));

vi.mock("../../../analytics/hooks/use-analytics", () => ({
  useAnalyticsOverview: () => ({
    data: state.sends === undefined ? undefined : { totalSent: state.sends },
  }),
}));

vi.mock("../../hooks/use-drilldown-reasons", () => ({
  useDrilldownReasons: () => ({
    data: state.reasons,
    isError: state.reasonsError,
    refetch: vi.fn(),
  }),
}));

function reason(overrides: Partial<ReasonGroup> = {}): ReasonGroup {
  return {
    receiverDomain: "gmail.com",
    bounceType: "Permanent",
    title: "Address does not exist",
    explanation: null,
    suggestedAction: null,
    provider: null,
    severity: "permanent",
    rawCode: null,
    feedbackType: null,
    count: 33,
    share: 20,
    distinctRecipients: 5,
    firstSeen: null,
    lastSeen: null,
    hasDetail: true,
    ...overrides,
  } as ReasonGroup;
}

function response(overrides: Partial<ReasonsResponse> = {}): ReasonsResponse {
  return {
    mode: "detailed",
    metric: "bounce",
    totalCount: 159,
    fallbackSince: null,
    windowHasFallbackRows: false,
    groups: [],
    otherCount: 0,
    suppressionReconciliation: 0,
    ...overrides,
  };
}

function renderCard(metric: "bounce" | "complaint") {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <NuqsTestingAdapter searchParams={{ days: "30" }}>
        <MetricReasonsCard metric={metric} orgSlug="acme" />
      </NuqsTestingAdapter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  state.reasonsError = false;
  state.sends = 6115;
  state.reasons = response({
    groups: [
      reason({ title: "Mailbox full", bounceType: "Transient", count: 52 }),
      reason({
        title: "Server unreachable",
        bounceType: "Undetermined",
        count: 38,
      }),
      reason({
        title: "Address does not exist",
        bounceType: "Permanent",
        count: 33,
      }),
      reason({ title: "Domain not found", bounceType: "Permanent", count: 8 }),
    ],
    otherCount: 28,
  });
});

afterEach(() => {
  cleanup();
});

describe("MetricReasonsCard for bounces", () => {
  it("shows the title, the total and the rate of sends", () => {
    renderCard("bounce");
    expect(
      screen.getByRole("heading", { name: "Bounces" })
    ).toBeInTheDocument();
    expect(screen.getByText("What SES rejected, and why.")).toBeInTheDocument();
    expect(screen.getByText("159")).toBeInTheDocument();
    expect(screen.getByText("2.6% of sends")).toBeInTheDocument();
  });

  it("tags each reason hard or soft from its bounce type", () => {
    renderCard("bounce");
    const mailbox = screen
      .getByText("Mailbox full")
      .closest("div") as HTMLElement;
    expect(mailbox).toHaveTextContent("soft");
    const unreachable = screen
      .getByText("Server unreachable")
      .closest("div") as HTMLElement;
    expect(unreachable).toHaveTextContent("soft");
    const missing = screen
      .getByText("Address does not exist")
      .closest("div") as HTMLElement;
    expect(missing).toHaveTextContent("hard");
    expect(
      screen.getByText("Domain not found").closest("div")
    ).toHaveTextContent("hard");
  });

  it("folds the reasons past the top five, and the receiver's other count, into Other", () => {
    state.reasons = response({
      totalCount: 200,
      groups: [
        ...[60, 50, 40, 30, 20, 10].map((count, i) =>
          reason({ title: `Reason ${i + 1}`, count })
        ),
      ],
      otherCount: 5,
    });
    renderCard("bounce");
    expect(screen.queryByText("Reason 6")).toBeNull();
    // 10 from the sixth group, plus 5 the receiver's other count covers.
    expect(screen.getByText("Other").closest("li")).toHaveTextContent("15");
  });

  it("merges one reason across receiver domains into a single row with the summed count", () => {
    state.reasons = response({
      totalCount: 30,
      groups: [
        reason({
          receiverDomain: "gmail.com",
          title: "Soft bounce — general (may retry)",
          bounceType: "Transient",
          count: 4,
        }),
        reason({
          receiverDomain: "yahoo.com",
          title: "Soft bounce — general (may retry)",
          bounceType: "Transient",
          count: 5,
        }),
        reason({
          receiverDomain: "outlook.com",
          title: "Soft bounce — general (may retry)",
          bounceType: "Transient",
          count: 6,
        }),
        reason({
          receiverDomain: "gmail.com",
          title: "Address does not exist",
          bounceType: "Permanent",
          count: 15,
        }),
      ],
      otherCount: 0,
    });
    renderCard("bounce");
    expect(
      screen.getAllByText("Soft bounce — general (may retry)")
    ).toHaveLength(1);
    expect(
      screen.getByText("Soft bounce — general (may retry)").closest("li")
    ).toHaveTextContent("15");
    expect(screen.getByText("Address does not exist")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("carries the hard and soft explainer and the footnote", () => {
    renderCard("bounce");
    expect(
      screen.getByText(/The receiving server rejected the email\./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "SES suppresses hard bounces for you. Repeat soft bounces are not, so they keep counting against you."
      )
    ).toBeInTheDocument();
  });

  it("says so when there are no bounces", () => {
    state.reasons = response({ totalCount: 0, groups: [], otherCount: 0 });
    renderCard("bounce");
    expect(screen.getByText("No bounces in this window.")).toBeInTheDocument();
  });

  it("shows a dash for the rate when nothing was sent", () => {
    state.sends = 0;
    renderCard("bounce");
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("MetricReasonsCard for complaints", () => {
  it("titles the card, shows no hard or soft tags and no bounce explainer", () => {
    state.reasons = response({
      metric: "complaint",
      totalCount: 2,
      groups: [reason({ title: "Spam complaint", bounceType: null, count: 2 })],
      otherCount: 0,
    });
    renderCard("complaint");
    expect(
      screen.getByRole("heading", { name: "Complaints" })
    ).toBeInTheDocument();
    expect(screen.getByText("Spam complaint")).toBeInTheDocument();
    expect(screen.queryByText("hard")).toBeNull();
    expect(screen.queryByText("soft")).toBeNull();
    expect(
      screen.getByText(
        "Suppress every complaint: mailing these people again is the fastest way to a reputation review."
      )
    ).toBeInTheDocument();
  });

  it("says so when there are no complaints", () => {
    state.reasons = response({
      metric: "complaint",
      totalCount: 0,
      groups: [],
    });
    renderCard("complaint");
    expect(
      screen.getByText("No complaints in this window.")
    ).toBeInTheDocument();
  });
});
