/**
 * The search box must follow the URL when something other than the box itself
 * changes `?search=` (review finding 2).
 *
 * `healthFilterHref` in contact-analytics.tsx deletes `search` on purpose — a
 * health bucket is an organization-wide count and inheriting a search term
 * would land "80 bounced" on a table showing three rows. But `searchInput` is
 * seeded once with `useState(searchParams.get("search") || "")` and the page
 * segment is not remounted on a search-params-only navigation, so the box kept
 * displaying the old term after the click. That is cosmetic right up until the
 * CSV export, which mixed the stale local term with the fresh URL status and
 * handed the operator a file that did not match the list on screen.
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

// Radix's DropdownMenu measures its trigger via @radix-ui/react-use-size,
// which jsdom has no ResizeObserver for.
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

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

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

const exportAllContacts = vi.fn();
vi.mock("@/actions/export", () => ({
  exportAllContacts: (...args: unknown[]) => exportAllContacts(...args),
}));

import { ContactsTable } from "../contacts-table";

function makeContact(
  overrides: Partial<ContactWithMeta> = {}
): ContactWithMeta {
  return {
    id: "contact-1",
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

function renderTable(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrap = (node: ReactElement) => (
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  );
  const result = render(wrap(ui));
  // Re-renders the same component instance, the way Next re-renders the page
  // on a search-params-only navigation. A remount would hide the defect.
  return {
    ...result,
    renderAgain: (node: ReactElement) => result.rerender(wrap(node)),
  };
}

function searchBox() {
  return screen.getByPlaceholderText(/search by email/i) as HTMLInputElement;
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  exportAllContacts.mockReset();
  currentSearchParams = new URLSearchParams();
});

afterEach(cleanup);

describe("search box follows a search-params-only navigation", () => {
  // A health-bucket click is a <Link> to ?emailStatus=bounced&page=1 with
  // `search` deleted. Next keys the page segment without search params, so the
  // component is re-rendered, never remounted - the box has to re-sync itself.
  it("clears the box when the URL drops `search`", async () => {
    currentSearchParams = new URLSearchParams({ search: "ada" });
    const { renderAgain } = renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={2} />
    );

    expect(searchBox()).toHaveValue("ada");

    currentSearchParams = new URLSearchParams({
      emailStatus: "bounced",
      page: "1",
    });
    renderAgain(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={80} />
    );

    await waitFor(() => expect(searchBox()).toHaveValue(""));
  });

  // The defect that made this more than cosmetic: `search` came from local
  // state while `emailStatus` came from the URL, so the operator looking at 80
  // bounced contacts downloaded a one-row CSV of `ada` AND `bounced`.
  it("exports the URL's filters, not a stale local search term", async () => {
    exportAllContacts.mockResolvedValue({
      success: true,
      contacts: [makeContact()],
      total: 80,
      truncated: false,
    });

    currentSearchParams = new URLSearchParams({ search: "ada" });
    const { renderAgain } = renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={2} />
    );

    currentSearchParams = new URLSearchParams({
      emailStatus: "bounced",
      page: "1",
    });
    renderAgain(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={80} />
    );

    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(await screen.findByText(/^export all$/i));

    await waitFor(() => expect(exportAllContacts).toHaveBeenCalled());
    expect(exportAllContacts).toHaveBeenCalledWith("org-1", {
      search: undefined,
      emailStatus: "bounced",
      topicId: undefined,
    });
  });

  // The re-sync must not fight the person typing. Deleting "john" down to "j"
  // clears the committed term from the URL (commit accf1b52) while the box is
  // meant to keep showing "j" under the too-short hint - a re-sync that fired
  // on our own commit would eat the character.
  it("keeps the typed character when our own commit clears the URL term", async () => {
    currentSearchParams = new URLSearchParams({ search: "john", page: "3" });
    const { renderAgain } = renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.clear(searchBox());
    await userEvent.type(searchBox(), "j");

    await waitFor(
      () => {
        expect(replace).toHaveBeenCalledWith("/acme/contacts?page=1", {
          scroll: false,
        });
      },
      { timeout: 2000 }
    );

    // The router mock does not move the URL on its own; do what Next does.
    currentSearchParams = new URLSearchParams({ page: "1" });
    renderAgain(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    expect(searchBox()).toHaveValue("j");
    expect(
      screen.getByText(/type at least 2 characters to search/i)
    ).toBeInTheDocument();
  });
});
