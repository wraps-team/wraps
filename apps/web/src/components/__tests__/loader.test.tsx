/**
 * Loader — the full-screen spinner that replaces whole pages.
 *
 * It stands in for the entire page while a query is in flight, so if it
 * announces nothing a screen-reader user is told nothing at all.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loader from "../loader";

describe("Loader", () => {
  it("announces itself as a live status with visually hidden text", () => {
    render(<Loader fullScreen />);

    // A `role="status"` region is announced by its *contents*, so the hidden
    // label — not a name — is what a screen-reader user actually hears.
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });
});
