/**
 * The hub header owns the page's one range and one refresh. These pin what a
 * click does to the URL, which caches are expired, and what gets announced.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/acme/emails",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const invalidateQueries = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

const refreshEmailChart = vi.fn();
const refreshAnalyticsCache = vi.fn();

vi.mock("@/actions/analytics", () => ({
  refreshEmailChart: (...args: unknown[]) => refreshEmailChart(...args),
  refreshAnalyticsCache: (...args: unknown[]) => refreshAnalyticsCache(...args),
}));

import { EmailsHubHeader } from "../emails-hub-header";

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  invalidateQueries.mockClear();
  refreshEmailChart.mockReset();
  refreshAnalyticsCache.mockReset();
  refreshEmailChart.mockResolvedValue({ ok: true, refreshedAt: 1 });
  refreshAnalyticsCache.mockResolvedValue({ ok: true, refreshedAt: 1 });
});

afterEach(cleanup);

describe("EmailsHubHeader", () => {
  it("renders the page heading", () => {
    render(<EmailsHubHeader orgSlug="acme" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Emails" })
    ).toBeInTheDocument();
  });

  it("marks 30 days as the default selection", () => {
    render(<EmailsHubHeader orgSlug="acme" />);

    expect(screen.getByRole("button", { name: "30d" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "7d" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("writes the new window to the URL and keeps the other filters", async () => {
    nav.search = "days=30&status=bounced";
    render(<EmailsHubHeader orgSlug="acme" />);

    await userEvent.click(screen.getByRole("button", { name: "7d" }));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    const [url, options] = nav.replace.mock.calls[0];
    const next = new URL(url, "https://app.test");
    expect(next.pathname).toBe("/acme/emails");
    expect(next.searchParams.get("days")).toBe("7");
    expect(next.searchParams.get("status")).toBe("bounced");
    expect(options).toEqual({ scroll: false });
  });

  it("expires both server caches, then invalidates both query keys, and announces success", async () => {
    render(<EmailsHubHeader orgSlug="acme" />);

    const [refresh] = screen.getAllByRole("button", { name: "Refresh data" });
    await userEvent.click(refresh);

    await waitFor(() =>
      expect(screen.getByText("Data refreshed.")).toBeInTheDocument()
    );
    expect(refreshEmailChart).toHaveBeenCalledWith("acme");
    expect(refreshAnalyticsCache).toHaveBeenCalledWith("acme");
    expect(refreshEmailChart.mock.invocationCallOrder[0]).toBeLessThan(
      refreshAnalyticsCache.mock.invocationCallOrder[0]
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["emails", "acme"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["analytics"],
    });
  });

  it("keeps the refresh button focusable through a refresh", async () => {
    render(<EmailsHubHeader orgSlug="acme" />);

    const [refresh] = screen.getAllByRole("button", { name: "Refresh data" });
    await userEvent.click(refresh);

    expect(refresh).not.toBeDisabled();
    await waitFor(() =>
      expect(screen.getByText("Data refreshed.")).toBeInTheDocument()
    );
  });

  it("says so when a cache refresh failed", async () => {
    refreshEmailChart.mockResolvedValue({ ok: false, reason: "error" });
    render(<EmailsHubHeader orgSlug="acme" />);

    await userEvent.click(
      screen.getAllByRole("button", { name: "Refresh data" })[0]
    );

    await waitFor(() =>
      expect(screen.getByText("Could not refresh data.")).toBeInTheDocument()
    );
  });

  it("treats a cooldown as a refresh that already happened, not a failure", async () => {
    refreshEmailChart.mockResolvedValue({ ok: false, reason: "cooldown" });
    render(<EmailsHubHeader orgSlug="acme" />);

    await userEvent.click(
      screen.getAllByRole("button", { name: "Refresh data" })[0]
    );

    await waitFor(() =>
      expect(screen.getByText("Data refreshed.")).toBeInTheDocument()
    );
  });
});
