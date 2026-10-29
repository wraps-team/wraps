/**
 * Addresses to review panel: the default tab, the URL state (only `list`),
 * the counts and empty states, Load more, Suppress all with its confirmation,
 * the error state, and that no address reaches the URL when a row opens.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewRow } from "@/actions/address-review";

const mockList = vi.fn();
vi.mock("@/actions/address-review", () => ({
  listAddressesToReview: (...args: unknown[]) => mockList(...args),
}));

const mockListSuppressions = vi.fn();
const mockAddSuppression = vi.fn();
vi.mock("@/actions/suppressions", () => ({
  listSuppressions: (...args: unknown[]) => mockListSuppressions(...args),
  removeSuppression: vi.fn(),
  addSuppression: (...args: unknown[]) => mockAddSuppression(...args),
}));

const mockGetAddressDetail = vi.fn();
vi.mock("@/actions/address-detail", () => ({
  getAddressDetail: (...args: unknown[]) => mockGetAddressDetail(...args),
}));

vi.mock("@/actions/contacts-analytics", () => ({
  getContactTimeline: vi.fn(async () => ({
    success: true,
    events: [],
    hasMore: false,
    history: {
      agedOutEvents: 0,
      hasUnshowableHistory: false,
      recordedEmailsSent: 0,
      recordedSmsSent: 0,
    },
  })),
}));

vi.mock("@/hooks/use-hub-days", () => ({
  useHubDays: () => 30,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AddressesToReview } from "../addresses-to-review";

const ORG_ID = "org-review-panel";
const ACCOUNTS = [{ id: "aws-1", name: "Production", region: "us-east-1" }];

function row(overrides: Partial<ReviewRow> & { address: string }): ReviewRow {
  return {
    kinds: ["hard"],
    why: "Hard bounce",
    soft: 0,
    hard: 1,
    complaints: 0,
    softDays: 0,
    lastEventAt: "2026-10-20T10:00:00.000Z",
    awsAccountId: "aws-1",
    status: "not_listed",
    listedReason: null,
    reasonToSuppress: "BOUNCE",
    recommended: true,
    ...overrides,
  };
}

const COUNTS = { soft: 4, hard: 2, complaint: 1 };
const REC_ROWS = [
  row({ address: "one@example.com" }),
  row({
    address: "two@example.com",
    why: "Complaint",
    reasonToSuppress: "COMPLAINT",
    complaints: 1,
    hard: 0,
  }),
];

/** Responses by list. A test overrides one entry before rendering. */
let responses: Record<string, unknown>;

function renderPanel(search: Record<string, string> = {}) {
  const onUrlUpdate = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NuqsTestingAdapter
        hasMemory
        onUrlUpdate={onUrlUpdate}
        searchParams={search}
      >
        <AddressesToReview
          accounts={ACCOUNTS}
          organizationId={ORG_ID}
          orgSlug="acme"
        />
      </NuqsTestingAdapter>
    </QueryClientProvider>
  );
  return { onUrlUpdate };
}

beforeEach(() => {
  responses = {
    recommended: {
      success: true,
      list: "recommended",
      rows: REC_ROWS,
      hasMore: false,
      counts: COUNTS,
    },
    soft: {
      success: true,
      list: "soft",
      rows: [
        row({
          address: "soft@example.com",
          kinds: ["soft"],
          why: "Soft",
          soft: 3,
          hard: 0,
          softDays: 2,
        }),
      ],
      hasMore: false,
      counts: COUNTS,
    },
    hard: {
      success: true,
      list: "hard",
      rows: [],
      hasMore: false,
      counts: COUNTS,
    },
    complaint: {
      success: true,
      list: "complaint",
      rows: [],
      hasMore: false,
      counts: COUNTS,
    },
  };
  mockList.mockImplementation(
    async (_org: string, input: { list: string }) => responses[input.list]
  );
  mockListSuppressions.mockResolvedValue({
    success: true,
    page: {
      entries: [],
      hasMore: false,
      nextToken: undefined,
      deniedAccountIds: [],
      unreachableAccountIds: [],
    },
  });
  mockGetAddressDetail.mockResolvedValue({
    success: true,
    address: "one@example.com",
    totals: { sends: 0, bounces: 0, complaints: 0, suppressed: 0 },
    lastProblemAt: null,
    problemSends: [],
    problemSendsHasMore: false,
    suppressionAccount: null,
    retentionDays: 30,
    contact: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AddressesToReview", () => {
  it("opens on Recommendations and asks for the hub window and the browser zone", async () => {
    renderPanel();
    await screen.findByText("one@example.com");
    expect(mockList).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        list: "recommended",
        days: 30,
        offset: 0,
        tz: expect.any(String),
      })
    );
    expect(mockList.mock.calls[0][1].tz.length).toBeGreaterThan(0);
  });

  it("shows counts on the window tabs and none on Suppressed", async () => {
    renderPanel();
    await screen.findByText("one@example.com");
    expect(
      await screen.findByRole("tab", { name: "Soft bounces (4)" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Hard bounces (2)" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Complaints (1)" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Recommendations (2)" })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Suppressed" })).toBeInTheDocument();
  });

  it("moves the list into the URL and loads that list when a tab opens", async () => {
    const user = userEvent.setup();
    const { onUrlUpdate } = renderPanel();
    await screen.findByText("one@example.com");
    await user.click(
      await screen.findByRole("tab", { name: "Soft bounces (4)" })
    );
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("list")).toBe(
        "soft"
      )
    );
    expect(await screen.findByText("soft@example.com")).toBeInTheDocument();
  });

  it("does not run the review query for the Suppressed tab, which has the Add button", async () => {
    renderPanel({ list: "suppressed" });
    expect(await screen.findByText("Nothing suppressed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add address" })
    ).toBeInTheDocument();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("asks for the next 25 when Load more is pressed on a window list", async () => {
    const user = userEvent.setup();
    responses.soft = {
      ...(responses.soft as object),
      hasMore: true,
    };
    renderPanel({ list: "soft" });
    await screen.findByText("soft@example.com");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ list: "soft", offset: 25 })
      )
    );
  });

  it("says Recommendations shows only the first 25 when more exist", async () => {
    responses.recommended = {
      ...(responses.recommended as object),
      hasMore: true,
    };
    renderPanel();
    expect(
      await screen.findByText(
        "Showing the first 25. Suppress these to see more."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument();
  });

  it("confirms Suppress all with every loaded row, then refetches", async () => {
    const user = userEvent.setup();
    mockAddSuppression.mockResolvedValue({
      success: true,
      email: "one@example.com",
      alreadyPresent: false,
    });
    renderPanel();
    await screen.findByText("one@example.com");
    const callsBefore = mockList.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Suppress all 2" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Suppress 2 addresses?")
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Suppress all 2" })
    );

    await waitFor(() => expect(mockAddSuppression).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(mockList.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });

  it("gives the Recommendations empty copy and a disabled Suppress all", async () => {
    responses.recommended = {
      success: true,
      list: "recommended",
      rows: [],
      hasMore: false,
      counts: COUNTS,
    };
    renderPanel();
    expect(
      await screen.findByText(
        "Nothing to suppress right now. Addresses that complained, hard bounced, or kept soft bouncing show up here."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suppress all" })).toBeDisabled();
  });

  it("uses each window tab's own empty copy", async () => {
    renderPanel({ list: "complaint" });
    expect(
      await screen.findByText("No complaints in this range.")
    ).toBeInTheDocument();
  });

  it("shows the error with a working Try again", async () => {
    const user = userEvent.setup();
    responses.hard = {
      success: false,
      error: "Could not load addresses. Try again.",
    };
    renderPanel({ list: "hard" });
    expect(
      await screen.findByText("Could not load addresses. Try again.")
    ).toBeInTheDocument();
    const callsBefore = mockList.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(mockList.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });

  it("keeps the address out of the URL when a row opens", async () => {
    const user = userEvent.setup();
    const { onUrlUpdate } = renderPanel();
    await user.click(
      await screen.findByRole("button", { name: "one@example.com" })
    );
    expect(
      await screen.findByText("No problems in stored history")
    ).toBeInTheDocument();
    expect(JSON.stringify(onUrlUpdate.mock.calls)).not.toContain(
      "one@example.com"
    );
  });
});
