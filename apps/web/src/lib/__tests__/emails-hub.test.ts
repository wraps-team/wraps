import { describe, expect, it } from "vitest";
import {
  HUB_DEFAULT_DAYS,
  hubHref,
  mapDrilldownParams,
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

  it("skips empty and undefined extra values", () => {
    expect(
      hubHref("acme", {
        tab: "deliverability",
        extra: { metric: undefined, drive: "", list: "suppressed" },
      })
    ).toBe("/acme/emails?tab=deliverability&list=suppressed");
  });
});

describe("mapDrilldownParams", () => {
  it("returns nothing for no params", () => {
    expect(mapDrilldownParams({})).toEqual({
      metric: undefined,
      drive: undefined,
      day: undefined,
      list: undefined,
      "sends.by": undefined,
    });
  });

  it("keeps each known metric and drops unknown ones", () => {
    expect(mapDrilldownParams({ metric: "bounce" }).metric).toBe("bounce");
    expect(mapDrilldownParams({ metric: "complaint" }).metric).toBe(
      "complaint"
    );
    expect(mapDrilldownParams({ metric: "suppression" }).metric).toBe(
      "suppression"
    );
    expect(mapDrilldownParams({ metric: "opens" }).metric).toBeUndefined();
    expect(
      mapDrilldownParams({ metric: ["bounce", "complaint"] }).metric
    ).toBeUndefined();
  });

  it("maps the sends tab and absent tab to the default causes drive", () => {
    expect(mapDrilldownParams({ tab: "sends" }).drive).toBeUndefined();
    expect(mapDrilldownParams({}).drive).toBeUndefined();
  });

  it("maps reasons to drive=reasons and timeline to drive=changes", () => {
    expect(mapDrilldownParams({ tab: "reasons" }).drive).toBe("reasons");
    expect(mapDrilldownParams({ tab: "timeline" }).drive).toBe("changes");
  });

  it("maps addresses to the recommended list", () => {
    expect(mapDrilldownParams({ tab: "addresses" }).list).toBe("recommended");
  });

  it("ignores an unknown tab", () => {
    const mapped = mapDrilldownParams({ tab: "bogus" });
    expect(mapped.drive).toBeUndefined();
    expect(mapped.list).toBeUndefined();
  });

  it("keeps a well-formed day and drops anything else", () => {
    expect(mapDrilldownParams({ day: "2026-10-22" }).day).toBe("2026-10-22");
    expect(mapDrilldownParams({ day: "2026-10-2" }).day).toBeUndefined();
    expect(mapDrilldownParams({ day: "22/10/2026" }).day).toBeUndefined();
    expect(mapDrilldownParams({ day: "" }).day).toBeUndefined();
  });

  it("keeps each sends.by value and drops unknown ones", () => {
    for (const by of ["broadcast", "workflow", "template", "from"]) {
      expect(mapDrilldownParams({ "sends.by": by })["sends.by"]).toBe(by);
    }
    expect(
      mapDrilldownParams({ "sends.by": "campaign" })["sends.by"]
    ).toBeUndefined();
  });

  it("drops tz", () => {
    expect(mapDrilldownParams({ tz: "UTC" })).not.toHaveProperty("tz");
  });
});
