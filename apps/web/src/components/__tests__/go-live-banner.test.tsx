/**
 * GoLiveBanner Tests
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
      screen.getByRole("link", { name: /request production access/i })
    ).toHaveAttribute(
      "href",
      "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html"
    );
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
