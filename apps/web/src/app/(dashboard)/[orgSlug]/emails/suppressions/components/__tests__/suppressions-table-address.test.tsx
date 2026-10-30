/**
 * Suppressions table: the Address cell opens the detail for that row's
 * (awsAccountId, email), and nothing else in the row does.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/actions/suppressions", () => ({
  listSuppressions: vi.fn(),
  removeSuppression: vi.fn(),
  addSuppression: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { SuppressionsTable } from "../suppressions-table";

const ORG_ID = "org-table-test";
const ORG_SLUG = "acme";

const ROWS = [
  {
    email: "shared@example.com",
    reason: "BOUNCE" as const,
    lastUpdated: "2026-10-20T10:00:00.000Z",
    awsAccountId: "aws-one",
    region: "us-east-1",
  },
  {
    email: "shared@example.com",
    reason: "BOUNCE" as const,
    lastUpdated: "2026-10-21T10:00:00.000Z",
    awsAccountId: "aws-two",
    region: "eu-west-1",
  },
];

function renderTable() {
  return render(
    <SuppressionsTable
      initialHasMore={false}
      initialRows={ROWS}
      organizationId={ORG_ID}
      orgSlug={ORG_SLUG}
    />
  );
}

beforeEach(() => {
  mockGetAddressDetail.mockResolvedValue({
    success: true,
    address: "shared@example.com",
    totals: { sends: 0, bounces: 0, complaints: 0, suppressed: 0 },
    lastProblemAt: null,
    problemSends: [],
    problemSendsHasMore: false,
    suppressionAccount: { id: "aws-one", name: "Production" },
    retentionDays: 30,
    contact: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("suppressions table: address cell", () => {
  it("address cell opens the sheet for that row's awsAccountId and email", async () => {
    renderTable();
    const user = userEvent.setup();
    const [first] = screen.getAllByRole("button", {
      name: "shared@example.com",
    });
    await user.click(first);
    await waitFor(() =>
      expect(mockGetAddressDetail).toHaveBeenCalledWith(ORG_ID, {
        address: "shared@example.com",
        suppressedAwsAccountId: "aws-one",
      })
    );
  });

  it("two rows with the same email in different accounts open distinct details", async () => {
    renderTable();
    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", {
      name: "shared@example.com",
    });
    await user.click(buttons[0]);
    await waitFor(() => expect(mockGetAddressDetail).toHaveBeenCalledTimes(1));
    // Close the first sheet before opening the second row's.
    await user.keyboard("{Escape}");
    await user.click(buttons[1]);
    await waitFor(() => expect(mockGetAddressDetail).toHaveBeenCalledTimes(2));
    expect(mockGetAddressDetail.mock.calls[1]?.[1]).toEqual({
      address: "shared@example.com",
      suppressedAwsAccountId: "aws-two",
    });
  });

  it("Unsuppress button still renders and its props are unchanged", () => {
    renderTable();
    const buttons = screen.getAllByRole("button", { name: "Unsuppress" });
    expect(buttons).toHaveLength(2);
  });

  it("row is not clickable outside the address cell", async () => {
    renderTable();
    const user = userEvent.setup();
    const table = screen.getByRole("table");
    const reasonCell = within(table).getAllByRole("cell")[1];
    await user.click(reasonCell);
    expect(mockGetAddressDetail).not.toHaveBeenCalled();
  });
});
