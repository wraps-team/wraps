/**
 * Unsaved Changes Guard Tests
 *
 * Tests for the back button confirmation dialog when workflow has unsaved changes.
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { UnsavedChangesGuard } from "../unsaved-changes-guard";

describe("UnsavedChangesGuard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("should show confirmation dialog when clicking back while dirty", async () => {
    const user = userEvent.setup();

    render(<UnsavedChangesGuard href="/test/automations" isDirty={true} />);

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByText(/you have unsaved changes/i)).toBeInTheDocument();
  });

  it("should navigate directly when clicking back while clean", async () => {
    const user = userEvent.setup();

    render(<UnsavedChangesGuard href="/test/automations" isDirty={false} />);

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(mockPush).toHaveBeenCalledWith("/test/automations");
    expect(
      screen.queryByText(/you have unsaved changes/i)
    ).not.toBeInTheDocument();
  });

  it("should navigate away when clicking Leave in the dialog", async () => {
    const user = userEvent.setup();

    render(<UnsavedChangesGuard href="/test/automations" isDirty={true} />);

    // Open the dialog
    await user.click(screen.getByRole("button", { name: /back/i }));

    // Click Leave
    await user.click(screen.getByRole("button", { name: /leave/i }));

    expect(mockPush).toHaveBeenCalledWith("/test/automations");
  });

  it("should close dialog and stay on page when clicking Cancel", async () => {
    const user = userEvent.setup();

    render(<UnsavedChangesGuard href="/test/automations" isDirty={true} />);

    // Open the dialog
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText(/you have unsaved changes/i)).toBeInTheDocument();

    // Click Cancel
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(
        screen.queryByText(/you have unsaved changes/i)
      ).not.toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
