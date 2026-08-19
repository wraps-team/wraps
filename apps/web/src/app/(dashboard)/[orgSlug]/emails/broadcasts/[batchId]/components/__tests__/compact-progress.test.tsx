// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CompactProgress } from "../compact-progress";

afterEach(cleanup);

describe("CompactProgress", () => {
  it("renders status badge with correct label", () => {
    render(
      <CompactProgress
        completedAt={new Date("2026-02-22T09:06:50Z")}
        processedRecipients={12_500}
        sent={12_500}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="completed"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByText("Completed")).toBeTruthy();
  });

  it("shows progress bar and count when processing", () => {
    render(
      <CompactProgress
        completedAt={null}
        processedRecipients={6250}
        sent={6250}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="processing"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByText(/6,250/)).toBeTruthy();
    expect(screen.getByText(/12,500/)).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("shows Sending status with spinner when processing", () => {
    render(
      <CompactProgress
        completedAt={null}
        processedRecipients={6250}
        sent={6250}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="processing"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByText("Sending")).toBeTruthy();
  });

  it("hides progress bar when completed", () => {
    const { container } = render(
      <CompactProgress
        completedAt={new Date("2026-02-22T09:06:50Z")}
        processedRecipients={12_500}
        sent={12_500}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="completed"
        totalRecipients={12_500}
      />
    );
    // Progress bar uses data-slot="progress"
    expect(container.querySelector("[data-slot='progress']")).toBeNull();
  });

  it("shows duration for completed batches", () => {
    render(
      <CompactProgress
        completedAt={new Date("2026-02-22T09:06:50Z")}
        processedRecipients={12_500}
        sent={12_500}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="completed"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByText(/30m/)).toBeTruthy();
  });

  it("shows refresh button", () => {
    render(
      <CompactProgress
        completedAt={new Date("2026-02-22T09:06:50Z")}
        processedRecipients={12_500}
        sent={12_500}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="completed"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy();
  });

  it("renders the normal Processing label when pausedReason is null (regression guard)", () => {
    render(
      <CompactProgress
        completedAt={null}
        pausedReason={null}
        processedRecipients={6250}
        sent={6250}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="processing"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByText("Sending")).toBeTruthy();
    expect(screen.queryByText(/Paused/)).toBeNull();
  });

  it("renders a paused badge and the transactional-reserve explanation for quota_reserve", () => {
    render(
      <CompactProgress
        completedAt={null}
        pausedReason="quota_reserve"
        processedRecipients={6250}
        sent={6250}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="processing"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByText(/Paused/)).toBeTruthy();
    expect(
      screen.getByText(/transactional email keeps its reserved quota/)
    ).toBeTruthy();
    expect(screen.queryByText(/24-hour quota/)).toBeNull();
  });

  it("renders the daily-quota explanation for daily_quota, not the reserve wording", () => {
    render(
      <CompactProgress
        completedAt={null}
        pausedReason="daily_quota"
        processedRecipients={6250}
        sent={6250}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="processing"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByText(/Paused/)).toBeTruthy();
    expect(screen.getByText(/24-hour quota/)).toBeTruthy();
    expect(
      screen.queryByText(/transactional email keeps its reserved quota/)
    ).toBeNull();
  });

  it("renders a generic Paused badge for an unknown pausedReason instead of crashing", () => {
    render(
      <CompactProgress
        completedAt={null}
        pausedReason="something_new"
        processedRecipients={6250}
        sent={6250}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="processing"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByText("Paused")).toBeTruthy();
  });

  it("never shows paused for a terminal batch, even with a stale non-null pausedReason", () => {
    render(
      <CompactProgress
        completedAt={new Date("2026-02-22T09:06:50Z")}
        pausedReason="daily_quota"
        processedRecipients={12_500}
        sent={12_500}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="completed"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByText(/Paused/)).toBeNull();
  });

  it("does not present a zero-send completed batch as plain success", () => {
    render(
      <CompactProgress
        completedAt={new Date("2026-02-22T09:06:50Z")}
        processedRecipients={0}
        sent={0}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="completed"
        totalRecipients={1200}
      />
    );
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.getByText("Completed — nothing sent")).toBeTruthy();
  });

  it("is unaffected by sent while paused — the two presentations never collide", () => {
    render(
      <CompactProgress
        completedAt={null}
        pausedReason="daily_quota"
        processedRecipients={0}
        sent={0}
        startedAt={new Date("2026-02-22T08:36:50Z")}
        status="processing"
        totalRecipients={12_500}
      />
    );
    expect(screen.getByText(/Paused/)).toBeTruthy();
    expect(screen.queryByText(/nothing sent/)).toBeNull();
  });
});

describe("CompactProgress — auto-refresh and announcements", () => {
  const baseProps = {
    completedAt: null,
    processedRecipients: 100,
    sent: 100,
    startedAt: new Date("2026-02-22T08:36:50Z"),
    totalRecipients: 1000,
  };

  it("starts polling when a scheduled broadcast transitions to processing (L1)", () => {
    const { rerender } = render(
      <CompactProgress {...baseProps} status="scheduled" />
    );
    expect(screen.queryByText(/Auto-refreshing/i)).toBeNull();

    // Auto-refresh used to latch at mount and only ever turn off, so this
    // transition left the page frozen for the whole send.
    rerender(<CompactProgress {...baseProps} status="processing" />);
    expect(screen.getByText(/Auto-refreshing/i)).toBeTruthy();
  });

  it("stops polling once the broadcast reaches a terminal status", () => {
    const { rerender } = render(
      <CompactProgress {...baseProps} status="processing" />
    );
    expect(screen.getByText(/Auto-refreshing/i)).toBeTruthy();

    rerender(<CompactProgress {...baseProps} status="completed" />);
    expect(screen.queryByText(/Auto-refreshing/i)).toBeNull();
  });

  it("announces progress to screen readers while sending (L3)", () => {
    render(<CompactProgress {...baseProps} status="processing" />);

    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toContain("100 / 1,000 processed");
  });
});
