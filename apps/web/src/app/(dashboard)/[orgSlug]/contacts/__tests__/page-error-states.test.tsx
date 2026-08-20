/**
 * Contacts page — error vs. empty (audit finding F6) and page identity (F19)
 *
 * `page.tsx` used to collapse a failed `listContacts` into `total = 0` and
 * fall through to the full-page onboarding empty state - "No contacts yet -
 * add contacts manually, import a CSV..." - on an org that may hold
 * thousands of contacts. These tests pin the replacement behavior: a failed
 * fetch renders a distinct, named error state (and a permission failure
 * reads differently from a generic one), while a genuinely empty org still
 * gets the onboarding state unchanged. Every state also carries the page's
 * `<h1>`, which this page did not have at all before this fix.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORG_SLUG = "acme";
const ORG_ID = "org-1";
const USER_ID = "user-1";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`redirect called with ${path}`);
});

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: USER_ID, email: "dev@acme.test", name: "Dev" },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async () => ({
    id: ORG_ID,
    slug: ORG_SLUG,
    name: "Acme",
    userRole: "owner" as const,
  })),
}));

vi.mock("@/lib/plan-limits", () => ({
  checkFeatureAccess: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@/actions/shared/org-action", () => ({
  UNAUTHORIZED: "You don't have access to this organization",
}));

const listContactsMock = vi.fn();
vi.mock("@/actions/contacts", () => ({
  listContacts: (...args: unknown[]) => listContactsMock(...args),
}));

const listTopicsMock = vi.fn();
vi.mock("@/actions/topics", () => ({
  listTopics: (...args: unknown[]) => listTopicsMock(...args),
}));

// The table, analytics card, and empty state are owned elsewhere and under
// active edit; this suite only needs to know which one page.tsx picked.
vi.mock("../components/contact-analytics", () => ({
  ContactAnalytics: () => <div data-testid="contact-analytics" />,
}));
vi.mock("../components/contacts-empty-state", () => ({
  ContactsEmptyState: () => <div data-testid="contacts-empty-state" />,
}));
vi.mock("../components/contacts-table", () => ({
  ContactsTable: () => <div data-testid="contacts-table" />,
}));

async function renderContactsPage(searchParams: Record<string, string> = {}) {
  const { default: ContactsPage } = await import("../page");
  const element = await ContactsPage({
    params: Promise.resolve({ orgSlug: ORG_SLUG }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(element as React.ReactElement);
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  listTopicsMock.mockResolvedValue({ success: true, topics: [] });
});

describe("Contacts page — page identity", () => {
  it("renders an <h1> on the populated path", async () => {
    listContactsMock.mockResolvedValue({
      success: true,
      contacts: [],
      total: 5,
      page: 1,
      pageSize: 50,
    });

    await renderContactsPage({ search: "jane" });

    expect(
      screen.getByRole("heading", { level: 1, name: "Contacts" })
    ).toBeInTheDocument();
  });

  it("renders the same <h1> on the error path", async () => {
    listContactsMock.mockResolvedValue({
      success: false,
      error: "Failed to fetch contacts",
    });

    await renderContactsPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Contacts" })
    ).toBeInTheDocument();
  });

  it("renders the same <h1> on the never-created empty path", async () => {
    listContactsMock.mockResolvedValue({
      success: true,
      contacts: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    await renderContactsPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Contacts" })
    ).toBeInTheDocument();
  });
});

describe('Contacts page — a failed fetch is not "no contacts yet"', () => {
  it("never renders the onboarding empty state when listContacts fails", async () => {
    listContactsMock.mockResolvedValue({
      success: false,
      error: "Failed to fetch contacts",
    });

    await renderContactsPage();

    expect(
      screen.queryByTestId("contacts-empty-state")
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no contacts yet/i)).not.toBeInTheDocument();
  });

  it("names the failure and offers a retry for a generic error", async () => {
    listContactsMock.mockResolvedValue({
      success: false,
      error: "Failed to fetch contacts",
    });

    await renderContactsPage();

    expect(
      screen.getByText(/we couldn't load your contacts/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/you don't have access to contacts/i)
    ).not.toBeInTheDocument();
    const retry = screen.getByRole("link", { name: /try again/i });
    expect(retry).toHaveAttribute("href", `/${ORG_SLUG}/contacts`);
  });

  it("renders a distinct message for an unauthorized failure, with no retry", async () => {
    listContactsMock.mockResolvedValue({
      success: false,
      error: "You don't have access to this organization",
    });

    await renderContactsPage();

    expect(
      screen.getByText(/you don't have access to contacts/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /try again/i })
    ).not.toBeInTheDocument();
  });

  it("still shows the onboarding empty state for a genuinely empty org", async () => {
    listContactsMock.mockResolvedValue({
      success: true,
      contacts: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    await renderContactsPage();

    expect(screen.getByTestId("contacts-empty-state")).toBeInTheDocument();
  });

  it("still shows the table when a filter matches nothing, not the error state", async () => {
    listContactsMock.mockResolvedValue({
      success: true,
      contacts: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    await renderContactsPage({ search: "nobody" });

    expect(screen.getByTestId("contacts-table")).toBeInTheDocument();
    expect(
      screen.queryByTestId("contacts-empty-state")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/we couldn't load your contacts/i)
    ).not.toBeInTheDocument();
  });
});

describe("Contacts page — the emailStatus param", () => {
  it("drops an unknown emailStatus rather than filtering on it", async () => {
    listContactsMock.mockResolvedValue({
      success: true,
      contacts: [],
      total: 5,
      page: 1,
      pageSize: 50,
    });

    await renderContactsPage({ emailStatus: "noEmailStatus" });

    expect(listContactsMock.mock.calls[0][1].emailStatus).toBeUndefined();
  });

  it("passes a known emailStatus through unchanged", async () => {
    listContactsMock.mockResolvedValue({
      success: true,
      contacts: [],
      total: 5,
      page: 1,
      pageSize: 50,
    });

    await renderContactsPage({ emailStatus: "bounced" });

    expect(listContactsMock.mock.calls[0][1].emailStatus).toBe("bounced");
  });

  it("shows a never-created org the onboarding state, not a filtered dead end", async () => {
    listContactsMock.mockResolvedValue({
      success: true,
      contacts: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    await renderContactsPage({ emailStatus: "noEmailStatus" });

    expect(screen.getByTestId("contacts-empty-state")).toBeInTheDocument();
  });

  it("shows the table, not onboarding, when a known emailStatus matches nothing", async () => {
    listContactsMock.mockResolvedValue({
      success: true,
      contacts: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    await renderContactsPage({ emailStatus: "bounced" });

    // The other half of the test above: `hasFilters` has to count a *valid*
    // emailStatus, or an org filtered to a bucket it has none of gets the
    // full-page "import a CSV" onboarding screen instead of an empty table.
    expect(screen.getByTestId("contacts-table")).toBeInTheDocument();
    expect(
      screen.queryByTestId("contacts-empty-state")
    ).not.toBeInTheDocument();
  });
});
