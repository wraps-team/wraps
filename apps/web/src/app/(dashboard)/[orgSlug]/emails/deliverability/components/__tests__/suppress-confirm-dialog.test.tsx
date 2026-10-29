/**
 * Suppress confirmation: the copy names what will happen, targets run one after
 * another with their own reason and account, and a partial failure keeps the
 * dialog open so only the failed targets are retried.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockAddSuppression = vi.fn();
vi.mock("@/actions/suppressions", () => ({
  addSuppression: (...args: unknown[]) => mockAddSuppression(...args),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

import {
  SuppressConfirmDialog,
  type SuppressTarget,
} from "../suppress-confirm-dialog";

const ORG_ID = "org-confirm-test";
const ONE_ACCOUNT = [{ id: "aws-1", name: "Production", region: "us-east-1" }];
const TWO_ACCOUNTS = [
  ...ONE_ACCOUNT,
  { id: "aws-2", name: "Staging", region: "eu-west-1" },
];

function renderDialog(
  targets: SuppressTarget[],
  overrides: Partial<{
    accounts: typeof ONE_ACCOUNT;
    onDone: (result: { added: number; failed: number }) => void;
    onOpenChange: (open: boolean) => void;
  }> = {}
) {
  const onDone = overrides.onDone ?? vi.fn();
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  render(
    <SuppressConfirmDialog
      accounts={overrides.accounts ?? ONE_ACCOUNT}
      onDone={onDone}
      onOpenChange={onOpenChange}
      open
      organizationId={ORG_ID}
      targets={targets}
    />
  );
  return { onDone, onOpenChange };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SuppressConfirmDialog", () => {
  it("names the one address and says SES will stop sending to it", async () => {
    renderDialog([
      { address: "one@example.com", reason: "BOUNCE", awsAccountId: "aws-1" },
    ]);
    expect(
      await screen.findByText("Suppress one@example.com?")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "SES will stop sending to this address. You can remove it later from the Suppressed tab."
      )
    ).toBeInTheDocument();
  });

  it("lists at most five addresses and then the count of the rest", async () => {
    const targets = Array.from({ length: 7 }, (_, i) => ({
      address: `user${i}@example.com`,
      reason: "BOUNCE" as const,
      awsAccountId: "aws-1",
    }));
    renderDialog(targets);
    expect(
      await screen.findByText("Suppress 7 addresses?")
    ).toBeInTheDocument();
    expect(screen.getByText("user4@example.com")).toBeInTheDocument();
    expect(screen.queryByText("user5@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("and 2 more")).toBeInTheDocument();
  });

  it("runs each target in order with its own reason and account", async () => {
    const user = userEvent.setup();
    mockAddSuppression.mockImplementation(
      async (_org: string, _acct: string, email: string) => ({
        success: true,
        email,
        alreadyPresent: false,
      })
    );
    const { onDone } = renderDialog([
      { address: "a@example.com", reason: "BOUNCE", awsAccountId: "aws-1" },
      { address: "b@example.com", reason: "COMPLAINT", awsAccountId: "aws-2" },
    ]);
    await user.click(
      await screen.findByRole("button", { name: "Suppress all 2" })
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mockAddSuppression.mock.calls).toEqual([
      [ORG_ID, "aws-1", "a@example.com", "BOUNCE"],
      [ORG_ID, "aws-2", "b@example.com", "COMPLAINT"],
    ]);
    expect(onDone).toHaveBeenCalledWith({ added: 2, failed: 0 });
    expect(toast.success).toHaveBeenCalledWith(
      "2 added to the suppression list"
    );
  });

  it("uses the only account for a target that has none recorded", async () => {
    const user = userEvent.setup();
    mockAddSuppression.mockResolvedValue({
      success: true,
      email: "c@example.com",
      alreadyPresent: false,
    });
    renderDialog([
      { address: "c@example.com", reason: "BOUNCE", awsAccountId: null },
    ]);
    await user.click(await screen.findByRole("button", { name: "Suppress" }));
    await waitFor(() => expect(mockAddSuppression).toHaveBeenCalledTimes(1));
    expect(mockAddSuppression.mock.calls[0]).toEqual([
      ORG_ID,
      "aws-1",
      "c@example.com",
      "BOUNCE",
    ]);
  });

  it("holds the confirm button until an account is picked when there are two", async () => {
    renderDialog(
      [{ address: "d@example.com", reason: "BOUNCE", awsAccountId: null }],
      { accounts: TWO_ACCOUNTS }
    );
    expect(await screen.findByText("AWS account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suppress" })).toBeDisabled();
  });

  it("says a repeat add is already on the list", async () => {
    const user = userEvent.setup();
    mockAddSuppression.mockResolvedValue({
      success: true,
      email: "e@example.com",
      alreadyPresent: true,
    });
    renderDialog([
      { address: "e@example.com", reason: "BOUNCE", awsAccountId: "aws-1" },
    ]);
    await user.click(await screen.findByRole("button", { name: "Suppress" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "e@example.com is already on the suppression list"
      )
    );
  });

  it("keeps the dialog open after a partial failure and retries only the failed target", async () => {
    const user = userEvent.setup();
    mockAddSuppression
      .mockResolvedValueOnce({
        success: true,
        email: "f@example.com",
        alreadyPresent: false,
      })
      .mockResolvedValueOnce({ success: false, error: "No permission" })
      .mockResolvedValueOnce({
        success: true,
        email: "g@example.com",
        alreadyPresent: false,
      });
    const { onDone, onOpenChange } = renderDialog([
      { address: "f@example.com", reason: "BOUNCE", awsAccountId: "aws-1" },
      { address: "h@example.com", reason: "BOUNCE", awsAccountId: "aws-1" },
      { address: "g@example.com", reason: "BOUNCE", awsAccountId: "aws-1" },
    ]);

    await user.click(
      await screen.findByRole("button", { name: "Suppress all 3" })
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledWith({ added: 2, failed: 1 });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(
      await screen.findByText("Suppressed 2 of 3. 1 failed.")
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("1 failed. No permission");

    mockAddSuppression.mockClear();
    mockAddSuppression.mockResolvedValueOnce({
      success: true,
      email: "h@example.com",
      alreadyPresent: false,
    });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(2));
    expect(mockAddSuppression.mock.calls).toEqual([
      [ORG_ID, "aws-1", "h@example.com", "BOUNCE"],
    ]);
  });

  it("disables the buttons while the run is pending", async () => {
    const user = userEvent.setup();
    let finish: (value: unknown) => void = () => undefined;
    mockAddSuppression.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderDialog([
      { address: "p@example.com", reason: "BOUNCE", awsAccountId: "aws-1" },
    ]);
    await user.click(await screen.findByRole("button", { name: "Suppress" }));
    expect(
      await screen.findByRole("button", { name: "Suppressing..." })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    finish({ success: true, email: "p@example.com", alreadyPresent: false });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Suppressing..." })
      ).not.toBeInTheDocument()
    );
  });
});
