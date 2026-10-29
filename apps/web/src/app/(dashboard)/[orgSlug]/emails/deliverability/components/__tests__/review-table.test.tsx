/**
 * Review table: the status decides the action (Suppress or On SES list), a row
 * opens the detail, and the Suppress button never opens it. The soft tab shows
 * the soft-bounce days.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewRow } from "@/actions/address-review";
import { ReviewTable } from "../review-table";

function row(overrides: Partial<ReviewRow> & { address: string }): ReviewRow {
  return {
    kinds: ["hard"],
    why: "Hard bounce",
    soft: 0,
    hard: 1,
    complaints: 0,
    softDays: 0,
    lastEventAt: "2026-10-20T10:00:00.000Z",
    awsAccountId: "aws-1",
    status: "not_listed",
    listedReason: null,
    reasonToSuppress: "BOUNCE",
    recommended: true,
    ...overrides,
  };
}

const ROWS: ReviewRow[] = [
  row({ address: "bounce@example.com" }),
  row({
    address: "listed@example.com",
    status: "listed",
    listedReason: "BOUNCE",
  }),
  row({
    address: "unknown@example.com",
    status: "unknown",
    why: "Complaint",
    complaints: 2,
    hard: 0,
    reasonToSuppress: "COMPLAINT",
  }),
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReviewTable", () => {
  it("shows Suppress for unlisted and unknown rows, and On SES list for listed rows", () => {
    render(
      <ReviewTable
        list="recommended"
        onOpen={vi.fn()}
        onSuppress={vi.fn()}
        rows={ROWS}
      />
    );
    expect(
      screen.getByRole("button", { name: "Suppress bounce@example.com" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Suppress unknown@example.com" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Suppress listed@example.com" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("On SES list")).toBeInTheDocument();
  });

  it("notes an unknown SES status and still offers Suppress", () => {
    render(
      <ReviewTable
        list="recommended"
        onOpen={vi.fn()}
        onSuppress={vi.fn()}
        rows={ROWS}
      />
    );
    expect(screen.getByText("SES status unknown")).toBeInTheDocument();
  });

  it("shows the event counts, omitting zeros", () => {
    render(
      <ReviewTable
        list="recommended"
        onOpen={vi.fn()}
        onSuppress={vi.fn()}
        rows={ROWS}
      />
    );
    const bounceRow = screen.getByText("bounce@example.com").closest("tr");
    expect(bounceRow).not.toBeNull();
    expect(within(bounceRow as HTMLElement).getByText("Hard 1")).toBeVisible();
    expect(
      within(bounceRow as HTMLElement).queryByText(/Soft/)
    ).not.toBeInTheDocument();
  });

  it("shows soft-bounce days on the soft tab", () => {
    render(
      <ReviewTable
        list="soft"
        onOpen={vi.fn()}
        onSuppress={vi.fn()}
        rows={[
          row({
            address: "soft@example.com",
            kinds: ["soft"],
            why: "Soft bounced on 3 days",
            soft: 4,
            hard: 0,
            softDays: 3,
            reasonToSuppress: "BOUNCE",
          }),
        ]}
      />
    );
    expect(screen.getByText("Soft 4 · 3 soft-bounce days")).toBeInTheDocument();
  });

  it("opens the row from a row click", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <ReviewTable
        list="recommended"
        onOpen={onOpen}
        onSuppress={vi.fn()}
        rows={ROWS}
      />
    );
    const bounceRow = screen.getByText("bounce@example.com").closest("tr");
    await user.click(within(bounceRow as HTMLElement).getByText("Hard bounce"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].address).toBe("bounce@example.com");
  });

  it("suppresses from the Suppress button without opening the row", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onSuppress = vi.fn();
    render(
      <ReviewTable
        list="recommended"
        onOpen={onOpen}
        onSuppress={onSuppress}
        rows={ROWS}
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Suppress bounce@example.com" })
    );
    expect(onSuppress).toHaveBeenCalledTimes(1);
    expect(onSuppress.mock.calls[0][0].address).toBe("bounce@example.com");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
