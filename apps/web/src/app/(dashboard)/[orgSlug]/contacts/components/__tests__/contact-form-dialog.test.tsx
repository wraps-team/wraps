/**
 * The contact dialog's submit contract (audit finding M12).
 *
 * The dialog was migrated from hand-rolled `useState` + a hand-rolled dirty
 * diff to TanStack Form. Two parents — contacts-table.tsx and
 * contacts-empty-state.tsx — depend on the exact shape it emits:
 *
 *   edit mode:   `undefined` = "this field did not change, leave the column
 *                alone"; `null` = "the user cleared it, null the column";
 *                a string = "write this".
 *   create mode: every field the user filled in is sent.
 *
 * Collapsing `null` into `undefined` (or into `""`) silently drops edits in
 * production, which is precisely what the hand-rolled diff risked. These
 * assertions pin all three states per field rather than spot-checking one,
 * so a wrong implementation cannot pass by accident.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactWithMeta } from "@/lib/contacts";
import type { TopicWithMeta } from "@/lib/topics";
import { ContactFormDialog } from "../contact-form-dialog";

// Radix's Select measures its trigger via @radix-ui/react-use-size, which
// jsdom has no ResizeObserver for. Matches the sibling contacts tests.
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

function stubPointerEvents() {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
}

/**
 * A contact with both channel statuses set. Statuses are diffed against the
 * stored value, so a contact whose `smsStatus` is null would legitimately
 * report a change on open (the form has to show *some* status) — that is
 * existing behaviour, and not what these tests are about.
 */
function makeContact(overrides: Partial<ContactWithMeta> = {}) {
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
    emailsSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    phone: "+15551234567",
    smsStatus: "pending_consent",
    smsConsentedAt: null,
    smsOptedOutAt: null,
    smsInvalidAt: null,
    lastSmsSentAt: null,
    lastSmsClickedAt: null,
    smsSent: 0,
    smsClicked: 0,
    firstName: "Ada",
    lastName: "Lovelace",
    company: "Analytical Engines",
    jobTitle: "Mathematician",
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

const topics: TopicWithMeta[] = [];

type Payload = Parameters<
  React.ComponentProps<typeof ContactFormDialog>["onSubmit"]
>[0];

function renderDialog(
  props: Partial<React.ComponentProps<typeof ContactFormDialog>> = {}
) {
  const onSubmit = vi.fn();
  render(
    <ContactFormDialog
      isPending={false}
      mode="create"
      onOpenChange={vi.fn()}
      onSubmit={onSubmit}
      open={true}
      orgSlug="acme"
      proFeaturesEnabled={false}
      topics={topics}
      {...props}
    />
  );
  return { onSubmit };
}

async function submitAndCapture(
  onSubmit: ReturnType<typeof vi.fn>,
  buttonName: RegExp
): Promise<Payload> {
  await userEvent.click(screen.getByRole("button", { name: buttonName }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  return onSubmit.mock.calls[0][0] as Payload;
}

/** Keys the payload actually carries a non-`undefined` value for. */
function setKeys(payload: Payload): string[] {
  return Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();
}

beforeEach(stubPointerEvents);
afterEach(cleanup);

describe("edit mode", () => {
  it("sends undefined for every field when nothing changed", async () => {
    const { onSubmit } = renderDialog({
      contact: makeContact(),
      mode: "edit",
    });

    const payload = await submitAndCapture(onSubmit, /^save changes$/i);

    // Nothing at all should be set — an untouched save must be a no-op for
    // every column, not just for the ones a spot-check happens to name.
    expect(setKeys(payload)).toEqual([]);
    expect(payload.email).toBeUndefined();
    expect(payload.phone).toBeUndefined();
    expect(payload.firstName).toBeUndefined();
    expect(payload.lastName).toBeUndefined();
    expect(payload.company).toBeUndefined();
    expect(payload.jobTitle).toBeUndefined();
    expect(payload.emailStatus).toBeUndefined();
    expect(payload.smsStatus).toBeUndefined();
    expect(payload.properties).toBeUndefined();
    expect(payload.topicIds).toBeUndefined();
  });

  it("sends only the field that changed, leaving the rest undefined", async () => {
    const { onSubmit } = renderDialog({
      contact: makeContact(),
      mode: "edit",
    });

    const company = screen.getByLabelText("Company");
    await userEvent.clear(company);
    await userEvent.type(company, "Initech");

    const payload = await submitAndCapture(onSubmit, /^save changes$/i);

    expect(setKeys(payload)).toEqual(["company"]);
    expect(payload.company).toBe("Initech");
    // The untouched name fields must not be nulled just because they were
    // read into the form store.
    expect(payload.firstName).toBeUndefined();
    expect(payload.lastName).toBeUndefined();
    expect(payload.jobTitle).toBeUndefined();
    expect(payload.email).toBeUndefined();
  });

  it("sends null — not undefined, not empty string — for a name cleared to empty", async () => {
    const { onSubmit } = renderDialog({
      contact: makeContact(),
      mode: "edit",
    });

    await userEvent.clear(screen.getByLabelText("First name"));

    const payload = await submitAndCapture(onSubmit, /^save changes$/i);

    expect(setKeys(payload)).toEqual(["firstName"]);
    expect(payload.firstName).toBeNull();
    expect(payload.firstName).not.toBeUndefined();
    expect(payload.firstName).not.toBe("");
    expect(payload.lastName).toBeUndefined();
  });

  it("distinguishes a cleared job title from an untouched company", async () => {
    const { onSubmit } = renderDialog({
      contact: makeContact(),
      mode: "edit",
    });

    await userEvent.clear(screen.getByLabelText("Job title"));
    await userEvent.clear(screen.getByLabelText("Last name"));
    await userEvent.type(screen.getByLabelText("Last name"), "Byron");

    const payload = await submitAndCapture(onSubmit, /^save changes$/i);

    expect(setKeys(payload)).toEqual(["jobTitle", "lastName"]);
    expect(payload.jobTitle).toBeNull();
    expect(payload.lastName).toBe("Byron");
    expect(payload.company).toBeUndefined();
  });

  it("sends properties only when they differ from the stored object", async () => {
    const { onSubmit } = renderDialog({
      contact: makeContact({ properties: { plan: "pro" } }),
      mode: "edit",
      proFeaturesEnabled: true,
    });

    // Untouched: the existing property round-trips to an identical object.
    const unchanged = await submitAndCapture(onSubmit, /^save changes$/i);
    expect(unchanged.properties).toBeUndefined();

    onSubmit.mockClear();
    cleanup();

    const second = renderDialog({
      contact: makeContact({ properties: { plan: "pro" } }),
      mode: "edit",
      proFeaturesEnabled: true,
    });
    const valueInput = screen.getByDisplayValue("pro");
    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, "enterprise");

    const changed = await submitAndCapture(second.onSubmit, /^save changes$/i);
    expect(changed.properties).toEqual({ plan: "enterprise" });
  });

  it("sends topicIds only when the subscribed set changed", async () => {
    const topic = { id: "topic-1", name: "Newsletter" } as TopicWithMeta;
    const { onSubmit } = renderDialog({
      contact: makeContact({
        topics: [
          { topicId: "topic-1", status: "subscribed" },
        ] as ContactWithMeta["topics"],
      }),
      mode: "edit",
      proFeaturesEnabled: true,
      topics: [topic],
    });

    // Unsubscribing is a change; the empty array must still be sent.
    await userEvent.click(screen.getByLabelText("Newsletter"));

    const payload = await submitAndCapture(onSubmit, /^save changes$/i);
    expect(payload.topicIds).toEqual([]);
  });
});

describe("create mode", () => {
  it("sends every filled field", async () => {
    const { onSubmit } = renderDialog({ mode: "create" });

    await userEvent.type(
      screen.getByLabelText("Email address"),
      "grace@example.com"
    );
    await userEvent.type(screen.getByLabelText("Phone number"), "+15550001111");
    await userEvent.type(screen.getByLabelText("First name"), "Grace");
    await userEvent.type(screen.getByLabelText("Last name"), "Hopper");
    await userEvent.type(screen.getByLabelText("Company"), "US Navy");
    await userEvent.type(screen.getByLabelText("Job title"), "Rear Admiral");

    const payload = await submitAndCapture(onSubmit, /^add contact$/i);

    expect(payload).toEqual({
      email: "grace@example.com",
      phone: "+15550001111",
      firstName: "Grace",
      lastName: "Hopper",
      company: "US Navy",
      jobTitle: "Rear Admiral",
      emailStatus: "active",
      smsStatus: "pending_consent",
      properties: undefined,
      topicIds: [],
    });
  });

  it("omits the channel status for a channel with no value", async () => {
    const { onSubmit } = renderDialog({ mode: "create" });

    await userEvent.type(
      screen.getByLabelText("Email address"),
      "grace@example.com"
    );

    const payload = await submitAndCapture(onSubmit, /^add contact$/i);

    expect(payload.emailStatus).toBe("active");
    expect(payload.smsStatus).toBeUndefined();
    expect(payload.phone).toBeUndefined();
  });

  it("blocks submission when neither email nor phone is given", async () => {
    const { onSubmit } = renderDialog({ mode: "create" });

    await userEvent.type(screen.getByLabelText("First name"), "Nobody");

    const submit = screen.getByRole("button", { name: /^add contact$/i });
    expect(submit).toBeDisabled();

    await userEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an inline error for an invalid email and blocks submission", async () => {
    const { onSubmit } = renderDialog({ mode: "create" });

    await userEvent.type(
      screen.getByLabelText("Email address"),
      "not-an-email"
    );

    expect(
      await screen.findByText(/enter a valid email address/i)
    ).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: /^add contact$/i });
    expect(submit).toBeDisabled();
    await userEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
