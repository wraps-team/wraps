/**
 * Contacts table - accessible names, sort state, target size, and the
 * pagination range (audit findings H3, H4, H6, H8, M11, L1)
 *
 * The page shipped 50 focusable copy buttons with no accessible name that were
 * invisible while focused, 51 checkboxes at 16 x 16px, three sortable headers
 * that rendered the same glyph in all three states with no `aria-sort`
 * anywhere, a search box named only by a placeholder that also carried the
 * minimum-length rule, and a footer that read the same sentence on every page.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTACTS_TABLE_HEADING_ID,
  type ContactWithMeta,
} from "@/lib/contacts";

const push = vi.fn();
const replace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
  useSearchParams: () => currentSearchParams,
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => toastError(...args),
    warning: vi.fn(),
  },
}));

vi.mock("@/actions/contacts", () => ({
  createContact: vi.fn(),
  deleteContact: vi.fn(),
  updateContact: vi.fn(),
}));
vi.mock("@/actions/contacts-bulk", () => ({
  bulkDeleteContacts: vi.fn(),
}));
vi.mock("@/actions/contacts-topics", () => ({
  bulkSubscribeContactsToTopics: vi.fn(),
  bulkUnsubscribeContactsFromTopics: vi.fn(),
  subscribeContactToTopics: vi.fn(),
  unsubscribeContactFromTopics: vi.fn(),
}));
vi.mock("@/actions/export", () => ({
  exportAllContacts: vi.fn(),
}));

import { ContactsTable } from "../contacts-table";

function makeContact(
  overrides: Partial<ContactWithMeta> = {}
): ContactWithMeta {
  return {
    id: overrides.id ?? "contact-1",
    email: "ada@example.com",
    emailStatus: "active",
    emailVerifiedAt: null,
    emailUnsubscribedAt: null,
    emailBouncedAt: null,
    emailComplainedAt: null,
    emailSuppressedAt: null,
    lastEmailSentAt: null,
    lastEmailOpenedAt: null,
    lastEmailClickedAt: null,
    emailsSent: 5,
    emailsOpened: 1,
    emailsClicked: 0,
    phone: null,
    smsStatus: null,
    smsConsentedAt: null,
    smsOptedOutAt: null,
    smsInvalidAt: null,
    lastSmsSentAt: null,
    lastSmsClickedAt: null,
    smsSent: 0,
    smsClicked: 0,
    firstName: "Ada",
    lastName: "Lovelace",
    company: null,
    jobTitle: null,
    preferredChannel: null,
    properties: {},
    lastActivityAt: null,
    createdAt: new Date("2026-08-01T15:00:00.000Z"),
    updatedAt: new Date("2026-08-01T15:00:00.000Z"),
    createdBy: null,
    topics: [],
    status: "active",
    confirmedAt: null,
    unsubscribedAt: null,
    bouncedAt: null,
    complainedAt: null,
    ...overrides,
  } as ContactWithMeta;
}

const baseProps = {
  orgSlug: "acme",
  organizationId: "org-1",
  page: 1,
  pageSize: 50,
  proFeaturesEnabled: true,
  topics: [],
  userRole: "owner",
};

function renderTable(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

function mockClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  toastError.mockClear();
  currentSearchParams = new URLSearchParams();
});

afterEach(cleanup);

describe("sortable headers state the order they are in (H6)", () => {
  it("marks the default createdAt-desc column descending and the other sortable ones none", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    expect(
      screen.getByRole("columnheader", { name: /created/i })
    ).toHaveAttribute("aria-sort", "descending");
    expect(
      screen.getByRole("columnheader", { name: /contact/i })
    ).toHaveAttribute("aria-sort", "none");
    expect(
      screen.getByRole("columnheader", { name: /^emails$/i })
    ).toHaveAttribute("aria-sort", "none");
  });

  it("moves the state onto whichever column the URL sorts by, in that direction", () => {
    currentSearchParams = new URLSearchParams({
      sortBy: "email",
      sortDir: "asc",
    });

    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    expect(
      screen.getByRole("columnheader", { name: /contact/i })
    ).toHaveAttribute("aria-sort", "ascending");
    // The default no longer applies once the URL names a column.
    expect(
      screen.getByRole("columnheader", { name: /created/i })
    ).toHaveAttribute("aria-sort", "none");
  });

  it("reports descending for a descending URL sort", () => {
    currentSearchParams = new URLSearchParams({
      sortBy: "emailsSent",
      sortDir: "desc",
    });

    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    expect(
      screen.getByRole("columnheader", { name: /^emails$/i })
    ).toHaveAttribute("aria-sort", "descending");
  });

  it("leaves non-sortable headers unannotated rather than claiming they are unsorted", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    expect(
      screen.getByRole("columnheader", { name: /topics/i })
    ).not.toHaveAttribute("aria-sort");
  });
});

describe("search box is named and keeps its instruction (H8)", () => {
  it("has an accessible name that is not the placeholder", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    const box = screen.getByRole("textbox", {
      name: /search contacts by email address/i,
    });
    // The placeholder is no longer carrying the name - it can be dropped
    // without the field losing it.
    expect(box).toHaveAttribute("placeholder", "Search by email");
  });

  it("keeps the minimum-length instruction visible and associated once typing starts", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    const box = screen.getByRole("textbox", {
      name: /search contacts by email address/i,
    });
    const hintId = box.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId as string)).toHaveTextContent(
      "Type at least 2 characters to search."
    );

    await userEvent.type(box, "ada");

    // The old placeholder-only instruction was gone by this point.
    expect(document.getElementById(hintId as string)).toHaveTextContent(
      "Type at least 2 characters to search."
    );
  });
});

describe("copy button is named, visible on focus, and reports failure (H3, L4)", () => {
  it("names the button after the address it copies", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    expect(
      screen.getByRole("button", { name: "Copy ada@example.com" })
    ).toBeInTheDocument();
  });

  it("reveals itself on keyboard focus, not on hover alone", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    const copy = screen.getByRole("button", { name: "Copy ada@example.com" });
    // jsdom cannot resolve :focus-visible against a class, so assert the rule
    // that lifts opacity is present alongside the hover one it used to be
    // alone.
    expect(copy.className).toContain("opacity-0");
    expect(copy.className).toContain("focus-visible:opacity-100");
  });

  it("announces the copy through a live region rather than the icon alone", async () => {
    mockClipboard(() => Promise.resolve());
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Copy ada@example.com" })
    );

    await waitFor(() => {
      const status = document.querySelector(
        '[data-slot="copy-button-status"]'
      ) as HTMLElement;
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(status).toHaveTextContent("Copied");
    });
  });

  it("surfaces a clipboard failure instead of logging it to the console", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockClipboard(() => Promise.reject(new Error("denied")));
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Copy ada@example.com" })
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't copy to clipboard",
        expect.objectContaining({ description: expect.any(String) })
      );
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("checkboxes carry a 24px hit area over their 16px box (H4)", () => {
  it("expands both the select-all and the row checkbox without resizing them", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    for (const name of [/select all/i, /select row/i]) {
      const box = screen.getByRole("checkbox", { name });
      // The visual box stays 16px (size-4 from the primitive); the overlay is
      // what reaches 24px.
      expect(box.className).toContain("size-4");
      expect(box.className).toContain("before:absolute");
      expect(box.className).toContain("before:-inset-1");
    }
  });
});

describe("pagination says where in the list you are (M11)", () => {
  it("reports the page's own range, not the page size, and groups the total", () => {
    renderTable(
      <ContactsTable
        {...baseProps}
        contacts={[makeContact({ id: "a" }), makeContact({ id: "b" })]}
        page={2}
        total={1993}
      />
    );

    expect(screen.getByText("Showing 51-52 of 1,993 contacts")).toBeVisible();
  });

  it("reads differently on page 1 than on page 2 of the same list", () => {
    const contacts = [makeContact({ id: "a" }), makeContact({ id: "b" })];
    const { unmount } = renderTable(
      <ContactsTable {...baseProps} contacts={contacts} page={1} total={1993} />
    );
    expect(screen.getByText("Showing 1-2 of 1,993 contacts")).toBeVisible();
    unmount();

    renderTable(
      <ContactsTable {...baseProps} contacts={contacts} page={3} total={1993} />
    );
    expect(screen.getByText("Showing 101-102 of 1,993 contacts")).toBeVisible();
  });

  it("does not claim a range when the page is empty", () => {
    renderTable(<ContactsTable {...baseProps} contacts={[]} total={0} />);

    expect(screen.getByText("Showing 0 of 0 contacts")).toBeVisible();
  });
});

describe("created date is formatted explicitly (L1)", () => {
  it("renders a machine-readable <time> in an unambiguous month-name format", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    const time = document.querySelector("time") as HTMLElement;
    expect(time).toHaveAttribute("datetime", "2026-08-01T15:00:00.000Z");
    // The bare `toLocaleDateString()` this replaced produced "8/1/2026" on the
    // server and whatever the visitor's locale wanted on the client.
    expect(time.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });
});

describe("the status filter refuses a URL value it cannot serve", () => {
  it("reads All Statuses for an emailStatus no option matches", () => {
    currentSearchParams = new URLSearchParams({ emailStatus: "noEmailStatus" });

    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    // Two comboboxes render: this one and the page-size select in the footer,
    // which is the only one of the two with an accessible name of its own.
    const statusFilter = screen
      .getAllByRole("combobox")
      .find((element) => element.id !== "page-size");

    expect(statusFilter).toHaveTextContent("All Statuses");
  });

  it("reads the matching option for an emailStatus it can serve", () => {
    currentSearchParams = new URLSearchParams({ emailStatus: "bounced" });

    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    // The other half of the test above: dropping every value, not just the
    // unservable ones, would leave the control reading "All Statuses" while
    // the URL says `?emailStatus=bounced` — and "Export all" would silently
    // export the unfiltered list.
    const statusFilter = screen
      .getAllByRole("combobox")
      .find((element) => element.id !== "page-size");

    expect(statusFilter).toHaveTextContent("Bounced");
  });
});

describe("the table offers a focus anchor for the card's filter links", () => {
  it("renders a Contacts list heading that takes focus programmatically without joining the tab order", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    const anchor = screen.getByRole("heading", { name: "Contacts list" });

    // -1 is the whole contract: `.focus()` works, Tab never lands here. A
    // heading that is only there for a cross-component focus move must not
    // add a stop to the keyboard path through the page.
    expect(anchor).toHaveAttribute("tabindex", "-1");

    anchor.focus();
    expect(anchor).toHaveFocus();
  });

  it("carries the id the analytics card's health-bucket links navigate to", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    // The shared constant is the seam between two components that must not
    // import each other; asserting the literal here would let one side drift.
    expect(
      screen.getByRole("heading", { name: "Contacts list" })
    ).toHaveAttribute("id", CONTACTS_TABLE_HEADING_ID);
  });
});
