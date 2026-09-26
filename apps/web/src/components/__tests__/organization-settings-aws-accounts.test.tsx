/**
 * OrganizationSettingsAwsAccounts tests
 *
 * Regression coverage for the bug where connecting or deleting an AWS account
 * succeeded on the server and showed a success toast, but the on-screen list
 * never changed: the handlers called `refreshData()`, which bumped a
 * `refreshKey` state value the data-loading `useEffect` no longer depended
 * on (dropped in lint sweep 6cd456e8). Also covers the initial-load fetch,
 * which awaited `listAWSAccounts` with no error handling, so a network
 * failure (Safari: "TypeError: Load failed") escaped as an unhandled
 * rejection instead of surfacing a toast.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/aws-accounts", () => ({
  listAWSAccounts: vi.fn(),
  deleteAWSAccount: vi.fn(),
  connectAWSAccountAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "test-org" }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

import { toast } from "sonner";
import type { AWSAccountWithCreator } from "@/actions/aws-accounts";
import {
  connectAWSAccountAction,
  deleteAWSAccount,
  listAWSAccounts,
} from "@/actions/aws-accounts";
import { OrganizationSettingsAwsAccounts } from "../organization-settings-aws-accounts";

const organization = { id: "org-1", name: "Test Org" };

function account(id: string, name: string) {
  return {
    id,
    name,
    accountId: "111122223333",
    region: "us-east-1",
    isVerified: true,
    createdAt: new Date("2026-01-01"),
    createdBy: null,
  } as unknown as AWSAccountWithCreator;
}

describe("OrganizationSettingsAwsAccounts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a newly connected account without a page reload", async () => {
    const user = userEvent.setup();
    vi.mocked(listAWSAccounts)
      .mockResolvedValueOnce({
        success: true,
        accounts: [account("a1", "Prod")],
      })
      .mockResolvedValueOnce({
        success: true,
        accounts: [account("a1", "Prod"), account("a2", "Staging")],
      });

    vi.mocked(connectAWSAccountAction).mockResolvedValue({
      success: true,
    } as never);

    render(
      <OrganizationSettingsAwsAccounts
        organization={organization}
        selfHosted={false}
        unlimited={true}
        userRole="owner"
      />
    );

    await screen.findByText("Prod");

    await user.click(screen.getByRole("button", { name: "Connect Account" }));

    const dialog = screen.getByRole("dialog");
    const submitButton = await within(dialog).findByRole("button", {
      name: "Connect Account",
    });
    await user.click(submitButton);

    expect(await screen.findByText("Staging")).toBeInTheDocument();
    expect(listAWSAccounts).toHaveBeenCalledTimes(2);
  });

  it("removes a deleted account without a page reload", async () => {
    const user = userEvent.setup();
    vi.mocked(listAWSAccounts)
      .mockResolvedValueOnce({
        success: true,
        accounts: [account("a1", "Prod"), account("a2", "Staging")],
      })
      .mockResolvedValueOnce({
        success: true,
        accounts: [account("a1", "Prod")],
      });
    vi.mocked(deleteAWSAccount).mockResolvedValue({ success: true });

    render(
      <OrganizationSettingsAwsAccounts
        organization={organization}
        selfHosted={false}
        userRole="owner"
      />
    );

    await screen.findByText("Staging");

    await user.click(screen.getByRole("button", { name: /delete staging/i }));
    await user.click(screen.getByRole("button", { name: "Delete Account" }));

    await waitFor(() =>
      expect(screen.queryByText("Staging")).not.toBeInTheDocument()
    );
    expect(deleteAWSAccount).toHaveBeenCalledWith("a2", "org-1");
  });

  it("does not reload when delete fails", async () => {
    const user = userEvent.setup();
    vi.mocked(listAWSAccounts).mockResolvedValueOnce({
      success: true,
      accounts: [account("a1", "Prod"), account("a2", "Staging")],
    });
    vi.mocked(deleteAWSAccount).mockResolvedValue({
      success: false,
      error: "nope",
    });

    render(
      <OrganizationSettingsAwsAccounts
        organization={organization}
        selfHosted={false}
        userRole="owner"
      />
    );

    await screen.findByText("Staging");

    await user.click(screen.getByRole("button", { name: /delete staging/i }));
    await user.click(screen.getByRole("button", { name: "Delete Account" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("nope"));
    expect(listAWSAccounts).toHaveBeenCalledTimes(1);
  });

  it("surfaces a toast instead of an unhandled rejection when the initial load throws", async () => {
    vi.mocked(listAWSAccounts).mockRejectedValue(new TypeError("Load failed"));

    render(
      <OrganizationSettingsAwsAccounts
        organization={organization}
        selfHosted={false}
        userRole="owner"
      />
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(
      await screen.findByText("No AWS Accounts Connected")
    ).toBeInTheDocument();
  });
});
