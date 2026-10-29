import { describe, expect, it, vi } from "vitest";

// next/navigation's redirect() throws; surface its target so the test can
// assert on it.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import AnalyticsPage from "../page";

async function redirectTarget(query: Record<string, string>) {
  try {
    await AnalyticsPage({
      params: Promise.resolve({ orgSlug: "acme" }),
      searchParams: Promise.resolve(query),
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a redirect");
}

describe("analytics redirect", () => {
  it("sends a windowed link to the Deliverability tab with that window", async () => {
    expect(await redirectTarget({ days: "7" })).toBe(
      "REDIRECT:/acme/emails?tab=deliverability&days=7"
    );
  });

  it("drops an unrecognised window to the default", async () => {
    expect(await redirectTarget({ days: "bogus" })).toBe(
      "REDIRECT:/acme/emails?tab=deliverability"
    );
  });

  it("sends a bare link to the Deliverability tab", async () => {
    expect(await redirectTarget({})).toBe(
      "REDIRECT:/acme/emails?tab=deliverability"
    );
  });
});
