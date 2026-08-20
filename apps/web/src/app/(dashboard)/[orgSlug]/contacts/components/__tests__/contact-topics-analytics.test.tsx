/**
 * Contacts <-> topics instrumentation (audit finding F16, wave 3 handoff).
 *
 * The contacts pass (wave 3's first half) captured contact CRUD, search,
 * filters, export, and the import wizard, but topic subscribe/unsubscribe -
 * both from the single-contact edit form and the bulk row-selection actions
 * menu - had no capture. This closes that gap. No server-side capture exists
 * for either direction, and no contact email may appear in any payload.
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

globalThis.ResizeObserver ??= class {
  observe() {
    // no layout in jsdom
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

vi.mock("@/actions/contacts", () => ({
  createContact: vi.fn(),
  deleteContact: vi.fn(),
  updateContact: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/actions/contacts-bulk", () => ({
  bulkDeleteContacts: vi.fn(),
}));

const subscribeContactToTopics = vi.fn();
const unsubscribeContactFromTopics = vi.fn();
const bulkSubscribeContactsToTopics = vi.fn();
const bulkUnsubscribeContactsFromTopics = vi.fn();

vi.mock("@/actions/contacts-topics", () => ({
  bulkSubscribeContactsToTopics: (...args: unknown[]) =>
    bulkSubscribeContactsToTopics(...args),
  bulkUnsubscribeContactsFromTopics: (...args: unknown[]) =>
    bulkUnsubscribeContactsFromTopics(...args),
  subscribeContactToTopics: (...args: unknown[]) =>
    subscribeContactToTopics(...args),
  unsubscribeContactFromTopics: (...args: unknown[]) =>
    unsubscribeContactFromTopics(...args),
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
  topics: [topic],
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

function stubPointerEvents() {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
}

beforeEach(() => {
  stubPointerEvents();
  capture.mockClear();
  refresh.mockClear();
  subscribeContactToTopics.mockReset();
  unsubscribeContactFromTopics.mockReset();
  bulkSubscribeContactsToTopics.mockReset();
  bulkUnsubscribeContactsFromTopics.mockReset();
  subscribeContactToTopics.mockResolvedValue({ success: true });
  unsubscribeContactFromTopics.mockResolvedValue({ success: true });
  currentSearchParams = new URLSearchParams();
});

afterEach(cleanup);

describe("single contact, via the edit form", () => {
  it("captures contact_topic_subscribed with source: single, no email in the payload", async () => {
    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/^edit contact$/i));
    await userEvent.click(screen.getByLabelText("Newsletter"));
    await userEvent.click(
      screen.getByRole("button", { name: /^save changes$/i })
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contact_topic_subscribed", {
        contact_count: 1,
        source: "single",
      });
    });
    for (const call of capture.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("ada@example.com");
    }
  });

  it("captures contact_topic_unsubscribed with source: single when a subscribed topic is unchecked", async () => {
    renderTable(
      <ContactsTable
        {...baseProps}
        contacts={[
          makeContact({
            topics: [
              {
                topicId: "topic-1",
                topicName: "Newsletter",
                status: "subscribed",
                subscribedAt: new Date("2026-08-01T00:00:00.000Z"),
              },
            ],
          }),
        ]}
        total={1}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/^edit contact$/i));
    await userEvent.click(screen.getByLabelText("Newsletter"));
    await userEvent.click(
      screen.getByRole("button", { name: /^save changes$/i })
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contact_topic_unsubscribed", {
        contact_count: 1,
        source: "single",
      });
    });
  });

  it("does not capture when the subscribe call fails", async () => {
    subscribeContactToTopics.mockResolvedValue({
      success: false,
      error: "nope",
    });

    renderTable(
      <ContactsTable {...baseProps} contacts={[makeContact()]} total={1} />
    );

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/^edit contact$/i));
    await userEvent.click(screen.getByLabelText("Newsletter"));
    await userEvent.click(
      screen.getByRole("button", { name: /^save changes$/i })
    );

    await waitFor(() => expect(subscribeContactToTopics).toHaveBeenCalled());
    expect(capture).not.toHaveBeenCalledWith(
      "contact_topic_subscribed",
      expect.anything()
    );
  });
});

describe("bulk, via the row-selection actions menu", () => {
  it("captures contact_topic_subscribed with the server-reported count", async () => {
    bulkSubscribeContactsToTopics.mockResolvedValue({
      success: true,
      count: 2,
    });

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
    await userEvent.click(await screen.findByText(/subscribe to topic/i));
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByText("Newsletter"));
    await userEvent.click(screen.getByRole("button", { name: /^subscribe$/i }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contact_topic_subscribed", {
        contact_count: 2,
        source: "bulk",
      });
    });
  });

  it("captures contact_topic_unsubscribed with the server-reported count", async () => {
    bulkUnsubscribeContactsFromTopics.mockResolvedValue({
      success: true,
      count: 2,
    });

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
    await userEvent.click(await screen.findByText(/unsubscribe from topic/i));
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByText("Newsletter"));
    await userEvent.click(
      screen.getByRole("button", { name: /^unsubscribe$/i })
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contact_topic_unsubscribed", {
        contact_count: 2,
        source: "bulk",
      });
    });
  });
});
