import { describe, expect, it, vi } from "vitest";

// next/navigation's redirect() throws; surface its target so the test can
// assert on it.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import DrilldownPage from "../page";

async function redirectTarget(query: Record<string, string>) {
  try {
    await DrilldownPage({
      params: Promise.resolve({ orgSlug: "acme" }),
      searchParams: Promise.resolve(query),
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a redirect");
}

describe("drilldown redirect", () => {
  it("maps reasons with the day and window onto the Deliverability drive", async () => {
    expect(
      await redirectTarget({
        metric: "complaint",
        days: "7",
        day: "2026-10-22",
        tz: "UTC",
        tab: "reasons",
      })
    ).toBe(
      "REDIRECT:/acme/emails?tab=deliverability&days=7&metric=complaint&drive=reasons&day=2026-10-22"
    );
  });

  it("maps the addresses tab to the recommended list", async () => {
    expect(await redirectTarget({ metric: "bounce", tab: "addresses" })).toBe(
      "REDIRECT:/acme/emails?tab=deliverability&metric=bounce&list=recommended"
    );
  });

  it("sends a bare link to the Deliverability tab", async () => {
    expect(await redirectTarget({})).toBe(
      "REDIRECT:/acme/emails?tab=deliverability"
    );
  });
});
