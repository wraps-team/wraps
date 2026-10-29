import { describe, expect, it } from "vitest";
import {
  HUB_DEFAULT_DAYS,
  hubHref,
  parseHubDays,
  parseHubTab,
} from "../emails-hub";

describe("parseHubTab", () => {
  it("falls back to activity when absent, unknown, or repeated", () => {
    expect(parseHubTab(undefined)).toBe("activity");
    expect(parseHubTab(null)).toBe("activity");
    expect(parseHubTab("bogus")).toBe("activity");
    expect(parseHubTab(["engagement", "deliverability"])).toBe("activity");
  });

  it("accepts each tab", () => {
    expect(parseHubTab("activity")).toBe("activity");
    expect(parseHubTab("engagement")).toBe("engagement");
    expect(parseHubTab("deliverability")).toBe("deliverability");
  });
});

describe("parseHubDays", () => {
  it("accepts the four windows exactly", () => {
    expect(parseHubDays("1")).toBe(1);
    expect(parseHubDays("7")).toBe(7);
    expect(parseHubDays("30")).toBe(30);
    expect(parseHubDays("90")).toBe(90);
  });

  it("defaults to 30 for anything else", () => {
    expect(HUB_DEFAULT_DAYS).toBe(30);
    expect(parseHubDays("0")).toBe(30);
    expect(parseHubDays("365")).toBe(30);
    expect(parseHubDays("abc")).toBe(30);
    expect(parseHubDays(" 7")).toBe(30);
    expect(parseHubDays(["7"])).toBe(30);
    expect(parseHubDays(null)).toBe(30);
    expect(parseHubDays(undefined)).toBe(30);
  });
});

describe("hubHref", () => {
  it("omits tab and days at their defaults", () => {
    expect(hubHref("acme")).toBe("/acme/emails");
    expect(hubHref("acme", { tab: "activity", days: 30 })).toBe("/acme/emails");
  });

  it("includes a non-default tab and window", () => {
    expect(hubHref("acme", { tab: "engagement", days: 7 })).toBe(
      "/acme/emails?tab=engagement&days=7"
    );
    expect(hubHref("acme", { tab: "deliverability", days: 30 })).toBe(
      "/acme/emails?tab=deliverability"
    );
    expect(hubHref("acme", { days: 7 })).toBe("/acme/emails?days=7");
  });

  it("appends extra params after tab and days, in order", () => {
    expect(
      hubHref("acme", {
        tab: "activity",
        days: 7,
        extra: { status: "bounced", q: "a@b.c" },
      })
    ).toBe("/acme/emails?days=7&status=bounced&q=a%40b.c");
  });
});
