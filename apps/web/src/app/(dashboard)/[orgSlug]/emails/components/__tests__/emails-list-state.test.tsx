/**
 * Emails list - the four states render differently (audit F1 and F6)
 *
 * The regression these guard against is one string serving every situation.
 * Each test asserts both what the state says and what it must never say: the
 * error state must not blame a filter, and the sandbox state must not tell an
 * organization whose sends AWS will reject to send its first email.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailsListState } from "../emails-list-state";

afterEach(cleanup);

const base = {
  days: 7,
  orgSlug: "acme",
  sandboxStatus: null as boolean | null,
};

describe("EmailsListState - error", () => {
  it("names the failure and offers a retry", async () => {
    const onRetry = vi.fn();
    render(<EmailsListState {...base} kind="error" onRetry={onRetry} />);

    expect(
      screen.getByText(/couldn't load your messages/i)
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("never mentions the time range or sending a first email", () => {
    const { container } = render(<EmailsListState {...base} kind="error" />);

    expect(container.textContent).not.toMatch(/time range/i);
    expect(container.textContent).not.toMatch(/first email/i);
    expect(container.textContent).not.toMatch(/last 7 days/i);
  });

  it("shows a spinner and blocks a second retry while one is in flight", () => {
    render(<EmailsListState {...base} isRetrying kind="error" />);

    expect(screen.getByRole("button", { name: /retrying/i })).toBeDisabled();
  });
});

describe("EmailsListState - filtered", () => {
  it("names the search term and the window instead of generic advice", () => {
    render(
      <EmailsListState {...base} kind="empty-filtered" search="invoice" />
    );

    expect(
      screen.getByText('No messages match "invoice" in the last 7 days.')
    ).toBeInTheDocument();
  });

  it("offers the next wider window and reports the days it picked", async () => {
    const onWidenRange = vi.fn();
    render(
      <EmailsListState
        {...base}
        kind="empty-filtered"
        onWidenRange={onWidenRange}
        search="invoice"
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /search the last 30 days/i })
    );
    expect(onWidenRange).toHaveBeenCalledWith(30);
  });

  it("offers no widening at the widest window", () => {
    render(
      <EmailsListState
        {...base}
        days={90}
        kind="empty-filtered"
        onWidenRange={vi.fn()}
        status="bounced"
      />
    );

    expect(
      screen.queryByRole("button", { name: /search the last/i })
    ).toBeNull();
  });

  it("offers clearing filters only when an explicit filter is set", () => {
    const onClearFilters = vi.fn();
    const { unmount } = render(
      <EmailsListState
        {...base}
        kind="empty-filtered"
        onClearFilters={onClearFilters}
        status="bounced"
      />
    );
    expect(
      screen.getByRole("button", { name: /clear filters/i })
    ).toBeInTheDocument();
    unmount();

    // Sends exist, just not in this window - there is no filter to clear.
    render(
      <EmailsListState
        {...base}
        kind="empty-filtered"
        onClearFilters={onClearFilters}
      />
    );
    expect(screen.queryByRole("button", { name: /clear filters/i })).toBeNull();
  });
});

describe("EmailsListState - sandbox", () => {
  it("names the sandbox and links to production access", () => {
    render(<EmailsListState {...base} kind="empty-sandbox" sandboxStatus />);

    expect(screen.getByText(/in the ses sandbox/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /request production access/i })
    ).toHaveAttribute(
      "href",
      "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html"
    );
  });

  it("never tells a sandboxed org to send its first email", () => {
    const { container } = render(
      <EmailsListState {...base} kind="empty-sandbox" sandboxStatus />
    );

    expect(container.textContent).not.toMatch(/send your first email/i);
    expect(container.textContent).not.toMatch(/time range/i);
  });
});

describe("EmailsListState - never sent", () => {
  it("leads with what the page is for and gives one primary path", () => {
    render(
      <EmailsListState
        {...base}
        kind="empty-never-sent"
        sandboxStatus={false}
      />
    );

    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /send your first email/i })
    ).toHaveAttribute("href", "/acme");
  });

  it("does not blame the time range", () => {
    const { container } = render(
      <EmailsListState
        {...base}
        kind="empty-never-sent"
        sandboxStatus={false}
      />
    );

    expect(container.textContent).not.toMatch(/time range/i);
  });

  it("admits when SES settings have never been scanned", () => {
    render(
      <EmailsListState {...base} kind="empty-never-sent" sandboxStatus={null} />
    );

    expect(screen.getByText(/still in the SES sandbox/i)).toBeInTheDocument();
  });

  it("stays quiet about the sandbox for a production account", () => {
    const { container } = render(
      <EmailsListState
        {...base}
        kind="empty-never-sent"
        sandboxStatus={false}
      />
    );

    expect(container.textContent).not.toMatch(/sandbox/i);
  });
});
