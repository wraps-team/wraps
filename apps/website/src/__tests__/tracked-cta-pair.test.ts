// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/utils/analytics", () => ({ trackEvent }));

import { TrackedCtaPair } from "@/components/tracked-cta-pair";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TrackedCtaPair", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    trackEvent.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      createRoot(container).render(
        createElement(TrackedCtaPair, {
          location: "test_location",
          secondary: { label: "See plans", href: "/#pricing" },
        })
      );
    });
  });

  afterEach(() => container.remove());

  it("renders the signup link and the secondary link", () => {
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Start free", "https://app.wraps.dev/auth?mode=signup"],
      ["See plans", "/#pricing"],
    ]);
  });

  it("reports each click as cta_click with the label and location", () => {
    for (const a of container.querySelectorAll("a")) {
      // Stop jsdom navigating; React still sees the click.
      a.addEventListener("click", (e) => e.preventDefault());
      act(() => {
        a.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
      });
    }
    expect(trackEvent.mock.calls).toEqual([
      ["cta_click", { location: "test_location", cta_text: "Start free" }],
      ["cta_click", { location: "test_location", cta_text: "See plans" }],
    ]);
  });
});
