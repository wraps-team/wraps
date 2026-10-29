/**
 * Suppressed tab: the banners and the all-denied state come from the standalone
 * page, the Add button is empty-state safe, sits right of the search box, and
 * refetches after an add or a removal.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockListSuppressions = vi.fn();
const mockAddSuppression = vi.fn();
vi.mock("@/actions/suppressions", () => ({
  listSuppressions: (...args: unknown[]) => mockListSuppressions(...args),
  removeSuppression: vi.fn(),
  addSuppression: (...args: unknown[]) => mockAddSuppression(...args),
}));

vi.mock("@/actions/address-detail", () => ({
  getAddressDetail: vi.fn(async () => ({
    success: true,
    address: "shared@example.com",
    totals: { sends: 0, bounces: 0, complaints: 0, suppressed: 0 },
    lastProblemAt: null,
    problemSends: [],
    problemSendsHasMore: false,
    suppressionAccount: null,
    retentionDays: 30,
    contact: null,
  })),
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

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { SuppressedTab } from "../suppressed-tab";

const ORG_ID = "org-suppressed-tab";
const ORG_SLUG = "acme";
const ONE = [{ id: "aws-1", name: "Production", region: "us-east-1" }];
const TWO = [...ONE, { id: "aws-2", name: "Staging", region: "eu-west-1" }];

const ENTRY = {
  email: "shared@example.com",
  reason: "BOUNCE" as const,
  lastUpdated: "2026-10-20T10:00:00.000Z",
  awsAccountId: "aws-1",
  region: "us-east-1",
};

function page(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    page: {
      entries: [ENTRY],
      hasMore: false,
      nextToken: undefined,
      deniedAccountIds: [],
      unreachableAccountIds: [],
      ...overrides,
    },
  };
}

function renderTab(accounts = ONE) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SuppressedTab
        accounts={accounts}
        organizationId={ORG_ID}
        orgSlug={ORG_SLUG}
        refreshKey={0}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockListSuppressions.mockResolvedValue(page());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SuppressedTab", () => {
  it("shows the permissions state when every account is denied", async () => {
    mockListSuppressions.mockResolvedValue(
      page({ deniedAccountIds: ["aws-1"], entries: [] })
    );
    renderTab();
    expect(
      await screen.findByText("Wraps needs updated permissions")
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing suppressed")).not.toBeInTheDocument();
  });

  it("shows the denied banner beside the table when only some accounts are denied", async () => {
    mockListSuppressions.mockResolvedValue(
      page({ deniedAccountIds: ["aws-2"] })
    );
    renderTab(TWO);
    expect(
      await screen.findByText(/need their console role permissions refreshed/)
    ).toBeInTheDocument();
    expect(screen.getByText("shared@example.com")).toBeInTheDocument();
  });

  it("shows Nothing suppressed with the Add button still available", async () => {
    mockListSuppressions.mockResolvedValue(page({ entries: [] }));
    renderTab();
    expect(await screen.findByText("Nothing suppressed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add address" })
    ).toBeInTheDocument();
  });

  it("puts the Add button to the right of the search box", async () => {
    renderTab();
    const search = await screen.findByPlaceholderText(
      "Search suppressed addresses"
    );
    const add = screen.getByRole("button", { name: "Add address" });
    expect(
      search.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("reads the list again after an add", async () => {
    const user = userEvent.setup();
    mockListSuppressions.mockResolvedValue(page({ entries: [] }));
    mockAddSuppression.mockResolvedValue({
      success: true,
      email: "new@example.com",
      alreadyPresent: false,
    });
    renderTab();
    await screen.findByText("Nothing suppressed");
    const callsBefore = mockListSuppressions.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Add address" }));
    await user.type(screen.getByLabelText("Email address"), "new@example.com");
    await user.click(
      screen.getByRole("button", { name: "Add to suppression list" })
    );

    await waitFor(() => expect(mockAddSuppression).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockListSuppressions.mock.calls.length).toBeGreaterThan(
        callsBefore
      )
    );
  });
});
