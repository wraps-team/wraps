/**
 * Add address dialog: submit gating, the payload it sends, the account picker
 * (only with 2+ accounts), and toast/dialog behaviour for each result.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAddSuppression = vi.fn();
vi.mock("@/actions/suppressions", () => ({
  addSuppression: (...args: unknown[]) => mockAddSuppression(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { toast } from "sonner";
import { AddSuppressionDialog } from "../add-suppression-dialog";

const ORG_ID = "org-add-suppression-test";
const ONE_ACCOUNT = [{ id: "aws-one", name: "Prod", region: "us-east-1" }];
const TWO_ACCOUNTS = [
  { id: "aws-one", name: "Prod", region: "us-east-1" },
  { id: "aws-two", name: "Staging", region: "eu-west-1" },
];

async function openDialog() {
  await userEvent.click(screen.getByRole("button", { name: /add address/i }));
  return screen.findByRole("dialog");
}

function submitButton() {
  return screen.getByRole("button", { name: /add to suppression list/i });
}

describe("AddSuppressionDialog", () => {
  beforeEach(() => {
    mockAddSuppression.mockReset();
    mockRefresh.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps submit disabled until the address contains an @", async () => {
    render(
      <AddSuppressionDialog accounts={ONE_ACCOUNT} organizationId={ORG_ID} />
    );
    await openDialog();

    expect(submitButton()).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/email address/i), "no-at-sign");
    expect(submitButton()).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText(/email address/i),
      "@example.com"
    );
    expect(submitButton()).toBeEnabled();
  });

  it("submits the typed address, the chosen reason and the account id", async () => {
    mockAddSuppression.mockResolvedValue({
      success: true,
      email: "typed@example.com",
      alreadyPresent: false,
    });
    render(
      <AddSuppressionDialog accounts={ONE_ACCOUNT} organizationId={ORG_ID} />
    );
    await openDialog();

    await userEvent.type(
      screen.getByLabelText(/email address/i),
      "  typed@example.com "
    );
    await userEvent.click(screen.getByRole("button", { name: /complaint/i }));
    await userEvent.click(submitButton());

    await waitFor(() => expect(mockAddSuppression).toHaveBeenCalledTimes(1));
    expect(mockAddSuppression).toHaveBeenCalledWith(
      ORG_ID,
      "aws-one",
      "typed@example.com",
      "COMPLAINT"
    );
  });

  it("defaults the reason to Bounce", async () => {
    mockAddSuppression.mockResolvedValue({
      success: true,
      email: "b@example.com",
      alreadyPresent: false,
    });
    render(
      <AddSuppressionDialog accounts={ONE_ACCOUNT} organizationId={ORG_ID} />
    );
    await openDialog();

    expect(screen.getByRole("button", { name: /bounce/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await userEvent.type(
      screen.getByLabelText(/email address/i),
      "b@example.com"
    );
    await userEvent.click(submitButton());

    await waitFor(() => expect(mockAddSuppression).toHaveBeenCalledTimes(1));
    expect(mockAddSuppression.mock.calls[0][3]).toBe("BOUNCE");
  });

  it("shows the account picker only with two or more accounts", async () => {
    const { unmount } = render(
      <AddSuppressionDialog accounts={ONE_ACCOUNT} organizationId={ORG_ID} />
    );
    await openDialog();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    unmount();

    render(
      <AddSuppressionDialog accounts={TWO_ACCOUNTS} organizationId={ORG_ID} />
    );
    await openDialog();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows the already-present toast when the server reports alreadyPresent", async () => {
    mockAddSuppression.mockResolvedValue({
      success: true,
      email: "dup@example.com",
      alreadyPresent: true,
    });
    render(
      <AddSuppressionDialog accounts={ONE_ACCOUNT} organizationId={ORG_ID} />
    );
    await openDialog();

    await userEvent.type(
      screen.getByLabelText(/email address/i),
      "dup@example.com"
    );
    await userEvent.click(submitButton());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "dup@example.com is already on the suppression list"
      )
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("shows the added toast on a new suppression", async () => {
    mockAddSuppression.mockResolvedValue({
      success: true,
      email: "new@example.com",
      alreadyPresent: false,
    });
    render(
      <AddSuppressionDialog accounts={ONE_ACCOUNT} organizationId={ORG_ID} />
    );
    await openDialog();

    await userEvent.type(
      screen.getByLabelText(/email address/i),
      "new@example.com"
    );
    await userEvent.click(submitButton());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "new@example.com added to the suppression list"
      )
    );
  });

  it("on an error result shows the error toast and keeps the dialog open", async () => {
    mockAddSuppression.mockResolvedValue({
      success: false,
      error: "Enter a valid email address.",
    });
    render(
      <AddSuppressionDialog accounts={ONE_ACCOUNT} organizationId={ORG_ID} />
    );
    const dialog = await openDialog();

    await userEvent.type(screen.getByLabelText(/email address/i), "x@y");
    await userEvent.click(submitButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Enter a valid email address.")
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });
});
