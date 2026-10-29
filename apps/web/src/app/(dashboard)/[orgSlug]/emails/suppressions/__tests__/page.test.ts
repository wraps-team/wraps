import { describe, expect, it, vi } from "vitest";

// next/navigation's redirect() throws; surface its target so the test can
// assert on it.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import SuppressionsPage from "../page";

describe("suppressions redirect", () => {
  it("sends the old Suppression List to the Suppressed list on the hub", async () => {
    let target = "";
    try {
      await SuppressionsPage({
        params: Promise.resolve({ orgSlug: "acme" }),
      });
    } catch (error) {
      target = error instanceof Error ? error.message : String(error);
    }
    expect(target).toBe(
      "REDIRECT:/acme/emails?tab=deliverability&list=suppressed"
    );
  });
});
