/**
 * Contacts table instrumentation (audit finding F16).
 *
 * `posthog.capture` appeared zero times across the contacts tree before this
 * pass. These assert the capture calls this wave added actually fire - a
 * capture call that never runs is worse than none, because it reads as
 * measured. `contact_created` is deliberately not asserted here: it is
 * already emitted server-side (`trackContactCreated` in
 * lib/activation-tracking.ts) and this file never re-captures it.
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
import type { TopicWithMeta } from "@/lib/topics";

// Radix's Select/DropdownMenu content measures its trigger via
// @radix-ui/react-use-size, which jsdom has no ResizeObserver for. Matches
// emails-table's test setup.
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

const capture = vi.fn();
vi.mock("posthog-js", () => ({
  default: { capture: (...args: unknown[]) => capture(...args) },
}));

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const deleteContact = vi.fn();
vi.mock("@/actions/contacts", () => ({
  createContact: vi.fn(),
  deleteContact: (...args: unknown[]) => deleteContact(...args),
  updateContact: vi.fn(),
}));

const bulkDeleteContacts = vi.fn();
vi.mock("@/actions/contacts-bulk", () => ({
  bulkDeleteContacts: (...args: unknown[]) => bulkDeleteContacts(...args),
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

const topic: TopicWithMeta = {
  id: "topic-1",
  name: "Newsletter",
  description: null,
} as TopicWithMeta;

const baseProps = {
  orgSlug: "acme",
  organizationId: "org-1",
  page: 1,
  pageSize: 50,
  proFeaturesEnabled: true,
  topics: [] as TopicWithMeta[],
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

// jsdom has no Pointer Events implementation; Radix Select's trigger calls
// these during open/close. Matches emails-table-navigation.test.tsx's stub.
function stubPointerEvents() {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
}

beforeEach(() => {
  stubPointerEvents();
  capture.mockClear();
  push.mockClear();
  replace.mockClear();
  refresh.mockClear();
  deleteContact.mockReset();
  bulkDeleteContacts.mockReset();
  exportAllContacts.mockReset();
  currentSearchParams = new URLSearchParams();
});

afterEach(cleanup);

describe("filter changed", () => {
  it("captures the email-status control with from/to on change", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    // Neither Select trigger carries an aria-label, so its accessible name
    // is empty (a combobox's name is not computed from its displayed value)
    // - index into DOM order instead. Status is always first.
    await userEvent.click(screen.getAllByRole("combobox")[0]);
    await userEvent.click(await screen.findByText("Unsubscribed"));

    expect(capture).toHaveBeenCalledWith("contacts_filter_changed", {
      control: "email_status",
      from: "all",
      to: "unsubscribed",
    });
  });

  it("captures the topic control with from/to on change", async () => {
    renderTable(
      <ContactsTable
        {...baseProps}
        contacts={[makeContact()]}
        topics={[topic]}
        total={1}
      />
    );

    // Topic is the second combobox when topics.length > 0.
    await userEvent.click(screen.getAllByRole("combobox")[1]);
    await userEvent.click(await screen.findByText("Newsletter"));

    expect(capture).toHaveBeenCalledWith("contacts_filter_changed", {
      control: "topic",
      from: "all",
      to: "topic-1",
    });
  });
});

describe("delete", () => {
  it("captures contact_deleted only after a successful delete, never contact PII", async () => {
    deleteContact.mockResolvedValue({ success: true });

    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/delete/i));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contact_deleted");
    });
    for (const call of capture.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("ada@example.com");
    }
  });

  it("does not capture contact_deleted when the action fails", async () => {
    deleteContact.mockResolvedValue({ success: false, error: "nope" });

    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/delete/i));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(deleteContact).toHaveBeenCalled());
    expect(capture).not.toHaveBeenCalledWith("contact_deleted");
  });
});

describe("bulk delete", () => {
  it("captures the deleted count", async () => {
    bulkDeleteContacts.mockResolvedValue({ success: true, count: 2 });

    renderTable(
      <ContactsTable
        {...baseProps}
        contacts={[makeContact({ id: "a" }), makeContact({ id: "b" })]}
        total={2}
      />
    );

    await userEvent.click(
      screen.getAllByRole("checkbox", { name: /select row/i })[0]
    );
    await userEvent.click(
      screen.getAllByRole("checkbox", { name: /select row/i })[1]
    );
    await userEvent.click(screen.getByRole("button", { name: /actions/i }));
    await userEvent.click(await screen.findByText(/delete contacts/i));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contacts_bulk_deleted", {
        count: 2,
      });
    });
  });
});

describe("import started", () => {
  it("captures before the dialog opens", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(screen.getByRole("button", { name: /^import$/i }));

    expect(capture).toHaveBeenCalledWith("contacts_import_started");
  });
});

describe("export", () => {
  it("captures selection_only: true for export selected, with no PII", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(
      screen.getByRole("checkbox", { name: /select row/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(await screen.findByText(/export selected/i));

    expect(capture).toHaveBeenCalledWith("contacts_exported_csv", {
      row_count: 1,
      selection_only: true,
      was_truncated: false,
    });
    for (const call of capture.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("ada@example.com");
    }
  });

  it("captures was_truncated from the export-all result", async () => {
    exportAllContacts.mockResolvedValue({
      success: true,
      contacts: [makeContact()],
      total: 500,
      truncated: true,
    });

    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(screen.getByRole("button", { name: /export/i }));
    await userEvent.click(await screen.findByText(/^export all$/i));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contacts_exported_csv", {
        row_count: 1,
        selection_only: false,
        was_truncated: true,
      });
    });
  });
});

describe("contact detail opened", () => {
  it("captures once per contactId, not once per render", async () => {
    currentSearchParams = new URLSearchParams({ contactId: "contact-1" });

    const { rerender } = renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contact_detail_opened");
    });
    expect(
      capture.mock.calls.filter((c) => c[0] === "contact_detail_opened")
    ).toHaveLength(1);

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
      </QueryClientProvider>
    );

    expect(
      capture.mock.calls.filter((c) => c[0] === "contact_detail_opened")
    ).toHaveLength(1);
  });
});
