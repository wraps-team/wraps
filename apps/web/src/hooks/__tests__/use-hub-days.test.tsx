/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const search = { value: "" };

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}));

import { useHubDays } from "../use-hub-days";

function Probe() {
  return <span data-testid="days">{useHubDays()}</span>;
}

describe("useHubDays", () => {
  afterEach(() => {
    cleanup();
    search.value = "";
  });

  it("returns 30 when the URL has no days", () => {
    render(<Probe />);
    expect(screen.getByTestId("days")).toHaveTextContent("30");
  });

  it("returns the value from ?days=", () => {
    search.value = "days=7";
    render(<Probe />);
    expect(screen.getByTestId("days")).toHaveTextContent("7");
  });

  it("returns 30 for an unrecognised value", () => {
    search.value = "days=bogus";
    render(<Probe />);
    expect(screen.getByTestId("days")).toHaveTextContent("30");
  });
});
