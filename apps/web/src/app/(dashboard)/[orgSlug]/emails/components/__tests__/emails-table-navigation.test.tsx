/**
 * Emails table - keyboard access, URL state, sort announcement
 * (audit findings F7, F8, F12, F14)
 *
 * Opening a message was an `onClick` on the `<tr>`: no tabIndex, no role, no key
 * handler, and not one cell rendered a link, so there was no keyboard path from
 * the list to a message at all (WCAG 2.1.1, Level A). The search term lived in
 * component state, so a filtered view could not be shared or survive a reload.
 * And the sort direction was conveyed by a select alone, with nothing on the
 * table for assistive tech to read.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailListItem, EmailStatus } from "../../types";

const capture = vi.fn();
const push = vi.fn();
const replace = vi.fn();

vi.mock("posthog-js", () => ({
  default: { capture: (...args: unknown[]) => capture(...args) },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace }),
}));

vi.mock("@/actions/contacts-bulk", () => ({
  bulkCreateContactsFromEmails: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const queryResult = {
  emails: [] as EmailListItem[],
  feed: null,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isError: false,
  isFetching: false,
  isFetchingNextPage: false,
  isLoading: false,
  refetch: vi.fn(),
  totalKnown: true,
};

/** The last input the query hook was called with, to pin what is being fetched. */
let lastQueryInput: { search?: string; sort?: string } | null = null;

vi.mock("../../hooks/use-emails", () => ({
  useEmailsData: (input: { search?: string; sort?: string }) => {
    lastQueryInput = input;
    return queryResult;
  },
  fetchEmailsPage: vi.fn(),
}));

import { EmailsTable } from "../emails-table";

const baseProps = {
  days: 7,
  hasEverSent: true,
  organizationId: "org-1",
  orgSlug: "acme",
  sandboxStatus: false as boolean | null,
};

function emailRow(
  id: string,
  status: EmailStatus = "delivered"
): EmailListItem {
  return {
    id,
    messageId: `ses-${id}`,
    from: "billing@wraps.dev",
    to: ["ada@example.com"],
    subject: `Invoice ${id}`,
    status,
    sentAt: Date.parse("2026-08-18T18:06:00.000Z"),
    lastActivityAt: Date.parse("2026-08-18T18:09:00.000Z"),
    eventCount: 2,
    hasOpened: false,
    hasClicked: false,
  };
}

/**
 * Radix's Select drives itself through Pointer Events, which jsdom does not
 * implement. Without these the listbox never opens and the order control
 * cannot be exercised at all - which is the one control this file is about.
 */
function stubPointerEvents() {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
}

beforeEach(() => {
  stubPointerEvents();
  queryResult.emails = [emailRow("a")];
  capture.mockClear();
  push.mockClear();
  replace.mockClear();
  lastQueryInput = null;
});

afterEach(cleanup);

describe("keyboard access to a message (F7)", () => {
  it("renders the subject as a real link to the message", () => {
    render(<EmailsTable {...baseProps} />);

    expect(screen.getByRole("link", { name: "Invoice a" })).toHaveAttribute(
      "href",
      "/acme/emails/a?days=7"
    );
  });

  it("puts the link in the tab order with a focus ring", async () => {
    render(<EmailsTable {...baseProps} />);
    const link = screen.getByRole("link", { name: "Invoice a" });

    link.focus();

    expect(link).toHaveFocus();
    expect(link.className).toContain("focus-visible:ring");
  });

  it("carries the active filters onto the link so Back can return here", () => {
    render(
      <EmailsTable {...baseProps} days={30} search="invoice" status="bounced" />
    );

    expect(screen.getByRole("link", { name: "Invoice a" })).toHaveAttribute(
      "href",
      "/acme/emails/a?days=30&status=bounced&q=invoice"
    );
  });

  it("reports the open once and does not also navigate through the row", async () => {
    render(<EmailsTable {...baseProps} />);

    await userEvent.click(screen.getByRole("link", { name: "Invoice a" }));

    const opened = capture.mock.calls.filter(
      (call) => call[0] === "emails_row_opened"
    );
    expect(opened).toHaveLength(1);
    expect(opened[0][1]).toEqual({ position: 0, status: "delivered" });
    // The row's own handler would be a second navigation to the same place.
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the row checkbox from opening the message", async () => {
    render(<EmailsTable {...baseProps} />);

    await userEvent.click(
      screen.getByRole("checkbox", { name: /select row/i })
    );

    expect(push).not.toHaveBeenCalled();
    expect(
      capture.mock.calls.filter((call) => call[0] === "emails_row_opened")
    ).toHaveLength(0);
  });
});

describe("search lives in the URL (F8)", () => {
  it("shows the term the URL arrived with", () => {
    render(<EmailsTable {...baseProps} search="invoice" />);

    expect(screen.getByLabelText("Search messages")).toHaveValue("invoice");
  });

  it("commits a typed term to the URL, preserving the other filters", async () => {
    render(<EmailsTable {...baseProps} days={30} status="bounced" />);

    await userEvent.type(screen.getByLabelText("Search messages"), "invoice");

    await waitFor(
      () => {
        expect(replace).toHaveBeenCalledWith(
          "/acme/emails?days=30&status=bounced&q=invoice",
          { scroll: false }
        );
      },
      { timeout: 2000 }
    );
    // Typing must not push one history entry per settled keystroke.
    expect(push).not.toHaveBeenCalled();
  });

  it("filters as soon as typing settles, without waiting on the navigation", async () => {
    render(<EmailsTable {...baseProps} />);

    await userEvent.type(screen.getByLabelText("Search messages"), "invoice");

    // The URL is how the view becomes shareable, not how it becomes filtered:
    // the query must not be gated on the server round trip that `replace`
    // starts, since this page's server render is measured in seconds.
    await waitFor(() => {
      expect(lastQueryInput?.search).toBe("invoice");
    });
  });

  it("does not fire a request for a term the search index cannot serve", async () => {
    render(<EmailsTable {...baseProps} />);

    await userEvent.type(screen.getByLabelText("Search messages"), "ab");

    await waitFor(() => {
      expect(replace).toHaveBeenCalled();
    });
    expect(lastQueryInput?.search).toBeUndefined();
    expect(
      screen.getByText(/type at least 3 characters to search/i)
    ).toBeInTheDocument();
  });

  it("follows the URL when the change came from somewhere else", async () => {
    const view = render(<EmailsTable {...baseProps} search="invoice" />);

    view.rerender(<EmailsTable {...baseProps} search="receipt" />);

    expect(screen.getByLabelText("Search messages")).toHaveValue("receipt");
  });

  it("keeps the term on the URL when another filter changes", async () => {
    // The empty-state's widen control is the one filter change that is a plain
    // button, so it is the one that can be driven here. It shares the URL
    // builder with the time-range and status selects.
    queryResult.emails = [];
    render(
      <EmailsTable {...baseProps} days={7} search="invoice" status="bounced" />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /search the last 30 days/i })
    );

    expect(push).toHaveBeenCalledWith(
      "/acme/emails?days=30&status=bounced&q=invoice"
    );
  });

  it("drops the term from the URL when the filters are cleared", async () => {
    queryResult.emails = [];
    render(<EmailsTable {...baseProps} search="invoice" status="bounced" />);

    await userEvent.click(
      screen.getByRole("button", { name: /clear filters/i })
    );

    expect(push).toHaveBeenCalledWith("/acme/emails?days=7");
  });
});

describe("sort lives in the URL (F8)", () => {
  it("shows the order the URL arrived with", () => {
    render(<EmailsTable {...baseProps} sort="asc" />);

    expect(screen.getByLabelText("Sort by sent date")).toHaveTextContent(
      "Oldest first"
    );
  });

  it("fetches in the order the URL asked for", () => {
    render(<EmailsTable {...baseProps} sort="asc" />);

    expect(lastQueryInput?.sort).toBe("asc");
  });

  it("falls back to newest first for an unrecognised order", () => {
    render(<EmailsTable {...baseProps} sort="sideways" />);

    expect(screen.getByLabelText("Sort by sent date")).toHaveTextContent(
      "Newest first"
    );
    expect(lastQueryInput?.sort).toBe("desc");
  });

  it("commits a chosen order to the URL, preserving the other filters", async () => {
    render(
      <EmailsTable {...baseProps} days={30} search="invoice" status="bounced" />
    );

    await userEvent.click(screen.getByLabelText("Sort by sent date"));
    await userEvent.click(screen.getByRole("option", { name: "Oldest first" }));

    expect(push).toHaveBeenCalledWith(
      "/acme/emails?days=30&status=bounced&q=invoice&sort=asc"
    );
  });

  it("leaves the default order out of the URL", async () => {
    render(<EmailsTable {...baseProps} sort="asc" />);

    await userEvent.click(screen.getByLabelText("Sort by sent date"));
    await userEvent.click(screen.getByRole("option", { name: "Newest first" }));

    // A shared link should not carry a parameter that says "the default".
    expect(push).toHaveBeenCalledWith("/acme/emails?days=7");
  });

  it("keeps the order on the URL when another filter changes", async () => {
    queryResult.emails = [];
    render(<EmailsTable {...baseProps} sort="asc" status="bounced" />);

    await userEvent.click(
      screen.getByRole("button", { name: /search the last 30 days/i })
    );

    expect(push).toHaveBeenCalledWith(
      "/acme/emails?days=30&status=bounced&sort=asc"
    );
  });

  it("carries the order onto the row link so Back preserves it", () => {
    render(<EmailsTable {...baseProps} sort="asc" />);

    expect(screen.getByRole("link", { name: "Invoice a" })).toHaveAttribute(
      "href",
      "/acme/emails/a?days=7&sort=asc"
    );
  });
});

describe("sort state and status rendering (F12, F14)", () => {
  it("exposes the order through a labelled control, not through aria-sort", () => {
    render(<EmailsTable {...baseProps} />);

    // Order is server-driven on sent_at and chosen in the toolbar, so no column
    // header is sortable - and a header claiming a sort state it does not own
    // would announce a control that does not exist.
    const sort = screen.getByLabelText("Sort by sent date");
    expect(sort).toHaveTextContent("Newest first");
    expect(sort).toHaveAttribute("role", "combobox");
    expect(sort).toHaveAttribute("aria-expanded", "false");
    for (const header of screen.getAllByRole("columnheader")) {
      expect(header).not.toHaveAttribute("aria-sort");
    }
  });

  it("renders an unrecognised status as a neutral badge instead of blanking the table", () => {
    queryResult.emails = [
      emailRow("a", "quarantined" as EmailStatus),
      emailRow("b"),
    ];

    render(<EmailsTable {...baseProps} />);

    expect(screen.getByText("Quarantined")).toBeInTheDocument();
    // The old lookup returned undefined for the icon and took the whole table
    // down with it, so the surviving row is the assertion that matters.
    expect(screen.getByRole("link", { name: "Invoice b" })).toBeInTheDocument();
  });

  it("humanizes the raw enums SES produces", () => {
    queryResult.emails = [emailRow("a", "rendering_failure")];

    render(<EmailsTable {...baseProps} />);

    expect(screen.getByText("Rendering failure")).toBeInTheDocument();
    expect(screen.queryByText(/rendering_failure/)).toBeNull();
  });

  it("states the exact time alongside the relative one", () => {
    render(<EmailsTable {...baseProps} />);

    // The subject cell's send date and the Activity column: incident work needs
    // the exact time, and the list used to make you open the message to get it
    // (audit F15).
    const absolutes = screen.getAllByText(/Aug 18, 2026/);
    expect(absolutes).toHaveLength(2);
    for (const absolute of absolutes) {
      const element = absolute.closest("time");
      expect(element).toHaveAttribute("title");
      expect(element?.getAttribute("title")).toContain("Aug 18, 2026");
      expect(element).toHaveAttribute("dateTime");
    }
  });
});
