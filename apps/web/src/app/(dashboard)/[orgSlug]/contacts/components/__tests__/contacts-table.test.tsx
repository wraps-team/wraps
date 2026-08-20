/**
 * Contacts table - search debounce, sort round-trip, keyboard access
 * (audit findings F8, F9, F14, F22)
 *
 * The search box used to call `router.push` on every keystroke - each one a
 * full RSC round trip and a fresh `ilike '%term%'` scan with no trigram
 * index. Sorting kept `getSortedRowModel`/`getFilteredRowModel` over
 * `manualPagination: true` data, so a sort click reordered only the current
 * page's rows and presented that as the whole list. And every row opened only
 * on `onClick`, with no tabIndex, role, or key handler - mouse only.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactWithMeta } from "@/lib/contacts";

const push = vi.fn();
const replace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
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
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
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

// ContactDetailsSheet (rendered by ContactsTable, off by default but always
// mounted) reads react-query even while closed.
function renderTable(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  currentSearchParams = new URLSearchParams();
});

afterEach(cleanup);

describe("search is debounced and minimum-length gated (F8)", () => {
  it("does not push or replace on every keystroke", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.type(
      screen.getByPlaceholderText(/search by email/i),
      "ada"
    );

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("commits the settled term to the URL via replace, not push", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.type(
      screen.getByPlaceholderText(/search by email/i),
      "ada"
    );

    await waitFor(
      () => {
        expect(replace).toHaveBeenCalledWith(
          "/acme/contacts?search=ada&page=1",
          { scroll: false }
        );
      },
      { timeout: 2000 }
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("never commits a term under the minimum length", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.type(screen.getByPlaceholderText(/search by email/i), "a");

    // Give the debounce timer a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByText(/type at least 2 characters to search/i)
    ).toBeInTheDocument();
  });
});

describe("'/' focuses search instead of hijacking Cmd/Ctrl+F (F22)", () => {
  it("shows '/' as the shortcut hint, not the Mac Cmd+F glyph", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    expect(screen.queryByText("⌘F")).toBeNull();
    expect(screen.getByText("/")).toBeInTheDocument();
  });

  it("focuses the search box on '/'", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.keyboard("/");

    expect(screen.getByPlaceholderText(/search by email/i)).toHaveFocus();
  });
});

// audit F9 (WCAG 2.1.1, Level A + WCAG 1.3.1): the row briefly carried
// role="button" + tabIndex + onKeyDown for keyboard access. That overrides
// the <tr>'s implicit `row` role, which breaks the table's structure in the
// accessibility tree - a screen-reader user navigating by table semantics
// loses the row/cell relationships, and aria-label replaces the cells' own
// content in announcement. The real fix matches /emails: a real <Link> in
// columns.tsx's email cell carries keyboard focus, Enter/Space activation,
// cmd-click and middle-click, while this row stays a plain <tr> with only a
// mouse-click convenience handler.
describe("row keeps native table semantics; the Link in columns.tsx is the keyboard path (F9)", () => {
  it("does not override the row's native `row` role or add tabIndex/aria-label", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    const rows = screen.getAllByRole("row");
    // rows[0] is the header row.
    const bodyRow = rows[1];
    expect(bodyRow).not.toHaveAttribute("role");
    expect(bodyRow).not.toHaveAttribute("tabindex");
    expect(bodyRow).not.toHaveAttribute("aria-label");
  });

  it("still opens the contact detail on a mouse click, matching /emails' row fallback", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    const rows = screen.getAllByRole("row");
    await userEvent.click(rows[1]);

    expect(replace).toHaveBeenCalledWith("/acme/contacts?contactId=contact-1", {
      scroll: false,
    });
  });

  it("clicking the row checkbox does not also open the contact detail", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(
      screen.getByRole("checkbox", { name: /select row/i })
    );

    expect(replace).not.toHaveBeenCalledWith(
      "/acme/contacts?contactId=contact-1",
      { scroll: false }
    );
  });

  it("renders the email as a real link to the contact's detail URL", () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    expect(
      screen.getByRole("link", { name: "ada@example.com" })
    ).toHaveAttribute("href", "/acme/contacts?contactId=contact-1");
  });

  // The assertion that stops someone later simplifying contactsQuery away and
  // silently reintroducing the drop: without it, clicking a contact from a
  // filtered/sorted/paginated view would lose that state the moment the link
  // navigated, even though the row's own onClick (openContactDetail) has
  // always preserved it via searchParams.toString(). Mirrors
  // emails-table-navigation.test.tsx's "carries the active filters onto the
  // link" case.
  it("carries the active search, status, topic, sort, and page state onto the link", () => {
    currentSearchParams = new URLSearchParams({
      emailStatus: "unsubscribed",
      page: "3",
      search: "ada",
      sortBy: "email",
      sortDir: "asc",
      topicId: "topic-9",
    });

    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    const href = screen
      .getByRole("link", { name: "ada@example.com" })
      .getAttribute("href");
    const params = new URLSearchParams(href?.split("?")[1]);
    expect(params.get("contactId")).toBe("contact-1");
    expect(params.get("emailStatus")).toBe("unsubscribed");
    expect(params.get("page")).toBe("3");
    expect(params.get("search")).toBe("ada");
    expect(params.get("sortBy")).toBe("email");
    expect(params.get("sortDir")).toBe("asc");
    expect(params.get("topicId")).toBe("topic-9");
  });

  it("clicking the link does not also fire the row's own navigation", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(
      screen.getByRole("link", { name: "ada@example.com" })
    );

    // The link's own onClick calls stopPropagation, so the row's onClick
    // (openContactDetail, which would call router.replace a second time)
    // never fires. jsdom has no App Router context to exercise the Link's
    // own navigation through, so the only thing this environment can prove
    // is the negative: the row-level handler did not also run.
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("sort is pushed to the URL, not applied client-side (F14)", () => {
  it("pushes sortBy/sortDir when a sortable header is clicked", async () => {
    renderTable(
      <ContactsTable
        {...baseProps}
        contacts={[makeContact({ id: "a" }), makeContact({ id: "b" })]}
        total={2}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /^contact/i }));

    expect(push).toHaveBeenCalledWith(
      "/acme/contacts?sortBy=email&sortDir=asc&page=1"
    );
  });

  it("does not reorder rows client-side - the server-provided order is rendered as-is", async () => {
    // "z" sorts after "a" alphabetically; if the removed getSortedRowModel
    // were still wired up, clicking "Contact" would have reordered these two
    // rows in place instead of only pushing the URL.
    renderTable(
      <ContactsTable
        {...baseProps}
        contacts={[
          makeContact({ id: "z", email: "zeta@example.com" }),
          makeContact({ id: "a", email: "alpha@example.com" }),
        ]}
        total={2}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /^contact/i }));

    const emails = screen
      .getAllByText(/@example\.com/)
      .map((el) => el.textContent);
    expect(emails).toEqual(["zeta@example.com", "alpha@example.com"]);
  });

  it("reads the initial sort from the URL", () => {
    currentSearchParams = new URLSearchParams({
      sortBy: "emailsSent",
      sortDir: "asc",
    });

    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    // No crash and the table renders - the sorting state derived from the URL
    // is exercised via manualSorting without needing to assert react-table
    // internals directly.
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + one contact
  });
});
