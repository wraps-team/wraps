/**
 * LiveRefreshToggle SSR Tests
 *
 * `LiveRefreshToggle` is a client component, but the App Router still
 * server-renders client components to produce the initial HTML — there is no
 * `document` there. A `useState` initializer that reads `document` runs
 * during that render and crashes the whole page. This guards against that
 * regression by rendering through `react-dom/server` in a real node
 * environment with no DOM at all.
 *
 * @vitest-environment node
 */

import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LiveRefreshToggle } from "../live-refresh-toggle";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("LiveRefreshToggle SSR", () => {
  it("renders server-side with no DOM available", () => {
    // Proves this test is actually exercising a DOM-less environment and
    // cannot silently pass under jsdom.
    expect(typeof document).toBe("undefined");

    const html = renderToString(<LiveRefreshToggle params={{}} />);

    expect(html).toContain("Live");
  });
});
