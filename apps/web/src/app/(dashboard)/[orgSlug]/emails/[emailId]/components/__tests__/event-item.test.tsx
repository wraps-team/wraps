// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventItem } from "../event-item";

afterEach(cleanup);

describe("EventItem bot detection", () => {
  it("shows Automated badge for open events with bot user agent", () => {
    render(
      <EventItem
        color="text-purple-500"
        event={{
          type: "open",
          timestamp: Date.now(),
          metadata: {
            userAgent: "Barracuda/5.0",
            ipAddress: "1.2.3.4",
          },
        }}
        iconType="open"
        isLast={false}
      />
    );

    expect(screen.getByText("Automated")).toBeTruthy();
  });

  it("does not show Automated badge for open events with real user agent", () => {
    render(
      <EventItem
        color="text-purple-500"
        event={{
          type: "open",
          timestamp: Date.now(),
          metadata: {
            userAgent:
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
            ipAddress: "203.0.113.42",
          },
        }}
        iconType="open"
        isLast={false}
      />
    );

    expect(screen.queryByText("Automated")).toBeNull();
  });

  it("shows Automated badge for open events with no user agent", () => {
    render(
      <EventItem
        color="text-purple-500"
        event={{
          type: "open",
          timestamp: Date.now(),
          metadata: {
            ipAddress: "1.2.3.4",
          },
        }}
        iconType="open"
        isLast={false}
      />
    );

    expect(screen.getByText("Automated")).toBeTruthy();
  });

  it("does not show Automated badge for non-open events", () => {
    render(
      <EventItem
        color="text-success"
        event={{
          type: "delivery",
          timestamp: Date.now(),
          metadata: {
            recipients: ["user@example.com"],
          },
        }}
        iconType="delivery"
        isLast={false}
      />
    );

    expect(screen.queryByText("Automated")).toBeNull();
  });
});

describe("EventItem diagnostic panel", () => {
  it("renders a formatted bounce with headline, translation, action, and raw code", () => {
    render(
      <EventItem
        color="text-destructive"
        event={{
          type: "bounce",
          timestamp: Date.now(),
          metadata: {
            bounceType: "Permanent",
            bounceSubType: "General",
            bouncedRecipients: [
              {
                emailAddress: "gone@example.com",
                status: "5.1.1",
                diagnosticCode: "smtp; 550 5.1.1 user unknown",
              },
            ],
          },
        }}
        iconType="bounce"
        isLast={false}
      />
    );

    expect(screen.getByText("Hard bounce — general failure")).toBeTruthy();
    expect(screen.getByText("Bad destination mailbox address")).toBeTruthy();
    expect(
      screen.getByText(/Remove the address — the mailbox doesn't exist\./)
    ).toBeTruthy();
    expect(screen.getByText("smtp; 550 5.1.1 user unknown")).toBeTruthy();
    expect(screen.getByText("gone@example.com")).toBeTruthy();
  });

  it("renders a row per recipient for a multi-recipient bounce", () => {
    render(
      <EventItem
        color="text-destructive"
        event={{
          type: "bounce",
          timestamp: Date.now(),
          metadata: {
            bounceType: "Permanent",
            bounceSubType: "General",
            bouncedRecipients: [
              {
                emailAddress: "first@example.com",
                status: "5.1.1",
                diagnosticCode: "smtp; 550 5.1.1 user unknown",
              },
              {
                emailAddress: "second@example.com",
                status: "5.2.2",
                diagnosticCode: "smtp; 552 5.2.2 mailbox full",
              },
            ],
          },
        }}
        iconType="bounce"
        isLast={false}
      />
    );

    expect(screen.getByText("first@example.com")).toBeTruthy();
    expect(screen.getByText("second@example.com")).toBeTruthy();
    expect(screen.getByText("smtp; 552 5.2.2 mailbox full")).toBeTruthy();
    // Each recipient row must carry its OWN distinct translation.
    expect(screen.getByText("Bad destination mailbox address")).toBeTruthy();
    expect(screen.getByText("Mailbox full")).toBeTruthy();
  });

  it("renders a formatted SMTP response for a delivery event", () => {
    render(
      <EventItem
        color="text-success"
        event={{
          type: "delivery",
          timestamp: Date.now(),
          metadata: {
            smtpResponse: "250 2.0.0 OK",
            remoteMtaIp: "127.0.2.0",
            processingTimeMillis: 546,
            recipients: ["ok@example.com"],
          },
        }}
        iconType="delivery"
        isLast={false}
      />
    );

    expect(screen.getByText("250 2.0.0 OK")).toBeTruthy();
    expect(screen.getByText("127.0.2.0")).toBeTruthy();
    expect(screen.getByText("546 ms")).toBeTruthy();
  });

  it("renders the delay reason and retry-until for a delivery delay", () => {
    render(
      <EventItem
        color="text-warning"
        event={{
          type: "deliverydelay",
          // Fixed, non-today timestamp (unlike the other fixtures in this file)
          // so the event header's rendered date can never land on the same
          // calendar day as the "Expires" fixture below, regardless of when
          // the suite runs.
          timestamp: new Date("2026-03-15T14:30:00.000Z").getTime(),
          metadata: {
            delayType: "MailboxFull",
            expirationTime: "2026-07-08T00:00:00.000Z",
            delayedRecipients: [{ emailAddress: "slow@example.com" }],
          },
        }}
        iconType="deliverydelay"
        isLast={false}
      />
    );

    expect(screen.getByText("Delivery delayed — mailbox full")).toBeTruthy();

    // Scope the assertion to the "Expires" field's own <dd> instead of a
    // broad getByText regex, so it can't match the unrelated event header
    // timestamp (which is formatted similarly: "<Mon> <day>, <year>").
    const expiresLabel = screen.getByText("Expires");
    const expiresValue = expiresLabel.nextElementSibling;
    // The Expires field renders as a formatted local date, not the raw ISO string.
    // Midnight UTC on Jul 8 lands on Jul 7 or Jul 8 depending on the runner's zone.
    expect(expiresValue?.textContent).toMatch(/Jul [78], 2026/);
    expect(expiresValue?.textContent).not.toBe("2026-07-08T00:00:00.000Z");
    expect(screen.queryByText("2026-07-08T00:00:00.000Z")).toBeNull();
  });

  it("renders a labeled feedback type and plain-English copy for a complaint", () => {
    render(
      <EventItem
        color="text-destructive"
        event={{
          type: "complaint",
          timestamp: Date.now(),
          metadata: {
            complaintFeedbackType: "abuse",
            complainedRecipients: [{ emailAddress: "angry@example.com" }],
          },
        }}
        iconType="complaint"
        isLast={false}
      />
    );

    expect(screen.getByText("Feedback type")).toBeTruthy();
    expect(screen.getByText("abuse")).toBeTruthy();
    expect(screen.getByText("Spam complaint — marked as spam")).toBeTruthy();
  });

  it("renders a reject event with its reason through EventItem", () => {
    render(
      <EventItem
        color="text-destructive"
        event={{
          type: "reject",
          timestamp: Date.now(),
          metadata: { reason: "Message content rejected by SES" },
        }}
        iconType="reject"
        isLast={false}
      />
    );

    expect(screen.getByText("Rejected before sending")).toBeTruthy();
    expect(screen.getByText("Message content rejected by SES")).toBeTruthy();
  });

  it("renders a rendering-failure event with its error message and template", () => {
    render(
      <EventItem
        color="text-destructive"
        event={{
          type: "rendering_failure",
          timestamp: Date.now(),
          metadata: {
            errorMessage: "missing variable: firstName",
            templateName: "welcome",
          },
        }}
        iconType="rendering_failure"
        isLast={false}
      />
    );

    expect(screen.getByText("Template rendering failed")).toBeTruthy();
    expect(screen.getByText("missing variable: firstName")).toBeTruthy();
    expect(screen.getByText("welcome")).toBeTruthy();
  });

  it("shows no diagnostic panel for an unknown event type but keeps the raw JSON expander and Copy JSON", () => {
    render(
      <EventItem
        color="text-purple-500"
        event={{
          type: "open",
          timestamp: Date.now(),
          metadata: {
            userAgent:
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
            ipAddress: "203.0.113.42",
          },
        }}
        iconType="open"
        isLast={false}
      />
    );

    // No formatted diagnostic panel for open events.
    expect(screen.queryByText("Delivered")).toBeNull();
    expect(screen.queryByText("Permanent")).toBeNull();

    // The existing raw-JSON expander (with Copy JSON) is untouched.
    expect(screen.queryByText("Copy JSON")).toBeNull();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByText("Copy JSON")).toBeTruthy();
    expect(screen.getByText("Event Details")).toBeTruthy();
  });
});
