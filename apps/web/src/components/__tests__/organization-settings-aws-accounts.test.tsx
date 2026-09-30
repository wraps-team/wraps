/**
 * OrganizationSettingsAwsAccounts tests
 *
 * The list is rendered from server-provided rows. After a connect or remove
 * succeeds the component calls `router.refresh()` so the server re-reads the
 * rows; there is no client-side reload to regress any more. Also pins that the
 * account name links to the detail page for every role (viewers with a
 * per-account grant must be able to navigate), and that an account nobody has
 * checked is never shown as healthy.
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

const refresh = vi.fn();

vi.mock("@/actions/aws-accounts", () => ({
  deleteAWSAccount: vi.fn(),
  connectAWSAccountAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "test-org" }),
  useRouter: () => ({ refresh }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

import { toast } from "sonner";
import {
  connectAWSAccountAction,
  deleteAWSAccount,
} from "@/actions/aws-accounts";
import type { AccountRow } from "@/lib/aws/account-status";
import { OrganizationSettingsAwsAccounts } from "../organization-settings-aws-accounts";

const organization = { id: "org-1", name: "Test Org" };

function account(
  id: string,
  name: string,
  overrides: Partial<AccountRow> = {}
) {
  return {
    id,
    name,
    accountId: "111122223333",
    region: "us-east-1",
    emailEnabled: true,
    smsEnabled: false,
    status: { level: "unknown", label: "Not checked yet", detail: null },
    lastEventAt: null,
    ...overrides,
  } satisfies AccountRow;
}

async function openRowMenu(
  user: ReturnType<typeof userEvent.setup>,
  name: string
) {
  await user.click(screen.getByRole("button", { name: `Actions for ${name}` }));
}

describe("OrganizationSettingsAwsAccounts", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders one row per account with the name linking to the detail page for a member", () => {
    render(
      <OrganizationSettingsAwsAccounts
        accounts={[account("a1", "Prod"), account("a2", "Staging")]}
        organization={organization}
        selfHosted={false}
        unlimited={true}
        userRole="member"
      />
    );

    expect(screen.getByRole("link", { name: "Prod" })).toHaveAttribute(
      "href",
      "/test-org/settings/aws-accounts/a1"
    );
    expect(screen.getByRole("link", { name: "Staging" })).toHaveAttribute(
      "href",
      "/test-org/settings/aws-accounts/a2"
    );
    // header row + two account rows
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("hides Connect, Access and Remove from a member", async () => {
    const user = userEvent.setup();
    render(
      <OrganizationSettingsAwsAccounts
        accounts={[account("a1", "Prod")]}
        organization={organization}
        selfHosted={false}
        unlimited={true}
        userRole="member"
      />
    );

    expect(
      screen.queryByRole("button", { name: "Connect account" })
    ).not.toBeInTheDocument();

    await openRowMenu(user, "Prod");
    const openItem = await screen.findByRole("menuitem", { name: "Open" });
    expect(openItem).toHaveAttribute(
      "href",
      "/test-org/settings/aws-accounts/a1"
    );
    expect(
      screen.queryByRole("menuitem", { name: "Access" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Remove from Wraps..." })
    ).not.toBeInTheDocument();
  });

  it("shows Connect, Access and Remove to an owner", async () => {
    const user = userEvent.setup();
    render(
      <OrganizationSettingsAwsAccounts
        accounts={[account("a1", "Prod")]}
        organization={organization}
        selfHosted={false}
        unlimited={true}
        userRole="owner"
      />
    );

    expect(
      screen.getByRole("button", { name: "Connect account" })
    ).toBeEnabled();

    await openRowMenu(user, "Prod");
    expect(
      await screen.findByRole("menuitem", { name: "Access" })
    ).toHaveAttribute("href", "/test-org/settings/aws-accounts/a1/permissions");
    expect(
      screen.getByRole("menuitem", { name: "Remove from Wraps..." })
    ).toBeInTheDocument();
  });

  it("refreshes the server data and closes the dialog after a successful connect", async () => {
    const user = userEvent.setup();
    vi.mocked(connectAWSAccountAction).mockResolvedValue({
      success: true,
    } as never);

    render(
      <OrganizationSettingsAwsAccounts
        accounts={[account("a1", "Prod")]}
        organization={organization}
        selfHosted={false}
        unlimited={true}
        userRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: "Connect account" }));

    const dialog = screen.getByRole("dialog");
    const submitButton = await within(dialog).findByRole("button", {
      name: "Connect Account",
    });
    await user.click(submitButton);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(toast.success).toHaveBeenCalledWith(
      "AWS account connected successfully"
    );
  });

  it("refreshes after a successful remove", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteAWSAccount).mockResolvedValue({ success: true });

    render(
      <OrganizationSettingsAwsAccounts
        accounts={[account("a1", "Prod"), account("a2", "Staging")]}
        organization={organization}
        selfHosted={false}
        userRole="owner"
      />
    );

    await openRowMenu(user, "Staging");
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove from Wraps..." })
    );
    expect(
      await screen.findByRole("heading", { name: "Remove from Wraps?" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove account" }));

    await waitFor(() =>
      expect(deleteAWSAccount).toHaveBeenCalledWith("a2", "org-1")
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not refresh and shows an error toast when remove fails", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteAWSAccount).mockResolvedValue({
      success: false,
      error: "nope",
    });

    render(
      <OrganizationSettingsAwsAccounts
        accounts={[account("a1", "Prod"), account("a2", "Staging")]}
        organization={organization}
        selfHosted={false}
        userRole="owner"
      />
    );

    await openRowMenu(user, "Staging");
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove from Wraps..." })
    );
    await user.click(
      await screen.findByRole("button", { name: "Remove account" })
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("nope"));
    expect(deleteAWSAccount).toHaveBeenCalledWith("a2", "org-1");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows an unchecked account as Not checked yet, never Healthy", () => {
    render(
      <OrganizationSettingsAwsAccounts
        accounts={[account("a1", "Prod")]}
        organization={organization}
        selfHosted={false}
        unlimited={true}
        userRole="owner"
      />
    );

    expect(screen.getByText("Not checked yet")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
  });

  it("renders the first-account empty state when there are no accounts", () => {
    render(
      <OrganizationSettingsAwsAccounts
        accounts={[]}
        organization={organization}
        selfHosted={false}
        unlimited={true}
        userRole="owner"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Connect your first AWS account" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect account" })
    ).toBeInTheDocument();
  });
});
