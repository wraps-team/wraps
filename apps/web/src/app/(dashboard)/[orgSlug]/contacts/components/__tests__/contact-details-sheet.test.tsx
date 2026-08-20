/**
 * Contact details sheet - accessible names, labelled property editor, and a
 * close path that doesn't eat unsaved work (audit findings H3, M9, M10, L5)
 *
 * The copy button next to the email address was an icon-only `<motion.button>`
 * with no accessible name. The custom-property editor labelled its key/value
 * inputs with a placeholder only, and its remove button had no name at all -
 * with several rows, every delete control read identically. Closing the sheet
 * mid-edit (Esc, overlay click, the X) discarded everything typed with no
 * warning. And the header was the literal string "Contact Details", so the
 * sheet never said whose record it was showing.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactWithMeta } from "@/lib/contacts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/actions/contacts", () => ({
  getContact: vi.fn(),
}));

// The timeline fires its own server action on mount and is not what these
// tests are about.
vi.mock("../contact-timeline", () => ({
  ContactTimeline: () => null,
}));

import { ContactDetailsSheet } from "../contact-details-sheet";

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

function renderSheet(
  overrides: Partial<ComponentProps<typeof ContactDetailsSheet>> = {}
) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ContactDetailsSheet
        contact={makeContact()}
        isPending={false}
        onClose={onClose}
        onSave={onSave}
        open
        organizationId="org-1"
        orgSlug="acme"
        proFeaturesEnabled
        topics={[]}
        userRole="owner"
        {...overrides}
      />
    </QueryClientProvider>
  );

  return { onClose, onSave };
}

afterEach(cleanup);

describe("copy button has an accessible name (H3)", () => {
  it("names the button after the address it copies", () => {
    renderSheet();

    expect(
      screen.getByRole("button", { name: "Copy ada@example.com" })
    ).toBeInTheDocument();
  });

  it("names it per contact, not with a generic label", () => {
    renderSheet({ contact: makeContact({ email: "grace@example.com" }) });

    expect(
      screen.getByRole("button", { name: "Copy grace@example.com" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy ada@example.com" })
    ).not.toBeInTheDocument();
  });
});

describe("custom property editor is labelled (M9)", () => {
  it("labels the key and value inputs independently of the placeholder", async () => {
    const user = userEvent.setup();
    renderSheet({ contact: makeContact({ properties: { plan: "pro" } }) });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const keyInput = screen.getByLabelText("Property 1 key");
    const valueInput = screen.getByLabelText("Property 1 value");
    expect(keyInput).toHaveValue("plan");
    expect(valueInput).toHaveValue("pro");

    // The label has to survive typing - a placeholder would not.
    await user.clear(valueInput);
    await user.type(valueInput, "enterprise");
    expect(screen.getByLabelText("Property 1 value")).toHaveValue("enterprise");
  });

  it("names each remove button after the property it removes", async () => {
    const user = userEvent.setup();
    renderSheet({
      contact: makeContact({ properties: { plan: "pro", tier: "gold" } }),
    });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(
      screen.getByRole("button", { name: "Remove property plan" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove property tier" })
    ).toBeInTheDocument();
  });

  it("actually removes the row the named button belongs to", async () => {
    const user = userEvent.setup();
    renderSheet({
      contact: makeContact({ properties: { plan: "pro", tier: "gold" } }),
    });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(
      screen.getByRole("button", { name: "Remove property plan" })
    );

    expect(
      screen.queryByRole("button", { name: "Remove property plan" })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Property 1 key")).toHaveValue("tier");
  });
});

describe("closing mid-edit does not silently discard (M10)", () => {
  async function makeDirty(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const firstName = screen.getByLabelText("First name");
    await user.clear(firstName);
    await user.type(firstName, "Grace");
  }

  it("closes immediately when the form is clean", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Discard unsaved changes?")
    ).not.toBeInTheDocument();
  });

  it("still closes on Escape when the form is clean", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("warns instead of closing when a form field is dirty", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await makeDirty(user);
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Discard unsaved changes?")
    ).toBeInTheDocument();
  });

  it("warns on Escape too, not just the X button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await makeDirty(user);
    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Discard unsaved changes?")
    ).toBeInTheDocument();
  });

  it("counts an edited custom property, which lives outside the form", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet({
      contact: makeContact({ properties: { plan: "pro" } }),
    });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const valueInput = screen.getByLabelText("Property 1 value");
    await user.clear(valueInput);
    await user.type(valueInput, "enterprise");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Discard unsaved changes?")
    ).toBeInTheDocument();
  });

  it("keeps the sheet and the typed values when the user backs out", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await makeDirty(user);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(
      await screen.findByRole("button", { name: "Keep editing" })
    );

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("First name")).toHaveValue("Grace");
  });

  it("closes only once the user confirms the discard", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await makeDirty(user);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(
      await screen.findByRole("button", { name: "Discard changes" })
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("never turns a close into a save", async () => {
    const user = userEvent.setup();
    const { onSave } = renderSheet();

    await makeDirty(user);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(
      await screen.findByRole("button", { name: "Discard changes" })
    );

    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("the sheet title names the record (L5)", () => {
  it("uses the contact's email, not a generic heading", () => {
    renderSheet();

    expect(
      screen.getByRole("heading", { name: /ada@example\.com/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /^Contact Details$/i })
    ).not.toBeInTheDocument();
  });

  it("falls back to the phone number when there is no email", () => {
    renderSheet({
      contact: makeContact({ email: null, phone: "+15551234567" }),
    });

    expect(
      screen.getByRole("heading", { name: /\+15551234567/ })
    ).toBeInTheDocument();
  });

  it("falls back to the name when there is neither email nor phone", () => {
    renderSheet({
      contact: makeContact({ email: null, phone: null }),
    });

    expect(
      screen.getByRole("heading", { name: /Ada Lovelace/ })
    ).toBeInTheDocument();
  });
});
