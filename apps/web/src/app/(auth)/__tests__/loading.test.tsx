/**
 * (auth) segment — loading boundary
 *
 * Plan 225 gave the auth group its own `loading.tsx` in place of the retired
 * root full-screen loader, so this fallback renders inside `(auth)/layout.tsx`'s
 * centred card frame instead of blanking the whole viewport.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Loader from "@/components/loader";
import AuthLoading from "../loading";

afterEach(() => {
  cleanup();
});

describe("AuthLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<AuthLoading />)).not.toThrow();
  });

  it("renders an accessible status region announcing the wait", () => {
    render(<AuthLoading />);
    // <output> is an implicit `status` live region (loader.tsx's own
    // comment cites WCAG 4.1.3); "status" is not a name-from-content ARIA
    // role, so the sr-only label is asserted via text content rather than
    // the computed accessible name, which is empty for this element.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading...");
  });

  it("does not render a full-viewport container", () => {
    const { container } = render(<AuthLoading />);
    expect(container.querySelector(".min-h-dvh")).toBeNull();
    cleanup();

    // Teeth: the same component with `fullScreen` really does render that
    // container, so the assertion above is a distinction and not a broken
    // selector.
    const full = render(<Loader fullScreen />);
    expect(full.container.querySelector(".min-h-dvh")).not.toBeNull();
  });
});
