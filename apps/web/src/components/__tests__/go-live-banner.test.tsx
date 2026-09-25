/**
 * GoLiveBanner Tests
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoLiveBanner } from "../go-live-banner";

vi.mock("@/stores/products-store", () => ({
  useProductsStore: vi.fn(),
}));

const mockSessionStorage = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (key: string) => mockSessionStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockSessionStorage.set(key, value),
  removeItem: (key: string) => mockSessionStorage.delete(key),
  clear: () => mockSessionStorage.clear(),
});

import { useProductsStore } from "@/stores/products-store";

const mockUseProductsStore = vi.mocked(useProductsStore);

describe("GoLiveBanner", () => {
  beforeEach(() => {
    mockSessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders banner message when hasAwsAccounts is false", () => {
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({ status: { hasAwsAccounts: false } })
    );

    render(<GoLiveBanner orgSlug="test-org" />);

    expect(
      screen.getByText("Connect your AWS account to start sending emails.")
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("returns null when hasAwsAccounts is true", () => {
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({ status: { hasAwsAccounts: true } })
    );

    const { container } = render(<GoLiveBanner orgSlug="test-org" />);

    expect(container.innerHTML).toBe("");
  });

  /**
   * Audit finding F6: connecting AWS is not going live. Seven of the fourteen
   * external orgs with an account are still sandboxed, and the banner used to
   * disappear on connection - reading as "you are done" at the moment they are
   * most stuck.
   */
  it("keeps warning a connected org that is still in the SES sandbox", () => {
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({ status: { hasAwsAccounts: true, sandboxStatus: true } })
    );

    render(<GoLiveBanner orgSlug="test-org" />);

    expect(screen.getByText(/in the SES sandbox/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /request production access/i })
    ).toBeInTheDocument();
  });

  it("opens a dialog with a region-scoped SES console link when the account has a region", async () => {
    const user = userEvent.setup();
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({
        status: {
          hasAwsAccounts: true,
          sandboxStatus: true,
          productionAccessRequest: null,
          sandboxRegion: "eu-west-1",
        },
      })
    );

    render(<GoLiveBanner orgSlug="test-org" />);
    await user.click(
      screen.getByRole("button", { name: /request production access/i })
    );

    expect(
      screen.getByRole("link", { name: /open ses in eu-west-1/i })
    ).toHaveAttribute(
      "href",
      "https://eu-west-1.console.aws.amazon.com/ses/home?region=eu-west-1#/account"
    );
    expect(
      screen.getByRole("link", { name: /open ses in eu-west-1/i })
    ).toHaveAttribute("target", "_blank");
  });

  it("falls back to AWS's docs link in the dialog when no region was scanned", async () => {
    const user = userEvent.setup();
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({
        status: {
          hasAwsAccounts: true,
          sandboxStatus: true,
          productionAccessRequest: null,
          sandboxRegion: null,
        },
      })
    );

    render(<GoLiveBanner orgSlug="test-org" />);
    await user.click(
      screen.getByRole("button", { name: /request production access/i })
    );

    expect(
      screen.getByRole("link", { name: /open aws's guide/i })
    ).toHaveAttribute(
      "href",
      "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html"
    );
  });

  it("tells the customer AWS never received their request when the review FAILED", async () => {
    const user = userEvent.setup();
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({
        status: {
          hasAwsAccounts: true,
          sandboxStatus: true,
          productionAccessRequest: { status: "FAILED", caseId: null },
        },
      })
    );

    render(<GoLiveBanner orgSlug="test-org" />);

    expect(screen.getByText(/did not receive/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /request production access/i })
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/never received/i)).toBeInTheDocument();
  });

  it("names the case and shows resubmission guidance when the review was DENIED", async () => {
    const user = userEvent.setup();
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({
        status: {
          hasAwsAccounts: true,
          sandboxStatus: true,
          productionAccessRequest: { status: "DENIED", caseId: "case-4242" },
        },
      })
    );

    render(<GoLiveBanner orgSlug="test-org" />);

    expect(screen.getByText(/denied/i)).toBeInTheDocument();
    expect(screen.getByText(/case-4242/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /request production access/i })
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/case-4242/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/denial isn't final/i)).toBeInTheDocument();
  });

  it("never claims Wraps submits or approves the request", async () => {
    const user = userEvent.setup();
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({
        status: {
          hasAwsAccounts: true,
          sandboxStatus: true,
          productionAccessRequest: null,
          sandboxRegion: "us-east-1",
        },
      })
    );

    render(<GoLiveBanner orgSlug="test-org" />);
    await user.click(
      screen.getByRole("button", { name: /request production access/i })
    );

    const dialog = screen.getByRole("dialog");
    const text = dialog.textContent ?? "";
    expect(text).not.toMatch(/we('ll| will) (submit|file|send) /i);
    expect(text).not.toMatch(/approv(ed|al) (in|within)/i);
    expect(text).not.toMatch(/wraps (submits|files|approves)/i);
  });

  it("reframes the CTA copy, still pointing at the docs, when the review is PENDING", () => {
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({
        status: {
          hasAwsAccounts: true,
          sandboxStatus: true,
          productionAccessRequest: { status: "PENDING", caseId: "case-1111" },
        },
      })
    );

    render(<GoLiveBanner orgSlug="test-org" />);

    expect(screen.getByText(/AWS is reviewing it/i)).toBeInTheDocument();
    // The label must not claim a case-specific destination the link doesn't
    // reach — it only ever points at AWS's production-access docs.
    expect(
      screen.queryByRole("link", { name: /check the case/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view production access docs/i })
    ).toHaveAttribute(
      "href",
      "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html"
    );
    // PENDING never gets the dialog CTA — only the docs link.
    expect(
      screen.queryByRole("button", { name: /view production access docs/i })
    ).not.toBeInTheDocument();
  });

  it("goes quiet once the account is out of the sandbox", () => {
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({ status: { hasAwsAccounts: true, sandboxStatus: false } })
    );

    const { container } = render(<GoLiveBanner orgSlug="test-org" />);

    expect(container.innerHTML).toBe("");
  });

  it("stays quiet rather than guessing when sandbox status is unknown", () => {
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({ status: { hasAwsAccounts: true, sandboxStatus: null } })
    );

    const { container } = render(<GoLiveBanner orgSlug="test-org" />);

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing until the products status has hydrated", () => {
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({ status: null })
    );

    const { container } = render(<GoLiveBanner orgSlug="test-org" />);

    expect(container.innerHTML).toBe("");
  });

  it("dismissing the connect step does not hide the sandbox step", async () => {
    const user = userEvent.setup();
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({ status: { hasAwsAccounts: false } })
    );

    const { unmount } = render(<GoLiveBanner orgSlug="test-org" />);
    await user.click(screen.getByRole("button", { name: /dismiss banner/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();

    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({ status: { hasAwsAccounts: true, sandboxStatus: true } })
    );
    render(<GoLiveBanner orgSlug="test-org" />);

    expect(screen.getByText(/in the SES sandbox/i)).toBeInTheDocument();
  });

  it("Get Started link points to /{orgSlug}/setup", () => {
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({ status: { hasAwsAccounts: false } })
    );

    render(<GoLiveBanner orgSlug="my-company" />);

    const link = screen.getByRole("link", { name: /get started/i });
    expect(link).toHaveAttribute("href", "/my-company/setup");
  });

  it("dismiss button hides banner and sets sessionStorage", async () => {
    const user = userEvent.setup();
    mockUseProductsStore.mockImplementation((selector: any) =>
      selector({ status: { hasAwsAccounts: false } })
    );

    render(<GoLiveBanner orgSlug="test-org" />);

    expect(screen.getByRole("status")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /dismiss banner/i }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mockSessionStorage.get("go-live-banner-dismissed-test-org")).toBe(
      "true"
    );
  });
});
