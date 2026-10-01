/**
 * useHydrated Tests
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { useHydrated } from "../use-hydrated";

function Probe() {
  return <span data-testid="probe">{String(useHydrated())}</span>;
}

describe("useHydrated", () => {
  afterEach(cleanup);

  it("is false in server render", () => {
    expect(renderToString(<Probe />)).toContain(">false<");
  });

  it("is true after a client render", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("true");
  });
});
