/**
 * LiveRefreshToggle Tests
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveRefreshToggle } from "../live-refresh-toggle";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  refresh.mockClear();
});

describe("LiveRefreshToggle", () => {
  it("refreshes on the unfiltered first page", () => {
    vi.useFakeTimers();
    render(<LiveRefreshToggle params={{}} />);

    vi.advanceTimersByTime(35_000);

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("never refreshes a filtered view", () => {
    vi.useFakeTimers();
    render(<LiveRefreshToggle params={{ search: "signup" }} />);

    vi.advanceTimersByTime(60_000);

    expect(refresh).not.toHaveBeenCalled();
    expect(
      screen.getByText("Live updates pause while filtered")
    ).toBeInTheDocument();
  });

  it("stops when toggled off", () => {
    vi.useFakeTimers();
    render(<LiveRefreshToggle params={{}} />);

    fireEvent.click(screen.getByRole("switch"));
    refresh.mockClear();
    vi.advanceTimersByTime(60_000);

    expect(refresh).not.toHaveBeenCalled();
  });

  it("clears the interval on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = render(<LiveRefreshToggle params={{}} />);

    unmount();
    refresh.mockClear();
    vi.advanceTimersByTime(60_000);

    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops polling when the tab is hidden", () => {
    vi.useFakeTimers();
    render(<LiveRefreshToggle params={{}} />);

    const visibilitySpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    try {
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      refresh.mockClear();
      vi.advanceTimersByTime(60_000);

      expect(refresh).not.toHaveBeenCalled();
    } finally {
      visibilitySpy.mockRestore();
    }
  });
});
