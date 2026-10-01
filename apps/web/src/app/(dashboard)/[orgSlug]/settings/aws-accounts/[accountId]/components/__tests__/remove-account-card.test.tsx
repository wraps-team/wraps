// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const deleteAWSAccount = vi.fn();
const push = vi.fn();

vi.mock("@/actions/aws-accounts", () => ({
  deleteAWSAccount: (...args: unknown[]) => deleteAWSAccount(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { RemoveAccountCard } from "../remove-account-card";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function openDialog() {
  render(
    <RemoveAccountCard
      accountName="production"
      awsAccountId="acct-1"
      organizationId="org-1"
      orgSlug="acme"
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove account..." }));
  return screen.getByRole("alertdialog");
}

describe("RemoveAccountCard", () => {
  it("keeps confirm disabled until the exact account name is typed", () => {
    const dialog = openDialog();
    const confirm = within(dialog).getByRole("button", {
      name: "Remove account",
    });
    const input = within(dialog).getByLabelText(
      "Type the account name to confirm"
    );

    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "producti" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "production" } });
    expect(confirm).toBeEnabled();
  });

  it("removes the account and goes back to the accounts list", async () => {
    deleteAWSAccount.mockResolvedValue({ success: true });
    const dialog = openDialog();

    fireEvent.change(
      within(dialog).getByLabelText("Type the account name to confirm"),
      { target: { value: "production" } }
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove account" })
    );

    await waitFor(() =>
      expect(deleteAWSAccount).toHaveBeenCalledWith("acct-1", "org-1")
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/acme/settings/aws-accounts")
    );
  });

  it("says nothing in the AWS account is deleted", () => {
    const dialog = openDialog();

    expect(
      within(dialog).getByText(/Nothing in your AWS account is deleted/)
    ).toBeInTheDocument();
  });
});
