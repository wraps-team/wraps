/**
 * Emails table - honest states and instrumentation (audit F1, F6, F10)
 *
 * The unit tests next door pin the state machine. These pin the wiring, which
 * is where the original defect actually lived: `useEmailsData` returned an
 * error, `EmailsTable` destructured only `{ data, isLoading, isFetching }`,
 * and the failure fell through to the empty branch. A green state machine with
 * an unread `isError` would still ship the bug.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailListItem } from "../../types";

const capture = vi.fn();
const push = vi.fn();
const refetch = vi.fn();

vi.mock("posthog-js", () => ({
  default: { capture: (...args: unknown[]) => capture(...args) },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

vi.mock("@/actions/contacts-bulk", () => ({
  bulkCreateContactsFromEmails: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const fetchNextPage = vi.fn();

const queryResult = {
  emails: [] as EmailListItem[],
  feed: null as { hasEverSent: boolean; accounts: [] } | null,
  fetchNextPage,
  hasNextPage: false,
  isError: false,
  isFetching: false,
  isFetchingNextPage: false,
  isLoading: false,
  refetch,
  totalKnown: true,
};

vi.mock("../../hooks/use-emails", () => ({
  useEmailsData: () => queryResult,
  fetchEmailsPage: vi.fn(),
}));

import { EmailsTable } from "../emails-table";

const baseProps = {
  days: 7,
  hasEverSent: false,
  organizationId: "org-1",
  orgSlug: "acme",
  sandboxStatus: null as boolean | null,
};

function resetQuery() {
  queryResult.emails = [];
  queryResult.feed = null;
  queryResult.hasNextPage = false;
  queryResult.isError = false;
  queryResult.isFetching = false;
  queryResult.isFetchingNextPage = false;
  queryResult.isLoading = false;
  queryResult.totalKnown = true;
}

function capturedEvent(name: string) {
  return capture.mock.calls.find((call) => call[0] === name)?.[1];
}

beforeEach(() => {
  resetQuery();
  capture.mockClear();
  push.mockClear();
  refetch.mockClear();
});

afterEach(cleanup);

describe("EmailsTable state rendering", () => {
  it("shows the error state, not 'no emails found', when the fetch fails", () => {
    queryResult.isError = true;

    render(<EmailsTable {...baseProps} />);

    expect(
      screen.getByText(/couldn't load your messages/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/no emails found/i)).toBeNull();
    expect(screen.queryByText(/send your first email/i)).toBeNull();
  });

  it("retries the query from the error state and reports the retry", async () => {
    queryResult.isError = true;

    render(<EmailsTable {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /^retry$/i }));

    expect(refetch).toHaveBeenCalledOnce();
    expect(capturedEvent("emails_error_retried")).toEqual({ surface: "table" });
  });

  it("names the sandbox for a sandboxed org that has never sent", () => {
    render(<EmailsTable {...baseProps} sandboxStatus={true} />);

    expect(screen.getByText(/in the SES sandbox/i)).toBeInTheDocument();
    expect(screen.queryByText(/send your first email/i)).toBeNull();
  });

  it("shows the never-sent state for a production org with no sends", () => {
    render(<EmailsTable {...baseProps} sandboxStatus={false} />);

    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("blames the filter when a status is applied", () => {
    render(<EmailsTable {...baseProps} hasEverSent status="bounced" />);

    expect(
      screen.getByText("No bounced messages in the last 7 days.")
    ).toBeInTheDocument();
  });
});

describe("EmailsTable instrumentation", () => {
  it("reports the resolved state with the active window and filter", () => {
    render(<EmailsTable {...baseProps} sandboxStatus={true} />);

    expect(capturedEvent("emails_list_viewed")).toEqual({
      days: 7,
      has_search: false,
      row_count: 0,
      state: "empty-sandbox",
      status: null,
    });
  });

  it("reports the error state as an error, not as an empty list", () => {
    queryResult.isError = true;

    render(<EmailsTable {...baseProps} />);

    expect(capturedEvent("emails_list_viewed")?.state).toBe("error");
  });

  it("stays silent while the first load is still in flight", () => {
    queryResult.isLoading = true;

    render(<EmailsTable {...baseProps} />);

    expect(capturedEvent("emails_list_viewed")).toBeUndefined();
  });

  it("reports a status filter change with both ends of the transition", async () => {
    render(<EmailsTable {...baseProps} hasEverSent status="bounced" />);

    await userEvent.click(
      screen.getByRole("button", { name: /search the last 30 days/i })
    );

    expect(capturedEvent("emails_filter_changed")).toEqual({
      control: "days",
      from: "7",
      to: "30",
    });
    // Widening must not drop the status filter the user already set.
    expect(push).toHaveBeenCalledWith("/acme/emails?days=30&status=bounced");
  });
});

function emailRow(id: string): EmailListItem {
  return {
    id,
    messageId: id,
    from: "billing@wraps.dev",
    to: ["ada@example.com"],
    subject: `Invoice ${id}`,
    status: "delivered",
    sentAt: Date.now(),
    lastActivityAt: Date.now(),
    eventCount: 2,
    hasOpened: false,
    hasClicked: false,
  };
}

describe("EmailsTable pagination and search ergonomics (F2, F13)", () => {
  it("claims an exact total only once the server says there is no next page", () => {
    queryResult.emails = [emailRow("a"), emailRow("b")];

    render(<EmailsTable {...baseProps} hasEverSent />);

    expect(screen.getByText("Showing 1-2 of 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("never formats a bounded count as a total while more rows exist", () => {
    queryResult.emails = [emailRow("a"), emailRow("b")];
    queryResult.hasNextPage = true;
    queryResult.totalKnown = false;

    render(<EmailsTable {...baseProps} hasEverSent />);

    expect(screen.getByText("Showing 1-2")).toBeInTheDocument();
    expect(screen.queryByText(/of 2/)).toBeNull();
  });

  it("loads the next page from the cursor and reports it as emails_page_next", async () => {
    queryResult.emails = [emailRow("a"), emailRow("b")];
    queryResult.hasNextPage = true;
    queryResult.totalKnown = false;

    render(<EmailsTable {...baseProps} hasEverSent />);
    await userEvent.click(screen.getByRole("button", { name: /load more/i }));

    expect(fetchNextPage).toHaveBeenCalledOnce();
    expect(capturedEvent("emails_page_next")).toEqual({
      has_more: true,
      page_index: 2,
      row_count: 2,
    });
  });

  it("names the searchable window in the placeholder", () => {
    render(<EmailsTable {...baseProps} days={30} hasEverSent />);

    expect(
      screen.getByPlaceholderText("Search the last 30 days")
    ).toBeInTheDocument();
  });

  it("explains what search matches once there is something to match", async () => {
    // The sentence used to sit under the toolbar permanently, describing a
    // control nobody was using.
    render(<EmailsTable {...baseProps} days={30} hasEverSent />);

    expect(
      screen.queryByText(
        "Matches recipient, subject, and sender within the selected range."
      )
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("Search the last 30 days"),
      "ab"
    );

    expect(
      screen.getByText(
        "Matches recipient, subject, and sender within the selected range.",
        { exact: false }
      )
    ).toBeInTheDocument();
  });

  it("binds / to the search box and leaves the browser's find alone", () => {
    render(<EmailsTable {...baseProps} hasEverSent />);

    const findEvent = new KeyboardEvent("keydown", {
      key: "f",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(findEvent);
    expect(findEvent.defaultPrevented).toBe(false);

    const slashEvent = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(slashEvent);
    expect(slashEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByPlaceholderText("Search the last 7 days")
    );
  });
});
