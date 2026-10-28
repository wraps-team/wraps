import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_FLOOR,
  type AttributionCounts,
  type AttributionInputGroup,
  attributionRowToInput,
  BELOW_FLOOR_LIMIT,
  RANKED_LIMIT,
  rankAttribution,
  sumCounts,
} from "../analytics-drilldown-rank";

function counts(partial: Partial<AttributionCounts>): AttributionCounts {
  return {
    sent: 0,
    bounced: 0,
    permanent: 0,
    transient: 0,
    undetermined: 0,
    complained: 0,
    suppressed: 0,
    ...partial,
  };
}

function group(
  key: string | null,
  c: Partial<AttributionCounts>,
  label: string | null = key
): AttributionInputGroup {
  return { key, label, sourceTypes: ["batch"], ...counts(c) };
}

describe("ATTRIBUTION_FLOOR", () => {
  it("is 100 for bounce and suppression and 1000 for complaint", () => {
    expect(ATTRIBUTION_FLOOR).toEqual({
      bounce: 100,
      suppression: 100,
      complaint: 1000,
    });
  });
});

describe("rankAttribution", () => {
  it("ranks eligible groups by excess events over the window rate", () => {
    // Window rate: 60 events / 1000 sends = 6%.
    const groups = [
      group("at-rate", { sent: 400, bounced: 24 }), // expected 24, excess 0
      group("hot", { sent: 300, bounced: 30 }), // expected 18, excess +12
      group("warm", { sent: 300, bounced: 6 }), // expected 18, excess -12
    ];
    const r = rankAttribution(groups, sumCounts(groups), "bounce");
    expect(r.ranked.map((g) => g.key)).toEqual(["hot", "at-rate", "warm"]);
    expect(r.ranked[0].excess).toBe(12);
    expect(r.ranked[1].excess).toBe(0);
    expect(r.ranked[2].excess).toBe(-12);
  });

  it("ranks a 50,000-send group with the largest raw count below a group far above the window rate", () => {
    // A 3-send group at 100% has the highest rate but is below the floor.
    // The 50,000-send group has the largest raw count (1000) but sits under
    // the window rate (~2.5%), so its excess is negative. The 500-send group
    // is the real cause.
    const groups = [
      group("tiny", { sent: 3, bounced: 3 }),
      group("big-normal", { sent: 50_000, bounced: 1000 }), // 2%
      group("bad-list", { sent: 500, bounced: 250 }), // 50%
    ];
    const r = rankAttribution(groups, sumCounts(groups), "bounce");
    expect(r.ranked.map((g) => g.key)).toEqual(["bad-list", "big-normal"]);
    expect(r.belowFloor.map((g) => g.key)).toEqual(["tiny"]);
    // Raw count would have put big-normal first. Excess puts bad-list first.
    expect(r.ranked[0].excess).toBeGreaterThan(0);
    expect(r.ranked[1].excess).toBeLessThan(0);
  });

  it("puts groups under the floor in belowFloor and never drops them", () => {
    const groups = [
      group("eligible", { sent: 500, bounced: 5 }),
      group("small-a", { sent: 10, bounced: 1 }),
      group("small-b", { sent: 99, bounced: 0 }),
      group(null, { sent: 20, bounced: 20 }),
    ];
    const r = rankAttribution(groups, sumCounts(groups), "bounce");
    expect(r.ranked.map((g) => g.key)).toEqual(["eligible"]);
    expect(r.belowFloor.map((g) => g.key).sort()).toEqual(
      ["small-a", "small-b", null].sort()
    );
    expect(r.ranked.length + r.belowFloor.length + r.omitted.groups).toBe(
      groups.length
    );
  });

  it("uses the 1000-send floor for complaints and the 100-send floor for bounces", () => {
    const groups = [group("mid", { sent: 500, bounced: 5, complained: 5 })];
    const bounce = rankAttribution(groups, sumCounts(groups), "bounce");
    expect(bounce.ranked.map((g) => g.key)).toEqual(["mid"]);
    const complaint = rankAttribution(groups, sumCounts(groups), "complaint");
    expect(complaint.ranked).toEqual([]);
    expect(complaint.belowFloor.map((g) => g.key)).toEqual(["mid"]);
    expect(complaint.belowFloor[0].eligible).toBe(false);
  });

  it("uses events for the chosen metric, not the other two counts", () => {
    const groups = [
      group("a", { sent: 200, bounced: 0, complained: 4, suppressed: 0 }),
      group("b", { sent: 200, bounced: 10, complained: 0, suppressed: 0 }),
    ];
    const byBounce = rankAttribution(groups, sumCounts(groups), "bounce");
    expect(byBounce.ranked[0].key).toBe("b");
    const bySuppression = rankAttribution(
      groups,
      sumCounts(groups),
      "suppression"
    );
    expect(bySuppression.ranked.every((g) => g.events === 0)).toBe(true);
  });

  it("excess sums to zero across all groups, within rounding", () => {
    const groups = [
      group("a", { sent: 1234, bounced: 37 }),
      group("b", { sent: 987, bounced: 2 }),
      group("c", { sent: 4321, bounced: 200 }),
      group("d", { sent: 150, bounced: 9 }),
    ];
    const r = rankAttribution(groups, sumCounts(groups), "bounce");
    const all = [...r.ranked, ...r.belowFloor];
    const total = all.reduce((acc, g) => acc + g.excess, 0);
    // Each excess is rounded to 2 dp on output, so allow 0.005 per group.
    expect(Math.abs(total)).toBeLessThan(0.005 * all.length + 1e-9);
  });

  it("caps ranked at 100 and belowFloor at 200 and sums the rest into omitted", () => {
    const eligible: AttributionInputGroup[] = Array.from(
      { length: RANKED_LIMIT + 5 },
      (_, i) => group(`e-${i}`, { sent: 100, bounced: i % 7 })
    );
    const small: AttributionInputGroup[] = Array.from(
      { length: BELOW_FLOOR_LIMIT + 3 },
      (_, i) => group(`s-${i}`, { sent: 1 + (i % 50), bounced: 0 })
    );
    const groups = [...eligible, ...small];
    const totals = sumCounts(groups);
    const r = rankAttribution(groups, totals, "bounce");

    expect(r.ranked).toHaveLength(RANKED_LIMIT);
    expect(r.belowFloor).toHaveLength(BELOW_FLOOR_LIMIT);
    // 5 eligible overflow + 3 below-floor overflow.
    expect(r.omitted.groups).toBe(5 + 3);

    const sumFields = (rows: { sent: number; bounced: number }[]) =>
      rows.reduce(
        (acc, g) => ({
          sent: acc.sent + g.sent,
          bounced: acc.bounced + g.bounced,
        }),
        { sent: 0, bounced: 0 }
      );
    const listed = sumFields([...r.ranked, ...r.belowFloor]);
    expect(listed.sent + r.omitted.sent).toBe(totals.sent);
    expect(listed.bounced + r.omitted.bounced).toBe(totals.bounced);
    expect(
      r.omitted.permanent + sumCounts(r.ranked.concat(r.belowFloor)).permanent
    ).toBe(totals.permanent);
  });

  it("breaks excess ties by sent volume, then by key with nulls last", () => {
    // Window rate is exactly 10%. Every group sits at it, so every excess is 0.
    const groups = [
      group("beta", { sent: 200, bounced: 20 }),
      group("alpha", { sent: 200, bounced: 20 }),
      group("big", { sent: 500, bounced: 50 }),
      group(null, { sent: 300, bounced: 30 }),
    ];
    const r = rankAttribution(groups, sumCounts(groups), "bounce");
    expect(r.ranked.map((g) => g.key)).toEqual(["big", null, "alpha", "beta"]);
  });

  it("returns rate null and eligible false for a group with zero sent", () => {
    const groups = [
      group("real", { sent: 500, bounced: 5 }),
      group("empty", { sent: 0, bounced: 0 }),
    ];
    const r = rankAttribution(groups, sumCounts(groups), "bounce");
    const empty = [...r.ranked, ...r.belowFloor].find((g) => g.key === "empty");
    expect(empty).toBeDefined();
    expect(empty?.rate).toBeNull();
    expect(empty?.eligible).toBe(false);
  });

  it("returns rate and share rounded to 2 dp, and share null when the window has no events", () => {
    const groups = [
      group("a", { sent: 300, bounced: 1 }),
      group("b", { sent: 300, bounced: 2 }),
    ];
    const r = rankAttribution(groups, sumCounts(groups), "bounce");
    const a = r.ranked.find((g) => g.key === "a");
    expect(a?.rate).toBe(0.33);
    expect(a?.share).toBe(33.33);

    const quiet = [group("q", { sent: 500, bounced: 0 })];
    const q = rankAttribution(quiet, sumCounts(quiet), "bounce");
    expect(q.ranked[0].share).toBeNull();
    expect(q.ranked[0].excess).toBe(0);
  });
});

describe("attributionRowToInput", () => {
  it("maps the repository aggregate names onto the response counts", () => {
    const input = attributionRowToInput({
      key: "b1",
      label: "Spring",
      sourceTypes: ["batch", null],
      sent: 10,
      bounced: 3,
      bouncedPermanent: 1,
      bouncedTransient: 1,
      bouncedUndetermined: 1,
      complained: 2,
      suppressed: 4,
    });
    expect(input).toEqual({
      key: "b1",
      label: "Spring",
      sourceTypes: ["batch"],
      sent: 10,
      bounced: 3,
      permanent: 1,
      transient: 1,
      undetermined: 1,
      complained: 2,
      suppressed: 4,
    });
  });
});
