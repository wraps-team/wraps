/**
 * EmailPreview - inbound message viewer sandbox (plan 344)
 *
 * The body rendered here is HTML written by whoever emailed the customer -
 * a stranger, displayed to an org owner or admin with a live app.wraps.dev
 * session. The iframe used to carry `sandbox="allow-same-origin"`, a latent
 * escape hatch: harmless today because `allow-scripts` is absent, but a
 * sandbox escape the day someone adds it to fix a rendering complaint. These
 * tests pin the fully-sandboxed replacement and the no-referrer policy that
 * stops remote images leaking the dashboard URL or confirming to the sender
 * that a human opened the message.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboundEmailDetail } from "@/lib/aws/s3-inbound";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { EmailPreview } from "../email-preview";

function makeEmail(
  overrides: Partial<InboundEmailDetail> = {}
): InboundEmailDetail {
  return {
    emailId: "email-1",
    messageId: "0100018f-1111-2222-3333-444455556666",
    from: { address: "stranger@example.com", name: "A Stranger" },
    to: [{ address: "support@acme.test", name: "" }],
    cc: [],
    subject: "Hello",
    date: "2026-09-01T00:00:00.000Z",
    html: "<p>Hello there</p>",
    htmlTruncated: false,
    text: null,
    headers: {},
    attachments: [],
    spamVerdict: "PASS",
    virusVerdict: "PASS",
    rawS3Key: "inbound/email-1.eml",
    receivedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("EmailPreview", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the HTML body iframe fully sandboxed with no referrer leak", () => {
    render(<EmailPreview email={makeEmail()} orgSlug="acme" />);

    const iframe = screen.getByTitle("Email content");
    expect(iframe).toHaveAttribute("sandbox", "");
    expect(iframe).toHaveAttribute("referrerPolicy", "no-referrer");
  });

  it("never grants the frame allow-same-origin", () => {
    render(<EmailPreview email={makeEmail()} orgSlug="acme" />);

    const iframe = screen.getByTitle("Email content");
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("renders the plain-text body and no iframe when html is absent", () => {
    render(
      <EmailPreview
        email={makeEmail({ html: null, text: "Hello there" })}
        orgSlug="acme"
      />
    );

    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.queryByTitle("Email content")).not.toBeInTheDocument();
  });

  it("shows 'No message body' when neither html nor text is present", () => {
    render(
      <EmailPreview
        email={makeEmail({ html: null, text: null })}
        orgSlug="acme"
      />
    );

    expect(screen.getByText("No message body")).toBeInTheDocument();
    expect(screen.queryByTitle("Email content")).not.toBeInTheDocument();
  });

  it("shows a 'Delivered to' row when the envelope holds an address not in To or Cc", () => {
    render(
      <EmailPreview
        email={makeEmail({
          envelopeRecipients: ["support@acme.test", "bcc@acme.test"],
        })}
        orgSlug="acme"
      />
    );

    expect(screen.getByText("Delivered to")).toBeInTheDocument();
    expect(
      screen.getByText("support@acme.test, bcc@acme.test")
    ).toBeInTheDocument();
  });

  it("hides the row when every envelope address is in To or Cc, ignoring case", () => {
    render(
      <EmailPreview
        email={makeEmail({
          cc: [{ address: "Team@Acme.test", name: "" }],
          envelopeRecipients: ["support@acme.test", "team@acme.test"],
        })}
        orgSlug="acme"
      />
    );

    expect(screen.queryByText("Delivered to")).not.toBeInTheDocument();
  });

  it("hides the row when envelopeRecipients is absent or empty", () => {
    const { rerender } = render(
      <EmailPreview email={makeEmail()} orgSlug="acme" />
    );
    expect(screen.queryByText("Delivered to")).not.toBeInTheDocument();

    rerender(
      <EmailPreview
        email={makeEmail({ envelopeRecipients: [] })}
        orgSlug="acme"
      />
    );
    expect(screen.queryByText("Delivered to")).not.toBeInTheDocument();
  });
});
