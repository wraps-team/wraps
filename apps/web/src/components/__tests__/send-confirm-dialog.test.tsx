/**
 * SendConfirmDialog Tests
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SendConfirmDialog } from "../send-confirm-dialog";

describe("SendConfirmDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("should render title and recipient count when open", () => {
    render(
      <SendConfirmDialog
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={1500}
        variant="send"
      />
    );

    expect(screen.getByText("Confirm send")).toBeInTheDocument();
    expect(screen.getByText(/1,500 contacts/)).toBeInTheDocument();
  });

  it("should call onConfirm when Send now is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <SendConfirmDialog
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={100}
        variant="send"
      />
    );

    await user.click(screen.getByRole("button", { name: /send now/i }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("should not call onConfirm when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <SendConfirmDialog
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={100}
        variant="send"
      />
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("should show schedule variant with different title and button", () => {
    render(
      <SendConfirmDialog
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={2000}
        variant="schedule"
      />
    );

    expect(screen.getByText("Confirm schedule")).toBeInTheDocument();
    expect(screen.getByText(/2,000 contacts/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^schedule$/i })
    ).toBeInTheDocument();
  });

  it("should show loading state when loading is true", () => {
    render(
      <SendConfirmDialog
        loading={true}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={100}
        variant="send"
      />
    );

    expect(
      screen.getByRole("button", { name: /sending/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
  });

  it("should open dialog on trigger click, then call onConfirm on confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    function TestHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">
            Send to 500 contacts
          </button>
          <SendConfirmDialog
            onConfirm={onConfirm}
            onOpenChange={setOpen}
            open={open}
            recipientCount={500}
            variant="send"
          />
        </>
      );
    }

    render(<TestHarness />);

    // Dialog should not be visible initially
    expect(screen.queryByText("Confirm send")).not.toBeInTheDocument();

    // Click the send button — opens dialog
    await user.click(screen.getByText("Send to 500 contacts"));
    expect(screen.getByText("Confirm send")).toBeInTheDocument();

    // Confirm — calls onConfirm
    await user.click(screen.getByRole("button", { name: /send now/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("should open dialog on trigger click but NOT call onConfirm on cancel", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    function TestHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">
            Send to 200 contacts
          </button>
          <SendConfirmDialog
            onConfirm={onConfirm}
            onOpenChange={setOpen}
            open={open}
            recipientCount={200}
            variant="send"
          />
        </>
      );
    }

    render(<TestHarness />);

    // Click the send button — opens dialog
    await user.click(screen.getByText("Send to 200 contacts"));
    expect(screen.getByText("Confirm send")).toBeInTheDocument();

    // Cancel — does NOT call onConfirm
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onConfirm).not.toHaveBeenCalled();

    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByText("Confirm send")).not.toBeInTheDocument();
    });
  });

  it("should name the other in-flight broadcasts and their remaining recipients when inFlightBatches is set", () => {
    render(
      <SendConfirmDialog
        inFlightBatches={2}
        inFlightRecipients={29_849}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={1500}
        variant="send"
      />
    );

    expect(
      screen.getByText(/2 other broadcasts on this AWS account still have/)
    ).toBeInTheDocument();
    expect(screen.getByText(/29,849 recipients to send/)).toBeInTheDocument();
    expect(
      screen.getByText(/shares the same daily quota with them/)
    ).toBeInTheDocument();
  });

  it("should render the same description as before when inFlightBatches/inFlightRecipients are omitted", () => {
    render(
      <SendConfirmDialog
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={1500}
        variant="send"
      />
    );

    expect(
      screen.getByText(
        "This will immediately send emails to 1,500 contacts. This action cannot be undone."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/other broadcast/)).not.toBeInTheDocument();
  });

  it("should never render a fabricated 0-contact number when recipientCount is null (send variant)", () => {
    render(
      <SendConfirmDialog
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={null}
        variant="send"
      />
    );

    expect(screen.queryByText(/0 contacts/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/This will immediately send emails to/)
    ).not.toBeInTheDocument();
  });

  it("should say the count could not be loaded when recipientCount is null", () => {
    render(
      <SendConfirmDialog
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={null}
        variant="send"
      />
    );

    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it("should disable confirmation and never call onConfirm when recipientCount is null", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <SendConfirmDialog
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={null}
        variant="send"
      />
    );

    const confirmButton = screen.getByRole("button", { name: /send now/i });
    expect(confirmButton).toBeDisabled();

    await user.click(confirmButton);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("should never render a fabricated 0-contact number when recipientCount is null (schedule variant)", () => {
    render(
      <SendConfirmDialog
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={null}
        variant="schedule"
      />
    );

    expect(screen.queryByText(/0 contacts/)).not.toBeInTheDocument();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it("names the audience, not just the size (M14)", () => {
    // A right-size, wrong-segment send is invisible when only a count is shown.
    render(
      <SendConfirmDialog
        audienceLabel="Segment: Trial expiring"
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={1500}
        variant="send"
      />
    );

    expect(
      screen.getByText(/1,500 contacts in Segment: Trial expiring/)
    ).toBeInTheDocument();
  });

  it("says the count is provisional when it will be recounted (M7)", () => {
    render(
      <SendConfirmDialog
        countIsProvisional
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={1500}
        variant="send"
      />
    );

    expect(
      screen.getByText(/re-resolved when sending starts/i)
    ).toBeInTheDocument();
  });

  it("omits the provisional note when the count is final", () => {
    render(
      <SendConfirmDialog
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={1500}
        variant="send"
      />
    );

    expect(
      screen.queryByText(/re-resolved when sending starts/i)
    ).not.toBeInTheDocument();
  });

  it("names the timezone on a scheduled send (H10)", () => {
    render(
      <SendConfirmDialog
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
        recipientCount={200}
        scheduledDate={new Date("2026-09-01T15:00:00Z")}
        timeZoneLabel="America/Denver"
        variant="schedule"
      />
    );

    expect(screen.getByText(/America\/Denver/)).toBeInTheDocument();
  });
});
