// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const renameAWSAccountAction = vi.fn();
const refresh = vi.fn();

vi.mock("@/actions/aws-accounts", () => ({
  renameAWSAccountAction: (...args: unknown[]) =>
    renameAWSAccountAction(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { RenameAccountForm } from "../rename-account-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderForm() {
  return render(
    <RenameAccountForm
      awsAccountId="acct-1"
      initialName="AWS Account (123)"
      organizationId="org-1"
    />
  );
}

describe("RenameAccountForm", () => {
  it("submits the new name and refreshes the page", async () => {
    renameAWSAccountAction.mockResolvedValue({ success: true });
    renderForm();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "production" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(renameAWSAccountAction).toHaveBeenCalledWith(
        "acct-1",
        "production",
        "org-1"
      )
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the validation message and makes no call for an empty name", async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(renameAWSAccountAction).not.toHaveBeenCalled();
  });
});
